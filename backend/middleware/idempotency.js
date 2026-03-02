/**
 * Payment Idempotency Middleware — Maxy Grand Hotel
 * ==================================================
 * Prevents duplicate payment submissions for the same transaction reference.
 *
 * Flow:
 *   1. Extract `reference` from request body + `userId` from auth token.
 *   2. Check Redis for `pay:idem:{userId}:{reference}`.
 *      - 'done'       → Already successfully processed → return 200 immediately.
 *      - 'processing' → In-flight duplicate → return 409.
 *      - (absent)     → New request → acquire a 30 s processing lock, proceed.
 *   3. After response:
 *      - 2xx success  → Extend key to 24 h ('done') to block future duplicates.
 *      - Non-2xx      → Delete key so user can retry.
 *
 * Redis Key Schema:
 *   pay:idem:{userId}:{reference}   TTL: 30 s (processing) → 86400 s (done)
 */

import redis from '../config/redisClient.js';

const PROCESSING_TTL = 30;     // seconds — short lock for in-flight requests
const DONE_TTL       = 86400;  // seconds — 24 h guard after success

export const paymentIdempotency = async (req, res, next) => {
    // Only apply to requests that carry a payment reference
    const reference = req.body?.reference;
    const userId    = req.user?._id?.toString();

    if (!reference || !userId) return next();

    // Skip if Redis is unavailable
    if (!redis || redis.status !== 'ready') return next();

    const key = `pay:idem:${userId}:${reference}`;

    try {
        const state = await redis.get(key);

        if (state === 'done') {
            // Already processed — idempotent success response
            return res.status(200).json({
                success:   true,
                message:   'Payment already verified. No duplicate charge.',
                duplicate: true,
            });
        }

        if (state === 'processing') {
            // In-flight duplicate (possible network retry within 30 s)
            return res.status(409).json({
                success: false,
                error:   'DUPLICATE_PAYMENT_REQUEST',
                message: 'This payment is currently being processed. Please wait and check your booking status.',
            });
        }

        // Acquire processing lock (NX = only if not exists)
        const acquired = await redis.set(key, 'processing', 'EX', PROCESSING_TTL, 'NX');
        if (!acquired) {
            // Another instance beat us to the lock
            return res.status(409).json({
                success: false,
                error:   'DUPLICATE_PAYMENT_REQUEST',
                message: 'This payment reference is already being processed.',
            });
        }

        // Register a listener to update the key after the response is sent
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Success → mark as permanently done for 24 h
                redis.set(key, 'done', 'EX', DONE_TTL).catch((err) => {
                    console.error('[Idempotency] Failed to mark payment done:', err.message);
                });
            } else {
                // Failure → release the lock so the user can retry
                redis.del(key).catch((err) => {
                    console.error('[Idempotency] Failed to release payment lock:', err.message);
                });
            }
        });

        return next();
    } catch (err) {
        console.error('[Idempotency] Unexpected error:', err.message);
        return next(); // Fail open — never block a payment due to Redis error
    }
};
