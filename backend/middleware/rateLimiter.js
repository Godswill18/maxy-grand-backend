/**
 * Rate Limiter Middleware — Maxy Grand Hotel
 * ==========================================
 * Two layers of protection:
 *
 *  Layer 1 — Abuse Shield (abuseShield)
 *    Applied BEFORE body parsing in index.js so large POST bodies cannot
 *    exhaust memory before this check runs.
 *    Sliding window: 60 requests per 10 seconds per IP.
 *    Progressive lockout: 1 min → 5 min → 30 min → 1 hr.
 *
 *  Layer 2 — Endpoint Rate Limiters (createRateLimiter)
 *    Applied per-route after body parsing.
 *    Sliding window using Redis sorted sets (atomic via Lua).
 *    Falls back to in-memory Map when Redis is unavailable.
 *    Role-based limit multipliers.
 *
 * Store      : Redis (primary) → in-memory Map (fallback, single-process)
 * IP isolation: Every key includes the client IP — only the offending IP
 *               is blocked; all other users are completely unaffected.
 */

import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { v4 as uuid } from 'uuid';
import redis from '../config/redisClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const LOGS_DIR   = path.join(__dirname, '../logs');
const VIOLATION_LOG = 'rateLimitViolations.log';

// ─── Role Multipliers ──────────────────────────────────────────────────────────
const ROLE_MULTIPLIERS = {
    superadmin:   0,    // unlimited
    admin:        10,
    receptionist: 5,
    headWaiter:   5,
    waiter:       5,
    cleaner:      5,
    user:         2,
    guest:        1,
};

// ─── Lua: Endpoint sliding-window ─────────────────────────────────────────────
const SLIDING_WINDOW_LUA = `
local key        = KEYS[1]
local now        = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local lim        = tonumber(ARGV[3])
local req_id     = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
local count = redis.call('ZCARD', key)

if count < lim then
    redis.call('ZADD', key, now, req_id)
    redis.call('PEXPIRE', key, window_ms + 1000)
    return {1, lim - count - 1, count + 1, 0}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_ms = window_ms
    if oldest and #oldest >= 2 then
        retry_ms = math.max(0, tonumber(oldest[2]) + window_ms - now)
    end
    return {0, 0, count, math.ceil(retry_ms / 1000)}
end
`;

// ─── Lua: Abuse Shield (burst detection + progressive lockout) ─────────────────
// KEYS[1] = abuse:locked:{ip}   KEYS[2] = abuse:burst:{ip}   KEYS[3] = abuse:offenses:{ip}
// ARGV[1] = now_ms   ARGV[2] = window_ms   ARGV[3] = burst_limit   ARGV[4] = req_id
// Returns: [allowed(1|0), lockout_ttl_or_0, offense_count]
const ABUSE_SHIELD_LUA = `
local now       = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local burst_lim = tonumber(ARGV[3])

-- 1. Already locked?
if redis.call('EXISTS', KEYS[1]) == 1 then
    return {0, redis.call('TTL', KEYS[1]), 0}
end

-- 2. Sliding-window burst count
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, now - window_ms)
local count = redis.call('ZCARD', KEYS[2])

if count >= burst_lim then
    -- Progressive lockout: 60s → 5min → 30min → 1hr
    local offenses = redis.call('INCR', KEYS[3])
    redis.call('EXPIRE', KEYS[3], 86400)

    local lockout = 60
    if     offenses == 2 then lockout = 300
    elseif offenses == 3 then lockout = 1800
    elseif offenses >= 4 then lockout = 3600
    end

    redis.call('SET', KEYS[1], tostring(offenses), 'EX', lockout)
    return {0, lockout, offenses}
end

-- 3. Allowed — record this request
redis.call('ZADD', KEYS[2], now, ARGV[4])
redis.call('PEXPIRE', KEYS[2], window_ms + 1000)
return {1, 0, 0}
`;

// ─── In-Memory Fallback: Endpoint Rate Limiter ────────────────────────────────
const memStore = new Map(); // key -> number[] (timestamps)

setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, ts] of memStore) {
        if (!ts.length || ts[ts.length - 1] < cutoff) memStore.delete(key);
    }
}, 5 * 60 * 1000).unref();

