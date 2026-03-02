/**
 * Rate Limiter Middleware — Maxy Grand Hotel
 * ==========================================
 * Algorithm  : Sliding Window (Redis sorted sets) — atomic via Lua
 * Store      : Redis (centralized, works across multiple app instances)
 * Features   :
 *   - Role-based limit multipliers
 *   - IP-based + User-based keying
 *   - Standard X-RateLimit-* headers + Retry-After
 *   - Violation logging to backend/logs/rateLimitViolations.log
 *   - CAPTCHA trigger after repeated violations
 *   - Graceful fail-open when Redis is unavailable
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

// ─── Atomic Sliding-Window Lua Script ─────────────────────────────────────────
// Keys   : KEYS[1]  = Redis sorted-set key
// Args   : ARGV[1]  = now (ms epoch)
//          ARGV[2]  = window duration (ms)
//          ARGV[3]  = effective request limit
//          ARGV[4]  = unique request ID (member in sorted set)
//
// Returns: {allowed, remaining, count, retryAfterSeconds}
const SLIDING_WINDOW_LUA = `
local key        = KEYS[1]
local now        = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local lim        = tonumber(ARGV[3])
local req_id     = ARGV[4]

-- Evict entries outside the window
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a retry-after duration in seconds into a human-readable string.
 * e.g. 47 → "47 seconds"  |  60 → "1 minute"  |  120 → "2 minutes"
 */
function formatRetryTime(seconds) {
    if (seconds <= 0) return 'a moment';
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const mins = Math.round(seconds / 60);
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
}

function getClientIp(req) {
    // Respect X-Forwarded-For set by trusted Nginx proxy
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
    // Fall back to IP when no userId available (unauthenticated request)
    if (keys.length === 0) {
        keys.push(`rl:${prefix}:ip:${ip}`);
    }
    return keys;
}

