/**
 * Contact Controller
 * 
 * HTTP request handlers for contact management.
 */

const contactService = require('../services/contact.service');

class ContactController {
    /**
     * POST /api/contacts
     * Create a new contact
     */
    async create(req, res, next) {
        try {
            const contact = await contactService.create(
                req.user.orgId,
                req.body,
                req.user.userId
            );

            res.status(201).json({
                success: true,
                message: 'Contact created successfully',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/contacts
     * Get all contacts with filters
     */
    async getAll(req, res, next) {
        try {
            const result = await contactService.getAll(req.user.orgId, {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                search: req.query.search,
                status: req.query.status,
                listId: req.query.listId,
                tag: req.query.tag,
                engagementLevel: req.query.engagementLevel,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
            });

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
     * GET /api/contacts/:id
     * Get contact by ID
     */
    async getById(req, res, next) {
        try {
            const contact = await contactService.getById(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/contacts/:id
     * Update contact
     */
    async update(req, res, next) {
        try {
            const contact = await contactService.update(
                req.user.orgId,
                req.params.id,
                req.body,
                req.user.userId
            );

            res.json({
                success: true,
                message: 'Contact updated successfully',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/contacts/:id
     * Delete contact
     */
    async delete(req, res, next) {
        try {
            const result = await contactService.delete(
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
     * POST /api/contacts/bulk-delete
     * Bulk delete contacts
     */
    async bulkDelete(req, res, next) {
        try {
            const { contactIds } = req.body;

            if (!contactIds || !Array.isArray(contactIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'contactIds array is required',
                });
            }

            const result = await contactService.bulkDelete(
                req.user.orgId,
                contactIds
            );

            res.json({
                success: true,
                message: result.message,
                deletedCount: result.deletedCount,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/:id/tags
     * Add tags to contact
     */
    async addTags(req, res, next) {
        try {
            const { tags } = req.body;

            if (!tags || !Array.isArray(tags)) {
                return res.status(400).json({
                    success: false,
                    message: 'tags array is required',
                });
            }

            const contact = await contactService.addTags(
                req.user.orgId,
                req.params.id,
                tags
            );

            res.json({
                success: true,
                message: 'Tags added successfully',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/contacts/:id/tags
     * Remove tags from contact
     */
    async removeTags(req, res, next) {
        try {
            const { tags } = req.body;

            if (!tags || !Array.isArray(tags)) {
                return res.status(400).json({
                    success: false,
                    message: 'tags array is required',
                });
            }

            const contact = await contactService.removeTags(
                req.user.orgId,
                req.params.id,
                tags
            );

            res.json({
                success: true,
                message: 'Tags removed successfully',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/bulk-tags
     * Bulk add tags to contacts
     */
    async bulkAddTags(req, res, next) {
        try {
            const { contactIds, tags } = req.body;

            if (!contactIds || !Array.isArray(contactIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'contactIds array is required',
                });
            }

            if (!tags || !Array.isArray(tags)) {
                return res.status(400).json({
                    success: false,
                    message: 'tags array is required',
                });
            }

            const result = await contactService.bulkAddTags(
                req.user.orgId,
                contactIds,
                tags
            );

            res.json({
                success: true,
                message: result.message,
                modifiedCount: result.modifiedCount,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/:id/lists/:listId
     * Add contact to list
     */
    async addToList(req, res, next) {
        try {
            const contact = await contactService.addToList(
                req.user.orgId,
                req.params.id,
                req.params.listId
            );

            res.json({
                success: true,
                message: 'Contact added to list',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/contacts/:id/lists/:listId
     * Remove contact from list
     */
    async removeFromList(req, res, next) {
        try {
            const contact = await contactService.removeFromList(
                req.user.orgId,
                req.params.id,
                req.params.listId
            );

            res.json({
                success: true,
                message: 'Contact removed from list',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/:id/unsubscribe
     * Unsubscribe contact
     */
    async unsubscribe(req, res, next) {
        try {
            const { reason, campaignId } = req.body;

            const contact = await contactService.unsubscribe(
                req.user.orgId,
                req.params.id,
                reason || 'Unsubscribed via API',
                campaignId
            );

            res.json({
                success: true,
                message: 'Contact unsubscribed',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/:id/resubscribe
     * Resubscribe contact
     */
    async resubscribe(req, res, next) {
        try {
            const contact = await contactService.resubscribe(
                req.user.orgId,
                req.params.id
            );

            res.json({
                success: true,
                message: 'Contact resubscribed',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/import
     * Import contacts from CSV
     */
    async importCSV(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'CSV file is required',
                });
            }

            const options = {
                listId: req.body.listId,
                tags: req.body.tags ? JSON.parse(req.body.tags) : [],
                updateExisting: req.body.updateExisting === 'true',
            };

            const result = await contactService.importCSV(
                req.user.orgId,
                req.file.buffer,
                options,
                req.user.userId
            );

            res.json({
                success: true,
                message: `Import completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/contacts/export
     * Export contacts to CSV
     */
    async exportCSV(req, res, next) {
        try {
            const rows = await contactService.exportCSV(req.user.orgId, {
                listId: req.query.listId,
                status: req.query.status,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
            });

            // Generate CSV content
            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No contacts to export',
                });
            }

            const headers = Object.keys(rows[0]);
            const csvContent = [
                headers.join(','),
                ...rows.map(row => headers.map(h => `"${row[h] || ''}"`).join(',')),
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=contacts_${Date.now()}.csv`);
            res.send(csvContent);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/contacts/duplicates
     * Find duplicate contacts
     */
    async findDuplicates(req, res, next) {
        try {
            const field = req.query.field || 'email';
            const duplicates = await contactService.findDuplicates(
                req.user.orgId,
                field
            );

            res.json({
                success: true,
                data: duplicates,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/contacts/merge
     * Merge duplicate contacts
     */
    async mergeDuplicates(req, res, next) {
        try {
            const { primaryId, duplicateIds } = req.body;

            if (!primaryId || !duplicateIds || !Array.isArray(duplicateIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'primaryId and duplicateIds array are required',
                });
            }

            const contact = await contactService.mergeDuplicates(
                req.user.orgId,
                primaryId,
                duplicateIds
            );

            res.json({
                success: true,
                message: 'Contacts merged successfully',
                data: contact,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/contacts/tags
     * Get all unique tags
     */
    async getAllTags(req, res, next) {
        try {
            const tags = await contactService.getAllTags(req.user.orgId);

            res.json({
                success: true,
                data: tags,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/contacts/stats
     * Get contact statistics
     */
    async getStats(req, res, next) {
        try {
            const stats = await contactService.getStats(req.user.orgId);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ContactController();