function memoryCheck(key, windowMs, limit) {
    const now  = Date.now();
    let ts = (memStore.get(key) || []).filter(t => t > now - windowMs);
    const count = ts.length;
    if (count < limit) {
        ts.push(now);
        memStore.set(key, ts);
        return [1, limit - count - 1, count + 1, 0];
    }
    const retryAfter = Math.ceil((ts[0] + windowMs - now) / 1000);
    memStore.set(key, ts);
    return [0, 0, count, Math.max(1, retryAfter)];
}

// ─── In-Memory Fallback: Abuse Shield ─────────────────────────────────────────
const memAbuseBurst    = new Map(); // ip -> number[] (timestamps, 10s window)
const memAbuseLocked   = new Map(); // ip -> { expiresAt: number, lockoutSecs: number }
const memAbuseOffenses = new Map(); // ip -> { count: number, expiresAt: number }

setInterval(() => {
    const now    = Date.now();
    const cutoff = now - 15_000;
    for (const [ip, lock] of memAbuseLocked)   if (lock.expiresAt   < now)    memAbuseLocked.delete(ip);
    for (const [ip, off]  of memAbuseOffenses) if (off.expiresAt    < now)    memAbuseOffenses.delete(ip);
    for (const [ip, ts]   of memAbuseBurst)    if (!ts.length || ts[ts.length - 1] < cutoff) memAbuseBurst.delete(ip);
}, 60 * 1000).unref();

