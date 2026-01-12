/**
 * Analytics Controller
 * 
 * HTTP request handlers for analytics endpoints.
 */

const analyticsService = require('../services/analytics.service');

class AnalyticsController {
    /**
     * GET /api/analytics/dashboard
     * Get dashboard summary
     */
    async getDashboard(req, res, next) {
        try {
            const period = parseInt(req.query.period) || 30;

            const summary = await analyticsService.getDashboardSummary(
                req.user.orgId,
                period
            );

            res.json({
                success: true,
                data: summary,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/campaigns/:id
     * Get detailed campaign analytics
     */
    async getCampaignAnalytics(req, res, next) {
        try {
            const analytics = await analyticsService.getCampaignAnalytics(
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
     * GET /api/analytics/trends
     * Get daily trend data
     */
    async getDailyTrend(req, res, next) {
        try {
            const days = parseInt(req.query.days) || 30;

            const trend = await analyticsService.getDailyTrend(
                req.user.orgId,
                days
            );

            res.json({
                success: true,
                data: trend,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/campaigns/:id/hourly
     * Get hourly breakdown for campaign
     */
    async getHourlyBreakdown(req, res, next) {
        try {
            const hourly = await analyticsService.getHourlyBreakdown(
                req.params.id
            );

            res.json({
                success: true,
                data: hourly,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/campaigns/:id/devices
     * Get device breakdown for campaign
     */
    async getDeviceBreakdown(req, res, next) {
        try {
            const devices = await analyticsService.getDeviceBreakdown(
                req.params.id
            );

            res.json({
                success: true,
                data: devices,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/analytics/compare
     * Compare multiple campaigns
     */
    async compareCampaigns(req, res, next) {
        try {
            const { campaignIds } = req.body;

            if (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'At least 2 campaign IDs are required',
                });
            }

            const comparison = await analyticsService.compareCampaigns(
                req.user.orgId,
                campaignIds
            );

            res.json({
                success: true,
                data: comparison,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/campaigns/:id/ab-test
     * Get A/B test results
     */
    async getABTestResults(req, res, next) {
        try {
            const results = await analyticsService.getABTestResults(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: results,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/lists
     * Get list health metrics
     */
    async getListHealth(req, res, next) {
        try {
            const health = await analyticsService.getListHealth(req.user.orgId);

            res.json({
                success: true,
                data: health,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/contacts/:id/activity
     * Get contact email activity
     */
    async getContactActivity(req, res, next) {
        try {
            const activity = await analyticsService.getContactActivity(
                req.user.orgId,
                req.params.id,
                {
                    page: parseInt(req.query.page) || 1,
                    limit: parseInt(req.query.limit) || 20,
                }
            );

            res.json({
                success: true,
                data: activity.logs,
                pagination: activity.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/campaigns/:id/export
     * Export campaign analytics
     */
    async exportAnalytics(req, res, next) {
        try {
            const format = req.query.format || 'json';

            const data = await analyticsService.exportAnalytics(
                req.user.orgId,
                req.params.id,
                format
            );

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=analytics_${req.params.id}.csv`);
                return res.send(data);
            }

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AnalyticsController();
