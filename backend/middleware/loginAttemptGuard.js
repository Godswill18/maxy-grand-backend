/**
 * Login Attempt Guard — Maxy Grand Hotel
 * ========================================
 * Tracks FAILED login attempts (not total requests).
 * Locks an IP + email for 60 seconds after 5 consecutive failures.
 * Resets the counter on a successful login.
 *
 * Primary store  : Redis (shared across all instances)
 * Fallback store : In-memory Maps (single-process, used when Redis is down)
 *
 * IMPORTANT: Uses res.json interception (not res.on('finish')) so that
 * the 5th failed attempt itself returns a 429 — not the 6th request.
 *
 * Flow per request:
 *   1. Check if IP or email is currently locked → 429 with retryAfter
 *   2. Intercept res.json:
 *        HTTP 200 + success:true  → reset all attempt counters, pass through
 *        HTTP 400 + success:false → increment counter; if now locked, rewrite to 429
 *        HTTP 403                 → pass through unchanged (not a brute-force signal)
 *
 * Redis Key Schema:
 *   login:attempts:ip:{ip}         Counter (TTL: 900s)    — IP failed count
 *   login:locked:ip:{ip}           Flag    (TTL: 60s)     — IP lockout
 *   login:attempts:email:{email}   Counter (TTL: 900s)    — email failed count
 *   login:locked:email:{email}     Flag    (TTL: 60s)     — email lockout
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

const MAX_ATTEMPTS = 5;    // failed attempts before lockout
const LOCK_SECONDS = 60;   // lockout duration in seconds
const COUNTER_TTL  = 900;  // 15-minute window — catches slow brute-force attacks

// ─── Redis Key Builders ────────────────────────────────────────────────────────
const ipCountKey    = (ip)    => `login:attempts:ip:${ip}`;
const ipLockKey     = (ip)    => `login:locked:ip:${ip}`;
const emailCountKey = (email) => `login:attempts:email:${email}`;
const emailLockKey  = (email) => `login:locked:email:${email}`;

// ─── Lua: Check lockout status ─────────────────────────────────────────────────
const CHECK_LOCK_LUA = `
local locked = redis.call('EXISTS', KEYS[1])
if locked == 1 then
    return {1, redis.call('TTL', KEYS[1]), 0}
end
local count = tonumber(redis.call('GET', KEYS[2]) or '0')
return {0, 0, count}
`;

// ─── Lua: Increment counter, set lockout when limit is reached ─────────────────
const INCR_AND_LOCK_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if count >= tonumber(ARGV[1]) then
    redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
    redis.call('DEL', KEYS[1])
    return {count, tonumber(ARGV[3])}
end
return {count, 0}
`;

// ─── Lua: Delete all attempt keys (on success) ────────────────────────────────
const RESET_LUA = `
for _, key in ipairs(KEYS) do
    redis.call('DEL', key)
end
return 1
`;

// ─── In-Memory Fallback ────────────────────────────────────────────────────────
// Used automatically when Redis is unavailable.
// Structure: Map<string, { count: number, expiresAt: number }>

const memAttempts = new Map(); // attempt counters
const memLocks    = new Map(); // active lockouts

// Periodic cleanup to prevent unbounded growth
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memAttempts) if (v.expiresAt < now) memAttempts.delete(k);
    for (const [k, v] of memLocks)    if (v.expiresAt < now) memLocks.delete(k);
}, 60 * 1000).unref();

function memCheckLockout(ip, email) {
    const now = Date.now();

    const ipLock = memLocks.get(ipLockKey(ip));
    if (ipLock && ipLock.expiresAt > now) {
        return { locked: true, retryAfter: Math.ceil((ipLock.expiresAt - now) / 1000), by: 'ip' };
    }

    if (email) {
        const emailLock = memLocks.get(emailLockKey(email));
        if (emailLock && emailLock.expiresAt > now) {
            return { locked: true, retryAfter: Math.ceil((emailLock.expiresAt - now) / 1000), by: 'email' };
        }
    }

    return { locked: false };
}

function memRecordAndCheck(ip, email) {
    const now = Date.now();
    let lockedFor = 0;

    // Increment IP counter
    const ipCK  = ipCountKey(ip);
    const ipEnt = memAttempts.get(ipCK) || { count: 0, expiresAt: now + COUNTER_TTL * 1000 };
    ipEnt.count += 1;
    if (ipEnt.count === 1) ipEnt.expiresAt = now + COUNTER_TTL * 1000;
    memAttempts.set(ipCK, ipEnt);

    if (ipEnt.count >= MAX_ATTEMPTS) {
        memLocks.set(ipLockKey(ip), { expiresAt: now + LOCK_SECONDS * 1000 });
        memAttempts.delete(ipCK);
        lockedFor = LOCK_SECONDS;
    }

    // Increment email counter
    if (email) {
        const emailCK  = emailCountKey(email);
        const emailEnt = memAttempts.get(emailCK) || { count: 0, expiresAt: now + COUNTER_TTL * 1000 };
        emailEnt.count += 1;
        if (emailEnt.count === 1) emailEnt.expiresAt = now + COUNTER_TTL * 1000;
        memAttempts.set(emailCK, emailEnt);

        if (emailEnt.count >= MAX_ATTEMPTS) {
            memLocks.set(emailLockKey(email), { expiresAt: now + LOCK_SECONDS * 1000 });
            memAttempts.delete(emailCK);
            lockedFor = Math.max(lockedFor, LOCK_SECONDS);
        }
    }

    return lockedFor > 0 ? { locked: true, retryAfter: lockedFor } : { locked: false };
}

function memResetAttempts(ip, email) {
    memAttempts.delete(ipCountKey(ip));
    memLocks.delete(ipLockKey(ip));
    if (email) {
        memAttempts.delete(emailCountKey(email));
        memLocks.delete(emailLockKey(email));
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return (
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

function isRedisReady() {
    return redis && redis.status === 'ready';
}

async function writeLog(entry) {
    try {
        if (!fs.existsSync(LOGS_DIR)) {
            await fsPromises.mkdir(LOGS_DIR, { recursive: true });
        }
        const line = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}\t${uuid()}\t${entry}\n`;
        await fsPromises.appendFile(path.join(LOGS_DIR, 'loginAttempts.log'), line);
    } catch (err) {
        console.error('[LoginGuard] Log write error:', err.message);
    }
}

// ─── Redis Core Actions ────────────────────────────────────────────────────────

async function checkLockout(ip, email) {
    const ipResult = await redis.eval(
        CHECK_LOCK_LUA, 2,
        ipLockKey(ip), ipCountKey(ip)
    );
    const [ipLocked, ipTtl] = ipResult;

    if (ipLocked) {
        return { locked: true, retryAfter: Math.max(1, ipTtl), by: 'ip' };
    }

    if (email) {
        const emailResult = await redis.eval(
            CHECK_LOCK_LUA, 2,
            emailLockKey(email), emailCountKey(email)
        );
        const [emailLocked, emailTtl] = emailResult;

        if (emailLocked) {
            return { locked: true, retryAfter: Math.max(1, emailTtl), by: 'email' };
        }
    }

    return { locked: false };
}

async function recordAndCheck(ip, email) {
    const args = [
        MAX_ATTEMPTS.toString(),
        COUNTER_TTL.toString(),
        LOCK_SECONDS.toString(),
    ];

    const [ipCount, ipLockSecs] = await redis.eval(
        INCR_AND_LOCK_LUA, 2,
        ipCountKey(ip), ipLockKey(ip),
        ...args
    );

    let emailLockSecs = 0;
    if (email) {
        const [, lockSecs] = await redis.eval(
            INCR_AND_LOCK_LUA, 2,
            emailCountKey(email), emailLockKey(email),
            ...args
        );
        emailLockSecs = lockSecs;
    }

    await writeLog(
        `FAILED_LOGIN_ATTEMPT\tip=${ip}\temail=${email || 'unknown'}\tipCount=${ipCount}`
    );

    const lockedFor = Math.max(ipLockSecs, emailLockSecs);
    if (lockedFor > 0) {
        await writeLog(
            `LOGIN_LOCKED\tip=${ip}\temail=${email || 'unknown'}\tretryAfter=${lockedFor}s`
        );
        return { locked: true, retryAfter: lockedFor };
    }

    return { locked: false };
}

async function resetLoginAttempts(ip, email) {
    const keysToDelete = [ipCountKey(ip), ipLockKey(ip)];
    if (email) {
        keysToDelete.push(emailCountKey(email), emailLockKey(email));
    }
    await redis.eval(RESET_LUA, keysToDelete.length, ...keysToDelete);
    await writeLog(`LOGIN_SUCCESS_RESET\tip=${ip}\temail=${email || 'unknown'}`);
}

// ─── Middleware Export ─────────────────────────────────────────────────────────

export const loginAttemptGuard = async (req, res, next) => {
    const redisAvailable = isRedisReady();

    try {
        const ip    = getClientIp(req);
        const email = req.body?.email?.toLowerCase?.().trim() || null;

        // ── Step 1: Check if already locked ───────────────────────────────────
        const lockStatus = redisAvailable
            ? await checkLockout(ip, email)
            : memCheckLockout(ip, email);

        if (lockStatus.locked) {
            const { retryAfter } = lockStatus;

            if (redisAvailable) {
                await writeLog(
                    `LOGIN_BLOCKED\tip=${ip}\temail=${email || 'unknown'}\tretryAfter=${retryAfter}s`
                );
            }

            return res.status(429).json({
                success:    false,
                error:      'LOGIN_LOCKED',
                message:    `Too many failed login attempts. Please wait ${retryAfter} second${retryAfter !== 1 ? 's' : ''} before trying again.`,
                retryAfter,
            });
        }

        // ── Step 2: Intercept res.json to rewrite the response in-flight ──────
        const originalJson = res.json.bind(res);

        res.json = async function guardedJson(body) {
            res.json = originalJson;

            try {
                const httpStatus = res.statusCode;

                // Successful login — wipe counters
                if (httpStatus === 200 && body?.success === true) {
                    if (redisAvailable) {
                        resetLoginAttempts(ip, email).catch(err =>
                            console.error('[LoginGuard] Reset error:', err.message)
                        );
                    } else {
                        memResetAttempts(ip, email);
                    }
                    return originalJson(body);
                }

                // Failed credentials (400) — increment; lock if threshold reached
                // 403 (inactive account / no shift) intentionally excluded
                if (httpStatus === 400 && body?.success === false) {
                    const result = redisAvailable
                        ? await recordAndCheck(ip, email)
                        : memRecordAndCheck(ip, email);

                    if (result.locked) {
                        res.status(429);
                        return originalJson({
                            success:    false,
                            error:      'LOGIN_LOCKED',
                            message:    `Too many failed login attempts. Please wait ${result.retryAfter} second${result.retryAfter !== 1 ? 's' : ''} before trying again.`,
                            retryAfter: result.retryAfter,
                        });
                    }
                }
            } catch (err) {
                console.error('[LoginGuard] Intercept error:', err.message);
            }

            return originalJson(body);
        };

        return next();
    } catch (err) {
        console.error('[LoginGuard] Unexpected error:', err.message);
        return next();
    }
};
