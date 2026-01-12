/**
 * Queue Routes
 * 
 * Admin endpoints for queue monitoring and management.
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireAdmin } = require('../middlewares/auth.middleware');
const { getQueueHealth, getAllQueues } = require('../queues');
const { triggerCampaign } = require('../jobs/scheduler');

// All routes require admin authentication
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/queues/health
 * Get health status of all queues
 */
router.get('/health', async (req, res, next) => {
    try {
        const health = await getQueueHealth();

        res.json({
            success: true,
            data: health,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/queues/:name/jobs
 * Get jobs from a specific queue
 */
router.get('/:name/jobs', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { status = 'waiting', page = 1, limit = 20 } = req.query;

        const queues = getAllQueues();
        const queue = queues[name];

        if (!queue) {
            return res.status(404).json({
                success: false,
                message: `Queue '${name}' not found`,
            });
        }

        const start = (page - 1) * limit;
        const end = start + parseInt(limit) - 1;

        let jobs;
        switch (status) {
            case 'waiting':
                jobs = await queue.getWaiting(start, end);
                break;
            case 'active':
                jobs = await queue.getActive(start, end);
                break;
            case 'completed':
                jobs = await queue.getCompleted(start, end);
                break;
            case 'failed':
                jobs = await queue.getFailed(start, end);
                break;
            case 'delayed':
                jobs = await queue.getDelayed(start, end);
                break;
            default:
                jobs = await queue.getWaiting(start, end);
        }

        res.json({
            success: true,
            data: jobs.map(job => ({
                id: job.id,
                name: job.name,
                data: job.data,
                opts: job.opts,
                progress: job.progress(),
                attemptsMade: job.attemptsMade,
                timestamp: job.timestamp,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
            })),
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/admin/queues/:name/retry-failed
 * Retry all failed jobs in a queue
 */
router.post('/:name/retry-failed', async (req, res, next) => {
    try {
        const { name } = req.params;

        const queues = getAllQueues();
        const queue = queues[name];

        if (!queue) {
            return res.status(404).json({
                success: false,
                message: `Queue '${name}' not found`,
            });
        }

        const failed = await queue.getFailed();
        let retried = 0;

        for (const job of failed) {
            await job.retry();
            retried++;
        }

        res.json({
            success: true,
            message: `Retried ${retried} failed jobs`,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/admin/queues/:name/clean
 * Clean old jobs from a queue
 */
router.delete('/:name/clean', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { status = 'completed', age = 3600000 } = req.query; // Default 1 hour

        const queues = getAllQueues();
        const queue = queues[name];

        if (!queue) {
            return res.status(404).json({
                success: false,
                message: `Queue '${name}' not found`,
            });
        }

        const cleaned = await queue.clean(parseInt(age), status);

        res.json({
            success: true,
            message: `Cleaned ${cleaned.length} ${status} jobs`,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/admin/queues/trigger-campaign/:id
 * Manually trigger a campaign
 */
router.post('/trigger-campaign/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        await triggerCampaign(id, req.user.orgId);

        res.json({
            success: true,
            message: 'Campaign queued for processing',
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
