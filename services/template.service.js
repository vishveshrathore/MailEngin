/**
 * Template Service
 * 
 * Business logic for email template management including
 * CRUD, versioning, variable extraction, and preview.
 */

const Template = require('../models/Template.model');

class TemplateService {
    /**
     * Create a new template
     */
    async create(orgId, templateData, userId) {
        // Check for duplicate name
        const existing = await Template.findOne({
            orgId,
            name: templateData.name,
            status: { $ne: 'deleted' },
        });

        if (existing) {
            throw new Error('Template with this name already exists');
        }

        const template = await Template.create({
            orgId,
            ...templateData,
            createdBy: userId,
            status: 'draft',
        });

        return template;
    }

    /**
     * Get template by ID
     */
    async getById(orgId, templateId) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!template) {
            throw new Error('Template not found');
        }

        return template;
    }

    /**
     * Get all templates with filters
     */
    async getAll(orgId, options = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            type,
            category,
            status,
            tags,
            sortBy = 'updatedAt',
            sortOrder = 'desc',
        } = options;

        const query = {
            orgId,
            status: { $ne: 'deleted' },
        };

        if (type) {
            query.type = type;
        }

        if (category) {
            query.category = category;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        if (tags && tags.length > 0) {
            query.tags = { $in: tags };
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [templates, total] = await Promise.all([
            Template.find(query)
                .select('-htmlContent -textContent -versions')
                .sort(sort)
                .skip(skip)
                .limit(limit),
            Template.countDocuments(query),
        ]);

        return {
            templates,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update template
     */
    async update(orgId, templateId, updateData, userId, createVersion = true) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!template) {
            throw new Error('Template not found');
        }

        // Check name uniqueness if name is being changed
        if (updateData.name && updateData.name !== template.name) {
            const existing = await Template.findOne({
                orgId,
                name: updateData.name,
                _id: { $ne: templateId },
                status: { $ne: 'deleted' },
            });

            if (existing) {
                throw new Error('Template with this name already exists');
            }
        }

        // Create version before updating if content changed
        if (createVersion && (updateData.htmlContent || updateData.subject)) {
            await template.createVersion(
                updateData.versionNote || 'Updated via API',
                userId
            );
        }

        // Update fields
        Object.assign(template, updateData);
        template.lastModifiedBy = userId;

        await template.save();

        return template;
    }

    /**
     * Delete template (soft delete)
     */
    async delete(orgId, templateId) {
        const template = await Template.findOneAndUpdate(
            { _id: templateId, orgId, status: { $ne: 'deleted' } },
            { status: 'deleted' },
            { new: true }
        );

        if (!template) {
            throw new Error('Template not found');
        }

        return { message: 'Template deleted successfully' };
    }

    /**
     * Duplicate template
     */
    async duplicate(orgId, templateId, newName, userId) {
        const original = await this.getById(orgId, templateId);

        const cloned = original.clone(newName);
        cloned.createdBy = userId;
        cloned.orgId = orgId;

        await cloned.save();

        return cloned;
    }

    /**
     * Get template versions
     */
    async getVersions(orgId, templateId) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        }).select('versions currentVersion');

        if (!template) {
            throw new Error('Template not found');
        }

        return {
            currentVersion: template.currentVersion,
            versions: template.versions.sort((a, b) => b.version - a.version),
        };
    }

    /**
     * Restore a specific version
     */
    async restoreVersion(orgId, templateId, versionNumber, userId) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!template) {
            throw new Error('Template not found');
        }

        // Save current state as a version first
        await template.createVersion(`Before restoring to v${versionNumber}`, userId);

        // Restore the version
        template.restoreVersion(versionNumber);
        template.lastModifiedBy = userId;

        await template.save();

        return template;
    }

    /**
     * Extract variables from template content
     */
    async extractVariables(orgId, templateId) {
        const template = await this.getById(orgId, templateId);
        return template.extractVariables();
    }

    /**
     * Preview template with sample data
     */
    async preview(orgId, templateId, sampleData = {}) {
        const template = await this.getById(orgId, templateId);

        // Default sample data
        const defaultData = {
            contact: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                company: 'Acme Inc',
            },
            organization: {
                name: 'MailEngin',
                address: '123 Main St, City, Country',
            },
            unsubscribe_link: '#unsubscribe',
            view_in_browser_link: '#view-in-browser',
            current_date: new Date().toLocaleDateString(),
            current_year: new Date().getFullYear().toString(),
        };

        const mergedData = this.deepMerge(defaultData, sampleData);
        const rendered = template.render(mergedData);

        return {
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            variables: template.extractVariables(),
        };
    }

    /**
     * Render template with actual contact data
     */
    async renderForContact(orgId, templateId, contact, additionalData = {}) {
        const template = await this.getById(orgId, templateId);

        const data = {
            contact: {
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                email: contact.email,
                company: contact.company || '',
                phone: contact.phone || '',
                ...Object.fromEntries(contact.customFields || new Map()),
            },
            ...additionalData,
        };

        return template.render(data);
    }

    /**
     * Get all categories in organization
     */
    async getCategories(orgId) {
        const categories = await Template.distinct('category', {
            orgId,
            status: { $ne: 'deleted' },
        });

        return categories.filter(Boolean).sort();
    }

    /**
     * Get all unique tags
     */
    async getTags(orgId) {
        const tags = await Template.distinct('tags', {
            orgId,
            status: { $ne: 'deleted' },
        });

        return tags.sort();
    }

    /**
     * Update template status
     */
    async updateStatus(orgId, templateId, status, userId) {
        const validStatuses = ['draft', 'active', 'archived'];

        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const template = await Template.findOneAndUpdate(
            { _id: templateId, orgId, status: { $ne: 'deleted' } },
            { status, lastModifiedBy: userId },
            { new: true }
        );

        if (!template) {
            throw new Error('Template not found');
        }

        return template;
    }

    /**
     * Add A/B variant
     */
    async addVariant(orgId, templateId, variant, userId) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!template) {
            throw new Error('Template not found');
        }

        template.variants.push({
            name: variant.name,
            subject: variant.subject,
            htmlContent: variant.htmlContent,
            textContent: variant.textContent,
            stats: { sent: 0, opened: 0, clicked: 0 },
        });

        template.lastModifiedBy = userId;
        await template.save();

        return template;
    }

    /**
     * Remove A/B variant
     */
    async removeVariant(orgId, templateId, variantIndex, userId) {
        const template = await Template.findOne({
            _id: templateId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!template) {
            throw new Error('Template not found');
        }

        if (variantIndex < 0 || variantIndex >= template.variants.length) {
            throw new Error('Variant not found');
        }

        template.variants.splice(variantIndex, 1);
        template.lastModifiedBy = userId;
        await template.save();

        return template;
    }

    /**
     * Get template statistics
     */
    async getStats(orgId) {
        const stats = await Template.aggregate([
            { $match: { orgId, status: { $ne: 'deleted' } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const categoryStats = await Template.aggregate([
            { $match: { orgId, status: { $ne: 'deleted' } } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                },
            },
        ]);

        const topPerforming = await Template.find({
            orgId,
            status: 'active',
            'stats.timesUsed': { $gt: 0 },
        })
            .sort({ 'stats.avgOpenRate': -1 })
            .limit(5)
            .select('name stats.timesUsed stats.avgOpenRate stats.avgClickRate');

        return {
            byStatus: stats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {}),
            byCategory: categoryStats.reduce((acc, s) => {
                acc[s._id || 'Uncategorized'] = s.count;
                return acc;
            }, {}),
            topPerforming,
            total: await Template.countDocuments({ orgId, status: { $ne: 'deleted' } }),
        };
    }

    /**
     * Deep merge helper
     */
    deepMerge(target, source) {
        const result = { ...target };

        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    /**
     * Validate HTML content
     */
    validateHtml(html) {
        const warnings = [];

        // Check for unsubscribe link
        if (!html.includes('{{unsubscribe_link}}') && !html.includes('unsubscribe')) {
            warnings.push('Missing unsubscribe link (required for compliance)');
        }

        // Check for physical address
        if (!html.includes('{{organization.address}}') && !html.includes('address')) {
            warnings.push('Missing physical address (required for CAN-SPAM compliance)');
        }

        // Check for very large images
        const imgMatches = html.match(/<img[^>]+>/gi) || [];
        if (imgMatches.length > 20) {
            warnings.push('Too many images may affect email deliverability');
        }

        // Check for inline styles vs external
        if (html.includes('<link') && html.includes('stylesheet')) {
            warnings.push('External stylesheets are not supported in most email clients');
        }

        return {
            valid: warnings.length === 0,
            warnings,
        };
    }
}

module.exports = new TemplateService();
