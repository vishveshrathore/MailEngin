/**
 * Template Controller
 * 
 * HTTP request handlers for template management.
 */

const templateService = require('../services/template.service');

class TemplateController {
    /**
     * POST /api/templates
     * Create a new template
     */
    async create(req, res, next) {
        try {
            const template = await templateService.create(
                req.user.orgId,
                req.body,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Template created successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates
     * Get all templates with filters
     */
    async getAll(req, res, next) {
        try {
            const result = await templateService.getAll(req.user.orgId, {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search,
                type: req.query.type,
                category: req.query.category,
                status: req.query.status,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

            res.json({
                success: true,
                data: result.templates,
                pagination: result.pagination,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/:id
     * Get template by ID
     */
    async getById(req, res, next) {
        try {
            const template = await templateService.getById(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/templates/:id
     * Update template
     */
    async update(req, res, next) {
        try {
            const template = await templateService.update(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Template updated successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/templates/:id
     * Delete template
     */
    async delete(req, res, next) {
        try {
            const result = await templateService.delete(
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
     * POST /api/templates/:id/duplicate
     * Duplicate template
     */
    async duplicate(req, res, next) {
        try {
            const { name } = req.body;

            const template = await templateService.duplicate(
                req.user.orgId,
                req.params.id,
                name,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Template duplicated successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/:id/versions
     * Get template versions
     */
    async getVersions(req, res, next) {
        try {
            const result = await templateService.getVersions(
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
     * POST /api/templates/:id/versions/:version/restore
     * Restore a specific version
     */
    async restoreVersion(req, res, next) {
        try {
            const version = parseInt(req.params.version);

            const template = await templateService.restoreVersion(
                req.user.orgId,
                req.params.id,
                version,
                req.user.userId
            );

            res.json({
                success: true,
                message: `Restored to version ${version}`,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/:id/variables
     * Extract variables from template
     */
    async getVariables(req, res, next) {
        try {
            const variables = await templateService.extractVariables(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: variables,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/templates/:id/preview
     * Preview template with sample data
     */
    async preview(req, res, next) {
        try {
            const preview = await templateService.preview(
                req.user.orgId,
                req.params.id,
                req.body
            );

            res.json({
                success: true,
                data: preview,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/templates/preview-html
     * Preview raw HTML with sample data (without saving)
     */
    async previewHtml(req, res, next) {
        try {
            const { html, subject, sampleData } = req.body;

            if (!html) {
                return res.status(400).json({
                    success: false,
                    message: 'HTML content is required',
                });
            }

            // Create temporary template object for rendering
            const Template = require('../models/Template.model');
            const tempTemplate = new Template({
                htmlContent: html,
                subject: subject || 'Preview',
            });

            // Default sample data
            const defaultData = {
                contact: {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@example.com',
                    company: 'Acme Inc',
                },
                organization: {
                    name: 'Your Company',
                    address: '123 Main St, City, Country',
                },
                unsubscribe_link: '#unsubscribe',
                current_year: new Date().getFullYear().toString(),
            };

            const mergedData = { ...defaultData, ...sampleData };
            tempTemplate.extractVariables();
            const rendered = tempTemplate.render(mergedData);

            // Validate HTML
            const validation = templateService.validateHtml(html);

            res.json({
                success: true,
                data: {
                    subject: rendered.subject,
                    html: rendered.html,
                    text: rendered.text,
                    variables: tempTemplate.extractVariables(),
                    validation,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/templates/:id/status
     * Update template status
     */
    async updateStatus(req, res, next) {
        try {
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required',
                });
            }

            const template = await templateService.updateStatus(
                req.user.orgId,
                req.params.id,
                status,
                req.user.userId
            );

            res.json({
                success: true,
                message: `Template status updated to ${status}`,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/templates/:id/variants
     * Add A/B variant
     */
    async addVariant(req, res, next) {
        try {
            const template = await templateService.addVariant(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Variant added successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/templates/:id/variants/:index
     * Remove A/B variant
     */
    async removeVariant(req, res, next) {
        try {
            const variantIndex = parseInt(req.params.index);

            const template = await templateService.removeVariant(
                req.user.orgId,
                req.params.id,
                variantIndex,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Variant removed successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/categories
     * Get all categories
     */
    async getCategories(req, res, next) {
        try {
            const categories = await templateService.getCategories(req.user.orgId);

            res.json({
                success: true,
                data: categories,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/tags
     * Get all unique tags
     */
    async getTags(req, res, next) {
        try {
            const tags = await templateService.getTags(req.user.orgId);

            res.json({
                success: true,
                data: tags,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/templates/stats
     * Get template statistics
     */
    async getStats(req, res, next) {
        try {
            const stats = await templateService.getStats(req.user.orgId);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/templates/validate
     * Validate HTML content
     */
    async validateHtml(req, res, next) {
        try {
            const { html } = req.body;

            if (!html) {
                return res.status(400).json({
                    success: false,
                    message: 'HTML content is required',
                });
            }

            const validation = templateService.validateHtml(html);

            res.json({
                success: true,
                data: validation,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new TemplateController();