// Most restrictive result across all keys (e.g., both IP and user keys)
function pickMostRestrictive(results) {
    let worst = results[0];
    for (const r of results) {
        if (!r[0]) return r;          // Any denied → immediately return denied
        if (r[1] < worst[1]) worst = r; // Lower remaining = more restrictive
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
        // ── Fail open when Redis is down ──────────────────────────────────────
        if (!isRedisReady()) {
            console.warn('[RateLimit] Redis unavailable — skipping rate limit check');
            return next();
        }

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

            // ── Build Redis keys ──────────────────────────────────────────────
            const keys   = buildRedisKeys(keyPrefix, keyType, ip, user?._id?.toString());

            // ── Evaluate sliding window (atomic) for each key ─────────────────
            const results = await Promise.all(
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

            const [allowed, remaining, , retryAfter] = pickMostRestrictive(results);
            const resetTs = Math.ceil((now + windowMs) / 1000);

            // ── Set standard rate-limit headers ───────────────────────────────
            res.set({
                'X-RateLimit-Limit':     effectiveLimit,
                'X-RateLimit-Remaining': Math.max(0, remaining),
                'X-RateLimit-Reset':     resetTs,
                'X-RateLimit-Policy':    `${effectiveLimit};w=${windowSeconds}`,
            });

            if (!allowed) {
                // ── Denied ────────────────────────────────────────────────────
                res.set('Retry-After', retryAfter);

                // Track violation count in Redis (24 h window)
                const violationKey   = `rl:violations:ip:${ip}`;
                const violationCount = await redis.incr(violationKey);
                await redis.expire(violationKey, 86400);

                // Write to violations log
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

                // CAPTCHA trigger
                let captchaRequired = false;
                if (enableCaptcha && violationCount >= captchaThreshold) {
                    await redis.set(`rl:captcha:ip:${ip}`, '1', 'EX', 3600); // 1 h
                    captchaRequired = true;
                    res.set('X-RateLimit-Captcha', 'required');
                }

                // Build human-readable message with exact retry countdown
                const retryDisplay   = formatRetryTime(retryAfter);
                const responseMessage = `${message} Please try again in ${retryDisplay}.`;

                return res.status(429).json({
                    success:         false,
                    error:           'RATE_LIMIT_EXCEEDED',
                    message:         responseMessage,
                    retryAfter,                    // exact seconds (for frontend countdown timer)
                    ...(captchaRequired && { captchaRequired: true }),
                });
            }

            // ── Allowed — check lingering CAPTCHA requirement ─────────────────
            if (enableCaptcha) {
                const captchaFlag = await redis.get(`rl:captcha:ip:${ip}`);
                if (captchaFlag) res.set('X-RateLimit-Captcha', 'required');
            }

            return next();
        } catch (err) {
            console.error('[RateLimit] Unexpected error:', err.message);
            return next(); // Fail open
        }
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-CONFIGURED LIMITERS — Redis Key Schema Reference:
//
//   rl:login:ip:{ip}                    — login attempts per IP
//   rl:signup:ip:{ip}                   — signup attempts per IP
//   rl:forgot-password:ip:{ip}          — password reset requests per IP
//   rl:availability:ip:{ip}             — room availability checks per IP
//   rl:booking:ip:{ip}                  — booking creation per IP (fallback)
//   rl:booking:user:{userId}            — booking creation per authenticated user
//   rl:payment:ip:{ip}                  — payment requests per IP (fallback)
//   rl:payment:user:{userId}            — payment requests per user
//   rl:admin:user:{userId}              — admin/staff API per user
//   rl:general:ip:{ip}                  — global catch-all per IP
//   rl:violations:ip:{ip}               — 24 h violation counter (for CAPTCHA)
//   rl:captcha:ip:{ip}                  — CAPTCHA requirement flag (1 h TTL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/users/login-user
 * POST /api/users/login-guest
 * 5 attempts / 1 minute per IP
 * Message example: "Too many login attempts. Please try again in 47 seconds."
 */
export const loginLimiter = createRateLimiter({
    keyPrefix:        'login',
    limit:            5,
    windowSeconds:    60,          // 1 minute rolling window
    keyType:          'ip',
    message:          'Too many login attempts.',
    bypass:           ['superadmin'],
    enableCaptcha:    true,
    captchaThreshold: 3,           // CAPTCHA after 3 violations in 24 h
});

/**
 * POST /api/users/create-user
 * 3 attempts / 1 minute per IP  — prevents mass account creation
 * Message example: "Too many signup attempts. Please try again in 1 minute."
 */
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

/**
 * POST /api/users/request-password-reset
 * 3 requests / 1 minute per IP
 * Message example: "Too many password reset requests. Please try again in 52 seconds."
 */
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

/**
 * POST /api/bookings/create-with-payment
 * POST /api/bookings/create-walkin
 * 5 attempts / 1 minute per user + IP
 * Message example: "Too many booking attempts. Please try again in 1 minute."
 */
export const bookingLimiter = createRateLimiter({
    keyPrefix:     'booking',
    limit:         5,
    windowSeconds: 60,
    keyType:       'both',
    message:       'Too many booking attempts.',
    bypass:        ['superadmin'],
});

/**
 * GET  /api/rooms/available
 * GET  /api/rooms/available_rooms
 * GET  /api/rooms/get-all-rooms
 * POST /api/bookings/check-availability
 * 60 requests / 1 minute per IP  — generous but scraping-resistant
 */
export const availabilityLimiter = createRateLimiter({
    keyPrefix:     'availability',
    limit:         60,
    windowSeconds: 60,
    keyType:       'ip',
    message:       'Too many availability requests.',
    bypass:        ['superadmin', 'admin'],
});

/**
 * POST /api/payments/verify
 * POST /api/payments/create
 * 5 requests / 1 minute per user + IP  — payment endpoints are critical
 * Message example: "Too many payment attempts. Please try again in 38 seconds."
 */
export const paymentLimiter = createRateLimiter({
    keyPrefix:     'payment',
    limit:         5,
    windowSeconds: 60,
    keyType:       'both',
    message:       'Too many payment attempts.',
    bypass:        ['superadmin'],
});

/**
 * /api/analytics, /api/dashboard, /api/reports, /api/performance
 * 300 requests / 1 minute per admin user
 */
export const adminLimiter = createRateLimiter({
    keyPrefix:     'admin',
    limit:         300,
    windowSeconds: 60,
    keyType:       'user',
    message:       'Admin rate limit exceeded.',
    bypass:        ['superadmin'],
});

/**
 * Global catch-all applied to all /api routes
 * 100 requests / 1 minute per IP
 */
export const generalLimiter = createRateLimiter({
    keyPrefix:     'general',
    limit:         10,
    windowSeconds: 60,
    keyType:       'ip',
    message:       'Too many requests.',
    bypass:        ['superadmin', 'admin'],
});
