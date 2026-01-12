/**
 * Automation Controller
 * 
 * HTTP request handlers for automation management.
 */

const automationService = require('../services/automation.service');

class AutomationController {
    /**
     * POST /api/automations
     * Create a new automation
     */
    async create(req, res, next) {
        try {
            const automation = await automationService.create(
                req.user.orgId,
                req.body,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Automation created successfully',
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/automations
     * Get all automations
     */
    async getAll(req, res, next) {
        try {
            const result = await automationService.getAll(req.user.orgId, {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                status: req.query.status,
                type: req.query.type,
                search: req.query.search,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

            res.json({
                success: true,
                data: result.automations,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/automations/:id
     * Get automation by ID
     */
    async getById(req, res, next) {
        try {
            const automation = await automationService.getById(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/automations/:id
     * Update automation
     */
    async update(req, res, next) {
        try {
            const automation = await automationService.update(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Automation updated successfully',
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/automations/:id
     * Delete automation
     */
    async delete(req, res, next) {
        try {
            const result = await automationService.delete(
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
     * POST /api/automations/:id/activate
     * Activate automation
     */
    async activate(req, res, next) {
        try {
            const automation = await automationService.activate(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Automation activated',
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/automations/:id/pause
     * Pause automation
     */
    async pause(req, res, next) {
        try {
            const automation = await automationService.pause(
                req.user.orgId,
                req.params.id,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Automation paused',
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/automations/:id/duplicate
     * Duplicate automation
     */
    async duplicate(req, res, next) {
        try {
            const automation = await automationService.duplicate(
                req.user.orgId,
                req.params.id,
                req.body.name,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Automation duplicated',
                data: automation,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/automations/:id/contacts
     * Get enrolled contacts
     */
    async getEnrolledContacts(req, res, next) {
        try {
            const result = await automationService.getEnrolledContacts(
                req.user.orgId,
                req.params.id,
                {
                    page: parseInt(req.query.page) || 1,
                    limit: parseInt(req.query.limit) || 50,
                }
            );

            res.json({
                success: true,
                data: result.contacts,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/automations/:id/contacts
     * Manually enroll contact
     */
    async enrollContact(req, res, next) {
        try {
            const { contactId } = req.body;

            if (!contactId) {
                return res.status(400).json({
                    success: false,
                    message: 'contactId is required',
                });
            }

            const result = await automationService.enrollContact(
                req.user.orgId,
                req.params.id,
                contactId
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
     * DELETE /api/automations/:id/contacts/:contactId
     * Remove contact from automation
     */
    async removeContact(req, res, next) {
        try {
            const result = await automationService.removeContact(
                req.user.orgId,
                req.params.id,
                req.params.contactId
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
     * GET /api/automations/stats
     * Get automation statistics
     */
    async getStats(req, res, next) {
        try {
            const stats = await automationService.getStats(req.user.orgId);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AutomationController();
