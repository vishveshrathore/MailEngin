/**
 * Campaign Controller
 * 
 * HTTP request handlers for campaign management.
 */

const campaignService = require('../services/campaign.service');

class CampaignController {
    /**
     * POST /api/campaigns
     * Create a new campaign
     */
    async create(req, res, next) {
        try {
            const campaign = await campaignService.create(
                req.user.orgId,
                req.body,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Campaign created successfully',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns
     * Get all campaigns with filters
     */
    async getAll(req, res, next) {
        try {
            const result = await campaignService.getAll(req.user.orgId, {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search,
                status: req.query.status,
                type: req.query.type,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

            res.json({
                success: true,
                data: result.campaigns,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns/:id
     * Get campaign by ID
     */
    async getById(req, res, next) {
        try {
            const campaign = await campaignService.getById(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/campaigns/:id
     * Update campaign
     */
    async update(req, res, next) {
        try {
            const campaign = await campaignService.update(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign updated successfully',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/campaigns/:id
     * Delete campaign
     */
    async delete(req, res, next) {
        try {
            const result = await campaignService.delete(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/duplicate
     * Duplicate campaign
     */
    async duplicate(req, res, next) {
        try {
            const { name } = req.body;

            const campaign = await campaignService.duplicate(
                req.user.orgId,
                req.params.id,
                name,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Campaign duplicated successfully',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/campaigns/:id/recipients
     * Set campaign recipients
     */
    async setRecipients(req, res, next) {
        try {
            const campaign = await campaignService.setRecipients(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Recipients updated successfully',
                data: {
                    recipients: campaign.recipients,
                    estimatedTotal: campaign.recipients.estimatedTotal,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns/:id/recipients
     * Get recipient preview
     */
    async getRecipientPreview(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 100;

            const result = await campaignService.getRecipientPreview(
                req.user.orgId,
                req.params.id,
                limit
            );

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/calculate-recipients
     * Calculate estimated recipients
     */
    async calculateRecipients(req, res, next) {
        try {
            const result = await campaignService.calculateRecipients(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/schedule
     * Schedule campaign
     */
    async schedule(req, res, next) {
        try {
            const campaign = await campaignService.schedule(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign scheduled successfully',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/send
     * Send campaign immediately
     */
    async sendNow(req, res, next) {
        try {
            const campaign = await campaignService.sendNow(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign queued for sending',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/pause
     * Pause campaign
     */
    async pause(req, res, next) {
        try {
            const campaign = await campaignService.pause(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign paused',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/resume
     * Resume campaign
     */
    async resume(req, res, next) {
        try {
            const campaign = await campaignService.resume(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign resumed',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/cancel
     * Cancel campaign
     */
    async cancel(req, res, next) {
        try {
            const campaign = await campaignService.cancel(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Campaign cancelled',
                data: campaign,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/campaigns/:id/validate
     * Validate campaign is ready for sending
     */
    async validate(req, res, next) {
        try {
            const campaign = await campaignService.getById(
                req.user.orgId,
                req.params.id
            );

            const validation = await campaignService.validateForSend(campaign);

            res.json({
                success: true,
                data: validation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns/:id/analytics
     * Get campaign analytics
     */
    async getAnalytics(req, res, next) {
        try {
            const analytics = await campaignService.getAnalytics(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: analytics,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns/:id/activity
     * Get campaign activity/events
     */
    async getActivity(req, res, next) {
        try {
            const result = await campaignService.getActivity(
                req.user.orgId,
                req.params.id,
                {
                    page: parseInt(req.query.page) || 1,
                    limit: parseInt(req.query.limit) || 50,
                    type: req.query.type,
                }
            );

            res.json({
                success: true,
                data: result.logs,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/campaigns/stats
     * Get campaign statistics
     */
    async getStats(req, res, next) {
        try {
            const stats = await campaignService.getStats(req.user.orgId);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new CampaignController();
