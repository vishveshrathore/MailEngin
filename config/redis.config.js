/**
 * Redis Configuration
 * 
 * Redis connection settings for Bull queues.
 */

require('dotenv').config();

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,

    // Connection options
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,

    // TLS for production
    ...(process.env.REDIS_TLS === 'true' && {
        tls: {
            rejectUnauthorized: false,
        },
    }),
};

// Bull-specific settings
const defaultJobOptions = {
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 500,      // Keep last 500 failed jobs
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 5000,          // 5 seconds base delay
    },
};

// Rate limiting for email provider
const emailRateLimiter = {
    max: parseInt(process.env.EMAIL_RATE_LIMIT) || 50,   // Max jobs
    duration: 1000,                                        // Per 1 second
    // = 50 emails per second default (adjust based on SES limits)
};

module.exports = {
    redisConfig,
    defaultJobOptions,
    emailRateLimiter,
};
