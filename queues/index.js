/**
 * Queue Definitions
 * 
 * All Bull queues used in the application.
 */

const Bull = require('bull');
const { redisConfig, defaultJobOptions, emailRateLimiter } = require('../config/redis.config');

// Queue instances
const queues = {};

/**
 * Create a new Bull queue
 */
function createQueue(name, options = {}) {
    const queue = new Bull(name, {
        redis: redisConfig,
        defaultJobOptions: {
            ...defaultJobOptions,
            ...options.defaultJobOptions,
        },
        limiter: options.limiter,
        settings: {
            stalledInterval: 30000,     // Check for stalled jobs every 30s
            maxStalledCount: 2,          // Max times a job can be stalled before failing
            lockDuration: 60000,         // 1 minute lock
            lockRenewTime: 30000,        // Renew lock every 30s
        },
    });

    // Store reference
    queues[name] = queue;

    return queue;
}

/**
 * Email Queue - For sending individual emails
 * Rate limited to respect email provider limits
 */
const emailQueue = createQueue('email', {
    limiter: emailRateLimiter,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 10000, // 10s, 20s, 40s, 80s, 160s
        },
    },
});

/**
 * Campaign Queue - For processing campaign sends
 * Lower concurrency, processes entire campaigns
 */
const campaignQueue = createQueue('campaign', {
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 30000, // 30 seconds
        },
    },
});

/**
 * Analytics Queue - For processing email events
 * Higher throughput for webhook processing
 */
const analyticsQueue = createQueue('analytics', {
    defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 50,
    },
});

/**
 * Import Queue - For CSV imports
 * Long running, lower priority
 */
const importQueue = createQueue('import', {
    defaultJobOptions: {
        attempts: 2,
        timeout: 30 * 60 * 1000, // 30 minutes
    },
});

/**
 * Export Queue - For data exports
 */
const exportQueue = createQueue('export', {
    defaultJobOptions: {
        attempts: 2,
        timeout: 30 * 60 * 1000,
    },
});

/**
 * Webhook Queue - For outgoing webhooks
 */
const webhookQueue = createQueue('webhook', {
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
    },
});

/**
 * Cleanup Queue - For scheduled cleanup tasks
 */
const cleanupQueue = createQueue('cleanup', {
    defaultJobOptions: {
        attempts: 2,
    },
});

/**
 * Get all queue instances
 */
function getAllQueues() {
    return queues;
}

/**
 * Close all queue connections
 */
async function closeAllQueues() {
    const closePromises = Object.values(queues).map(queue => queue.close());
    await Promise.all(closePromises);
    console.log('✅ All queues closed');
}

/**
 * Get queue health status
 */
async function getQueueHealth() {
    const health = {};

    for (const [name, queue] of Object.entries(queues)) {
        try {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getCompletedCount(),
                queue.getFailedCount(),
                queue.getDelayedCount(),
            ]);

            health[name] = {
                status: 'healthy',
                waiting,
                active,
                completed,
                failed,
                delayed,
            };
        } catch (error) {
            health[name] = {
                status: 'error',
                error: error.message,
            };
        }
    }

    return health;
}

module.exports = {
    emailQueue,
    campaignQueue,
    analyticsQueue,
    importQueue,
    exportQueue,
    webhookQueue,
    cleanupQueue,
    getAllQueues,
    closeAllQueues,
    getQueueHealth,
};