function memAbuseCheck(ip, now, windowMs, burstLimit) {
    const LOCKOUT_DURATIONS = [60, 300, 1800, 3600];

    // 1. Already locked?
    const lock = memAbuseLocked.get(ip);
    if (lock && lock.expiresAt > now) {
        return { allowed: false, lockoutSecs: Math.ceil((lock.expiresAt - now) / 1000), offenses: 0 };
    }

    // 2. Burst check
    const ts = (memAbuseBurst.get(ip) || []).filter(t => t > now - windowMs);
    if (ts.length >= burstLimit) {
        const offEntry = memAbuseOffenses.get(ip) || { count: 0, expiresAt: 0 };
        if (offEntry.expiresAt < now) offEntry.count = 0;
        offEntry.count    += 1;
        offEntry.expiresAt = now + 86_400_000; // 24 h
        memAbuseOffenses.set(ip, offEntry);

        const lockoutSecs = LOCKOUT_DURATIONS[Math.min(offEntry.count - 1, LOCKOUT_DURATIONS.length - 1)];
        memAbuseLocked.set(ip, { expiresAt: now + lockoutSecs * 1000, lockoutSecs });
        memAbuseBurst.delete(ip);
        return { allowed: false, lockoutSecs, offenses: offEntry.count };
    }

    // 3. Allowed
    ts.push(now);
    memAbuseBurst.set(ip, ts);
    return { allowed: true, lockoutSecs: 0, offenses: 0 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRetryTime(seconds) {
    if (seconds <= 0)   return 'a moment';
    if (seconds < 60)   return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    if (seconds < 3600) {
        const mins = Math.round(seconds / 60);
        return `${mins} minute${mins !== 1 ? 's' : ''}`;
    }
    const hrs = Math.round(seconds / 3600);
    return `${hrs} hour${hrs !== 1 ? 's' : ''}`;
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return (
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

function buildRedisKeys(prefix, keyType, ip, userId) {
    const keys = [];
    if (keyType === 'ip'   || keyType === 'both')           keys.push(`rl:${prefix}:ip:${ip}`);
    if ((keyType === 'user' || keyType === 'both') && userId) keys.push(`rl:${prefix}:user:${userId}`);
    if (keys.length === 0) keys.push(`rl:${prefix}:ip:${ip}`);
    return keys;
}

function pickMostRestrictive(results) {
    let worst = results[0];
    for (const r of results) {
        if (!r[0]) return r;
        if (r[1] < worst[1]) worst = r;
    }
    return worst;
}

async function writeViolationLog(entry) {
    try {
        if (!fs.existsSync(LOGS_DIR)) await fsPromises.mkdir(LOGS_DIR, { recursive: true });
        const line = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}\t${uuid()}\t${entry}\n`;
        await fsPromises.appendFile(path.join(LOGS_DIR, VIOLATION_LOG), line);
    } catch (err) {
        console.error('[RateLimit] Failed to write violation log:', err.message);
    }
}

function isRedisReady() {
    return redis && redis.status === 'ready';
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — ABUSE SHIELD
// Apply in index.js BEFORE express.json() so large POST bodies cannot
// exhaust memory before this check runs.
// ═══════════════════════════════════════════════════════════════════════════════

const ABUSE_BURST_WINDOW_MS = 10_000; // 10-second sliding window
const ABUSE_BURST_LIMIT     = 60;     // max requests per window per IP
                                      // (6 req/s average — far above any human)

/**
 * Burst/DDoS protection applied before body parsing.
 * Only /api paths are checked; static assets are ignored.
 *
 * Behaviour:
 *   Under 60 req/10s  → pass through (no impact on normal users)
 *   60+ req/10s       → 429, progressive lockout:
 *                        1st offense = 1 min
 *                        2nd offense = 5 min
 *                        3rd offense = 30 min
 *                        4th+        = 1 hr
 */
export const abuseShield = async (req, res, next) => {
    // Only guard API routes — static files, health checks etc. are not shielded
    if (!req.path.startsWith('/api')) return next();

    const ip  = getClientIp(req);
    const now = Date.now();

    try {
        let allowed, lockoutSecs, offenses;

        if (isRedisReady()) {
            const reqId  = `${now}:${Math.random().toString(36).slice(2, 9)}`;
            const result = await redis.eval(
                ABUSE_SHIELD_LUA, 3,
                `abuse:locked:${ip}`,
                `abuse:burst:${ip}`,
                `abuse:offenses:${ip}`,
                now.toString(),
                ABUSE_BURST_WINDOW_MS.toString(),
                ABUSE_BURST_LIMIT.toString(),
                reqId,
            );
            [allowed, lockoutSecs, offenses] = result;
        } else {
            ({ allowed, lockoutSecs, offenses } = memAbuseCheck(ip, now, ABUSE_BURST_WINDOW_MS, ABUSE_BURST_LIMIT));
        }

        if (!allowed) {
            res.set('Retry-After', lockoutSecs);
            res.set('X-RateLimit-Remaining', '0');

            const label = lockoutSecs >= 3600 ? '1 hour'
                        : lockoutSecs >= 1800 ? '30 minutes'
                        : lockoutSecs >= 300  ? '5 minutes'
                        :                      '60 seconds';

            writeViolationLog(
                `ABUSE_SHIELD\tip=${ip}\tlockout=${lockoutSecs}s\toffenses=${offenses}\tpath=${req.method} ${req.path}`
            ).catch(() => {});

            return res.status(429).json({
                success:    false,
                error:      'TOO_MANY_REQUESTS',
                message:    `Too many requests. Please wait ${label} before trying again.`,
                retryAfter: lockoutSecs,
            });
        }

        return next();
    } catch (err) {
        console.error('[AbuseShield] Error:', err.message);
        return next(); // Fail open — never block legitimate traffic due to our own error
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — ENDPOINT RATE LIMITER FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export const createRateLimiter = ({
    keyPrefix,
    limit,
    windowSeconds,
    keyType          = 'ip',
    message          = 'Too many requests. Please try again later.',
    bypass           = [],
    enableCaptcha    = false,
    captchaThreshold = 5,
}) => {
    const windowMs = windowSeconds * 1000;

    return async (req, res, next) => {
        const redisAvailable = isRedisReady();

        try {
            const now    = Date.now();
            const reqId  = `${now}:${Math.random().toString(36).substring(2, 9)}`;
            const ip     = getClientIp(req);
            const user   = req.user;
            const role   = user?.role || 'guest';

            if (bypass.includes(role)) return next();

            const multiplier     = ROLE_MULTIPLIERS[role] ?? 1;
            if (multiplier === 0) return next();
            const effectiveLimit = Math.ceil(limit * multiplier);

            const keys = buildRedisKeys(keyPrefix, keyType, ip, user?._id?.toString());

            let results;
            if (redisAvailable) {
                results = await Promise.all(
                    keys.map(key =>
                        redis.eval(
                            SLIDING_WINDOW_LUA, 1, key,
                            now.toString(),
                            windowMs.toString(),
                            effectiveLimit.toString(),
                            reqId,
                        )
                    )
                );
            } else {
                results = keys.map(key => memoryCheck(key, windowMs, effectiveLimit));
            }

            const [allowed, remaining, , retryAfter] = pickMostRestrictive(results);
            const resetTs = Math.ceil((now + windowMs) / 1000);

            res.set({
                'X-RateLimit-Limit':     effectiveLimit,
                'X-RateLimit-Remaining': Math.max(0, remaining),
                'X-RateLimit-Reset':     resetTs,
                'X-RateLimit-Policy':    `${effectiveLimit};w=${windowSeconds}`,
            });

            if (!allowed) {
                res.set('Retry-After', retryAfter);

                if (redisAvailable) {
                    const violationKey   = `rl:violations:ip:${ip}`;
                    const violationCount = await redis.incr(violationKey);
                    await redis.expire(violationKey, 86400);

                    await writeViolationLog(
                        `RATE_LIMIT_EXCEEDED\t` +
                        `endpoint=${keyPrefix}\tmethod=${req.method}\tpath=${req.originalUrl}\t` +
                        `ip=${ip}\tuserId=${user?._id || 'unauthenticated'}\trole=${role}\t` +
                        `limit=${effectiveLimit}/${windowSeconds}s\tviolations_24h=${violationCount}`
                    );

                    let captchaRequired = false;
                    if (enableCaptcha && violationCount >= captchaThreshold) {
                        await redis.set(`rl:captcha:ip:${ip}`, '1', 'EX', 3600);
                        captchaRequired = true;
                        res.set('X-RateLimit-Captcha', 'required');
                    }

                    return res.status(429).json({
                        success:    false,
                        error:      'RATE_LIMIT_EXCEEDED',
                        message:    `${message} Please try again in ${formatRetryTime(retryAfter)}.`,
                        retryAfter,
                        ...(captchaRequired && { captchaRequired: true }),
                    });
                }

                return res.status(429).json({
                    success:    false,
                    error:      'RATE_LIMIT_EXCEEDED',
                    message:    `${message} Please try again in ${formatRetryTime(retryAfter)}.`,
                    retryAfter,
                });
            }

            if (redisAvailable && enableCaptcha) {
                const captchaFlag = await redis.get(`rl:captcha:ip:${ip}`);
                if (captchaFlag) res.set('X-RateLimit-Captcha', 'required');
            }

            return next();
        } catch (err) {
            console.error('[RateLimit] Unexpected error:', err.message);
            return next();
        }
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-CONFIGURED ENDPOINT LIMITERS
// ═══════════════════════════════════════════════════════════════════════════════

export const loginLimiter = createRateLimiter({
    keyPrefix:        'login',
    limit:            5,
    windowSeconds:    60,
    keyType:          'ip',
    message:          'Too many login attempts.',
    bypass:           ['superadmin'],
    enableCaptcha:    true,
    captchaThreshold: 3,
});

export const signupLimiter = createRateLimiter({
    keyPrefix:        'signup',
    limit:            3,
    windowSeconds:    60,
    keyType:          'ip',
    message:          'Too many signup attempts.',
    bypass:           ['superadmin', 'admin'],
    enableCaptcha:    true,
    captchaThreshold: 3,
});

export const forgotPasswordLimiter = createRateLimiter({
    keyPrefix:        'forgot-password',
    limit:            3,
    windowSeconds:    60,
    keyType:          'ip',
    message:          'Too many password reset requests.',
    bypass:           [],
    enableCaptcha:    true,
    captchaThreshold: 2,
});

export const bookingLimiter = createRateLimiter({
    keyPrefix:     'booking',
    limit:         5,
    windowSeconds: 60,
    keyType:       'both',
    message:       'Too many booking attempts.',
    bypass:        ['superadmin'],
});

export const availabilityLimiter = createRateLimiter({
    keyPrefix:     'availability',
    limit:         60,
    windowSeconds: 60,
    keyType:       'ip',
    message:       'Too many availability requests.',
    bypass:        ['superadmin', 'admin'],
});

export const paymentLimiter = createRateLimiter({
    keyPrefix:     'payment',
    limit:         5,
    windowSeconds: 60,
    keyType:       'both',
    message:       'Too many payment attempts.',
    bypass:        ['superadmin'],
});

export const adminLimiter = createRateLimiter({
    keyPrefix:     'admin',
    limit:         300,
    windowSeconds: 60,
    keyType:       'user',
    message:       'Admin rate limit exceeded.',
    bypass:        ['superadmin'],
});

export const generalLimiter = createRateLimiter({
    keyPrefix:     'general',
    limit:         100,
    windowSeconds: 60,
    keyType:       'ip',
    message:       'Too many requests.',
    bypass:        ['superadmin', 'admin', 'receptionist', 'headWaiter', 'waiter', 'cleaner'],
});
