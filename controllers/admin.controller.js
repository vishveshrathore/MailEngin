/**
 * Admin Controller
 * 
 * HTTP handlers for admin endpoints.
 */

const adminService = require('../services/admin.service');

class AdminController {
    // ==================== DASHBOARD ====================

    /**
     * GET /api/admin/dashboard
     */
    async getDashboard(req, res, next) {
        try {
            const stats = await adminService.getDashboardStats();
            res.json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }

    // ==================== USERS ====================

    /**
     * GET /api/admin/users
     */
    async getUsers(req, res, next) {
        try {
            const result = await adminService.getUsers({
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                search: req.query.search,
                status: req.query.status,
                role: req.query.role,
                orgId: req.query.orgId,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

            res.json({
                success: true,
                data: result.users,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/users/:id
     */
    async getUser(req, res, next) {
        try {
            const user = await adminService.getUser(req.params.id);
            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/admin/users/:id
     */
    async updateUser(req, res, next) {
        try {
            const user = await adminService.updateUser(req.params.id, req.body);
            res.json({ success: true, message: 'User updated', data: user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/users/:id/suspend
     */
    async suspendUser(req, res, next) {
        try {
            const user = await adminService.suspendUser(
                req.params.id,
                req.body.reason
            );
            res.json({ success: true, message: 'User suspended', data: user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/users/:id/reactivate
     */
    async reactivateUser(req, res, next) {
        try {
            const user = await adminService.reactivateUser(req.params.id);
            res.json({ success: true, message: 'User reactivated', data: user });
        } catch (error) {
            next(error);
        }
    }

    // ==================== ORGANIZATIONS ====================

    /**
     * GET /api/admin/organizations
     */
    async getOrganizations(req, res, next) {
        try {
            const result = await adminService.getOrganizations({
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                search: req.query.search,
                status: req.query.status,
                plan: req.query.plan,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

            res.json({
                success: true,
                data: result.organizations,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/organizations/:id
     */
    async getOrganization(req, res, next) {
        try {
            const org = await adminService.getOrganization(req.params.id);
            res.json({ success: true, data: org });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/organizations/:id/suspend
     */
    async suspendOrganization(req, res, next) {
        try {
            const org = await adminService.suspendOrganization(
                req.params.id,
                req.body.reason,
                req.user.userId
            );
            res.json({ success: true, message: 'Organization suspended', data: org });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/organizations/:id/reactivate
     */
    async reactivateOrganization(req, res, next) {
        try {
            const org = await adminService.reactivateOrganization(req.params.id);
            res.json({ success: true, message: 'Organization reactivated', data: org });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/organizations/:id/change-plan
     */
    async changePlan(req, res, next) {
        try {
            const { plan } = req.body;
            if (!plan) {
                return res.status(400).json({
                    success: false,
                    message: 'Plan is required',
                });
            }

            const subscription = await adminService.changePlan(
                req.params.id,
                plan,
                req.user.userId
            );

            res.json({
                success: true,
                message: `Plan changed to ${plan}`,
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/organizations/:id/grant-credits
     */
    async grantCredits(req, res, next) {
        try {
            const { credits, reason } = req.body;
            if (!credits || credits <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid credits amount is required',
                });
            }

            const subscription = await adminService.grantEmailCredits(
                req.params.id,
                credits,
                reason,
                req.user.userId
            );

            res.json({
                success: true,
                message: `${credits} email credits granted`,
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // ==================== CAMPAIGNS ====================

    /**
     * GET /api/admin/campaigns
     */
    async getCampaigns(req, res, next) {
        try {
            const result = await adminService.getCampaigns({
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                status: req.query.status,
                orgId: req.query.orgId,
                flagged: req.query.flagged,
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
     * POST /api/admin/campaigns/:id/flag
     */
    async flagCampaign(req, res, next) {
        try {
            const campaign = await adminService.flagCampaign(
                req.params.id,
                req.body.reason,
                req.user.userId
            );
            res.json({ success: true, message: 'Campaign flagged', data: campaign });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/campaigns/:id/clear-flag
     */
    async clearCampaignFlag(req, res, next) {
        try {
            const campaign = await adminService.clearCampaignFlag(
                req.params.id,
                req.user.userId
            );
            res.json({ success: true, message: 'Flag cleared', data: campaign });
        } catch (error) {
            next(error);
        }
    }

    // ==================== ABUSE DETECTION ====================

    /**
     * GET /api/admin/abuse
     */
    async getAbuseMetrics(req, res, next) {
        try {
            const metrics = await adminService.getAbuseMetrics();
            res.json({ success: true, data: metrics });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/abuse/high-bounce
     */
    async getHighBounceOrgs(req, res, next) {
        try {
            const threshold = parseFloat(req.query.threshold) || 5;
            const orgs = await adminService.getHighBounceOrgs(threshold);
            res.json({ success: true, data: orgs });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/abuse/high-complaints
     */
    async getHighComplaintOrgs(req, res, next) {
        try {
            const threshold = parseFloat(req.query.threshold) || 0.1;
            const orgs = await adminService.getHighComplaintOrgs(threshold);
            res.json({ success: true, data: orgs });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
