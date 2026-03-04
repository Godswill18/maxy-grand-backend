/**
 * Rate Limiter Middleware — Maxy Grand Hotel
 * ==========================================
 * Algorithm  : Sliding Window — atomic via Lua when Redis is available,
 *              in-memory Map fallback when Redis is unavailable.
 * Store      : Redis (primary, centralized) → in-memory (fallback, single-process)
 * Features   :
 *   - Role-based limit multipliers
 *   - IP-based + User-based keying
 *   - Standard X-RateLimit-* headers + Retry-After
 *   - Violation logging to backend/logs/rateLimitViolations.log
 *   - CAPTCHA trigger after repeated violations (Redis mode only)
 *   - Graceful in-memory fallback when Redis is unavailable
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
// Higher multiplier = more requests allowed.
// 0 = unlimited (bypassed entirely).
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

// ─── Atomic Sliding-Window Lua Script (Redis) ──────────────────────────────────
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

// ─── In-Memory Sliding-Window Fallback ────────────────────────────────────────
// Used automatically when Redis is unavailable.
// Single-process only — not shared across Node.js cluster workers.
// For multi-instance deployments, run Redis instead.
//
// Structure: Map<key, number[]>  (sorted array of request timestamps in ms)

const memStore = new Map();

// Clean up stale keys every 5 minutes so the Map doesn't grow unbounded.
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 h
    for (const [key, timestamps] of memStore) {
        if (!timestamps.length || timestamps[timestamps.length - 1] < cutoff) {
            memStore.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

/**
 * In-memory equivalent of the Lua sliding-window script.
 * Returns the same 4-element tuple: [allowed, remaining, count, retryAfterSeconds]
 */
