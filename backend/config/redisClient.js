import Redis from 'ioredis';

/**
 * Redis Client for Rate Limiting & Caching
 * Supports single-node and cluster deployment
 * Auto-reconnects with exponential backoff
 */

const createRedisClient = () => {
    const options = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),

        // Connection management
        connectTimeout: 5000,
        commandTimeout: 3000,
        enableOfflineQueue: false, // Reject commands when disconnected (fail open for rate limiting)
        lazyConnect: false,

        // Retry strategy - exponential backoff, max 10 attempts
        retryStrategy(times) {
            if (times > 10) {
                console.error('[Redis] Max retry attempts reached. Giving up.');
                return null;
            }
            const delay = Math.min(times * 150, 3000);
            console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },

        // Per-command retry limit
        maxRetriesPerRequest: 2,
    };

    const client = new Redis(options);

    client.on('connect', () => {
        console.log('✅ [Redis] Connected successfully');
    });

    client.on('ready', () => {
        console.log('✅ [Redis] Client ready to accept commands');
    });

    client.on('error', (err) => {
        // Log but don't crash the app — rate limiter fails open
        console.error(`❌ [Redis] Error: ${err.message}`);
    });

    client.on('close', () => {
        console.warn('⚠️  [Redis] Connection closed');
    });

    client.on('reconnecting', (delay) => {
        console.log(`🔄 [Redis] Reconnecting in ${delay}ms...`);
    });

    client.on('end', () => {
        console.warn('⚠️  [Redis] Connection ended. No more retries.');
    });

    return client;
};

const redis = createRedisClient();

export default redis;
