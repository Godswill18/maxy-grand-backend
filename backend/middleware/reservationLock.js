/**
 * Reservation Lock Middleware — Maxy Grand Hotel
 * ===============================================
 * Prevents room hoarding: only one user can hold an active booking
 * reservation slot for a given room at a time.
 *
 * Flow:
 *   acquireReservationLock  — Called on POST /api/bookings/check-availability
 *     • Atomically sets  room:lock:{roomId}  = userId  (NX, 15-min TTL)
 *     • If locked by another user → 409 Conflict with retryAfter seconds
 *     • If locked by same user   → refreshes TTL (they're still in checkout)
 *
 *   releaseReservationLock  — Utility exported for use inside controllers
 *     • Deletes the key only if the calling user owns the lock (Lua script)
 *
 * Redis Key Schema:
 *   room:lock:{roomId}    Value: userId    TTL: 900 s (15 min)
 */

import redis from '../config/redisClient.js';

const LOCK_TTL_SECONDS = 15 * 60; // 15 minutes

// Lua: delete the lock only if we own it (prevents accidental foreign-lock release)
const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
`;

// ─── Middleware: acquire lock before availability check ────────────────────────

export const acquireReservationLock = async (req, res, next) => {
    const roomId = req.body?.roomId;
    const userId = req.user?._id?.toString();

    // If no room or user context, skip (let controller validate)
    if (!roomId || !userId) return next();

    // Fail open when Redis is unavailable
    if (!redis || redis.status !== 'ready') return next();

    const key = `room:lock:${roomId}`;

    try {
        // Atomic SET NX — acquire only if key does not exist
        const acquired = await redis.set(key, userId, 'EX', LOCK_TTL_SECONDS, 'NX');

        if (acquired === 'OK') {
            // Lock granted — attach metadata for downstream release
            req.reservationLock = { key, roomId, userId, acquired: true };
            return next();
        }

        // Lock exists — check ownership
        const lockOwner = await redis.get(key);

        if (lockOwner === userId) {
            // Same user, still in their checkout flow — refresh TTL
            await redis.expire(key, LOCK_TTL_SECONDS);
            req.reservationLock = { key, roomId, userId, acquired: true, refreshed: true };
            return next();
        }

        // Room is locked by a different user
        const ttl = await redis.ttl(key);
        return res.status(409).json({
            success:    false,
            error:      'ROOM_TEMPORARILY_LOCKED',
            message:    'This room is currently being reserved by another guest. Please try a different room or try again shortly.',
            retryAfter: ttl > 0 ? ttl : LOCK_TTL_SECONDS,
        });
    } catch (err) {
        console.error('[ReservationLock] Acquire error:', err.message);
        return next(); // Fail open
    }
};

// ─── Utility: release lock from a controller after successful booking ──────────

export const releaseReservationLock = async (roomId, userId) => {
    if (!roomId || !userId) return;
    if (!redis || redis.status !== 'ready') return;

    const key = `room:lock:${roomId}`;

    try {
        const released = await redis.eval(RELEASE_LUA, 1, key, userId.toString());
        if (released) {
            console.log(`[ReservationLock] Released lock for room ${roomId}`);
        }
    } catch (err) {
        console.error('[ReservationLock] Release error:', err.message);
    }
};

// ─── Middleware: auto-release after successful booking response ────────────────

export const releaseOnSuccess = (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
        if (res.statusCode >= 200 && res.statusCode < 300 && req.reservationLock) {
            releaseReservationLock(
                req.reservationLock.roomId,
                req.reservationLock.userId,
            ).catch(() => {});
        }
        return originalJson(body);
    };

    next();
};