function memoryCheck(key, windowMs, limit) {
    const now         = Date.now();
    const windowStart = now - windowMs;

    // Retrieve and evict expired timestamps
    let ts = (memStore.get(key) || []).filter(t => t > windowStart);

    const count = ts.length;

    if (count < limit) {
        ts.push(now);
        memStore.set(key, ts);
        return [1, limit - count - 1, count + 1, 0];
    }

    // Denied — calculate when the oldest entry exits the window
    const retryAfter = Math.ceil((ts[0] + windowMs - now) / 1000);
    memStore.set(key, ts); // write back the cleaned array
    return [0, 0, count, Math.max(1, retryAfter)];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRetryTime(seconds) {
    if (seconds <= 0) return 'a moment';
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const mins = Math.round(seconds / 60);
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
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
    if (keyType === 'ip' || keyType === 'both') {
        keys.push(`rl:${prefix}:ip:${ip}`);
    }
    if ((keyType === 'user' || keyType === 'both') && userId) {
        keys.push(`rl:${prefix}:user:${userId}`);
    }
    if (keys.length === 0) {
        keys.push(`rl:${prefix}:ip:${ip}`);
    }
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
        if (!fs.existsSync(LOGS_DIR)) {
            await fsPromises.mkdir(LOGS_DIR, { recursive: true });
        }
        const line = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}\t${uuid()}\t${entry}\n`;
        await fsPromises.appendFile(path.join(LOGS_DIR, VIOLATION_LOG), line);
    } catch (err) {
        console.error('[RateLimit] Failed to write violation log:', err.message);
    }
}

function isRedisReady() {
    return redis && redis.status === 'ready';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * createRateLimiter(options) → Express middleware
 *
 * @param {string}   keyPrefix        - Unique identifier for this limiter (e.g. 'login')
 * @param {number}   limit            - Base request limit (before role multiplier)
 * @param {number}   windowSeconds    - Rolling window duration in seconds
 * @param {string}   [keyType='ip']   - 'ip' | 'user' | 'both'
 * @param {string}   [message]        - 429 response message
 * @param {string[]} [bypass=[]]      - Roles that skip the limiter entirely
 * @param {boolean}  [enableCaptcha]  - Emit captcha header after repeated violations
 * @param {number}   [captchaThreshold=5] - Violation count before CAPTCHA is required
 */
export const createRateLimiter = ({
    keyPrefix,
    limit,
    windowSeconds,
    keyType         = 'ip',
    message         = 'Too many requests. Please try again later.',
    bypass          = [],
    enableCaptcha   = false,
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

            // ── Role bypass ───────────────────────────────────────────────────
            if (bypass.includes(role)) return next();

            // ── Role-based effective limit ────────────────────────────────────
            const multiplier     = ROLE_MULTIPLIERS[role] ?? 1;
            if (multiplier === 0) return next();   // unlimited role
            const effectiveLimit = Math.ceil(limit * multiplier);

            // ── Build keys ────────────────────────────────────────────────────
            const keys = buildRedisKeys(keyPrefix, keyType, ip, user?._id?.toString());

            // ── Evaluate sliding window ───────────────────────────────────────
            let results;
            if (redisAvailable) {
                results = await Promise.all(
                    keys.map(key =>
                        redis.eval(
                            SLIDING_WINDOW_LUA,
                            1,
                            key,
                            now.toString(),
                            windowMs.toString(),
                            effectiveLimit.toString(),
                            reqId,
                        )
                    )
                );
            } else {
                // In-memory fallback — synchronous, no await needed
                results = keys.map(key => memoryCheck(key, windowMs, effectiveLimit));
            }

            const [allowed, remaining, , retryAfter] = pickMostRestrictive(results);
            const resetTs = Math.ceil((now + windowMs) / 1000);

            // ── Standard rate-limit headers ───────────────────────────────────
            res.set({
                'X-RateLimit-Limit':     effectiveLimit,
                'X-RateLimit-Remaining': Math.max(0, remaining),
                'X-RateLimit-Reset':     resetTs,
                'X-RateLimit-Policy':    `${effectiveLimit};w=${windowSeconds}`,
            });

            if (!allowed) {
                res.set('Retry-After', retryAfter);

                // Violation tracking + CAPTCHA — Redis only (not critical in fallback)
                if (redisAvailable) {
                    const violationKey   = `rl:violations:ip:${ip}`;
                    const violationCount = await redis.incr(violationKey);
                    await redis.expire(violationKey, 86400);

                    await writeViolationLog(
                        `RATE_LIMIT_EXCEEDED\t` +
                        `endpoint=${keyPrefix}\t` +
                        `method=${req.method}\t` +
                        `path=${req.originalUrl}\t` +
                        `ip=${ip}\t` +
                        `userId=${user?._id || 'unauthenticated'}\t` +
                        `role=${role}\t` +
                        `limit=${effectiveLimit}/${windowSeconds}s\t` +
                        `violations_24h=${violationCount}`
                    );

                    let captchaRequired = false;
                    if (enableCaptcha && violationCount >= captchaThreshold) {
                        await redis.set(`rl:captcha:ip:${ip}`, '1', 'EX', 3600);
                        captchaRequired = true;
                        res.set('X-RateLimit-Captcha', 'required');
                    }

                    const retryDisplay    = formatRetryTime(retryAfter);
                    const responseMessage = `${message} Please try again in ${retryDisplay}.`;

                    return res.status(429).json({
                        success:     false,
                        error:       'RATE_LIMIT_EXCEEDED',
                        message:     responseMessage,
                        retryAfter,
                        ...(captchaRequired && { captchaRequired: true }),
                    });
                }

                // Memory-mode denied response (no violation log / CAPTCHA)
                const retryDisplay    = formatRetryTime(retryAfter);
                const responseMessage = `${message} Please try again in ${retryDisplay}.`;

                return res.status(429).json({
                    success:    false,
                    error:      'RATE_LIMIT_EXCEEDED',
                    message:    responseMessage,
                    retryAfter,
                });
            }

            // ── Allowed — check lingering CAPTCHA flag (Redis only) ───────────
            if (redisAvailable && enableCaptcha) {
                const captchaFlag = await redis.get(`rl:captcha:ip:${ip}`);
                if (captchaFlag) res.set('X-RateLimit-Captcha', 'required');
            }

            return next();
        } catch (err) {
            console.error('[RateLimit] Unexpected error:', err.message);
            return next(); // Fail open on unexpected error
        }
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-CONFIGURED LIMITERS
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
    limit:         100,            // per IP per minute — staff/admin are bypassed below
    windowSeconds: 60,
    keyType:       'ip',
    message:       'Too many requests.',
    // All authenticated staff bypass the general catch-all; only unauthenticated
    // IPs and guests are subject to the 100 req/min ceiling.
    bypass:        ['superadmin', 'admin', 'receptionist', 'headWaiter', 'waiter', 'cleaner'],
});
