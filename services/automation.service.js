/**
 * Automation Service
 * 
 * Business logic for email automation workflows including
 * triggers, conditions, delays, and action execution.
 */

const Automation = require('../models/Automation.model');
const Contact = require('../models/Contact.model');
const Template = require('../models/Template.model');
const List = require('../models/List.model');
const { emailQueue, campaignQueue } = require('../queues');
const mongoose = require('mongoose');

class AutomationService {
    /**
     * Create a new automation
     */
    async create(orgId, automationData, userId) {
        // Validate automation name uniqueness
        const existing = await Automation.findOne({
            orgId,
            name: automationData.name,
            status: { $ne: 'deleted' },
        });

        if (existing) {
            throw new Error('Automation with this name already exists');
        }

        // Validate steps if provided
        if (automationData.steps) {
            await this.validateSteps(orgId, automationData.steps);
        }

        const automation = await Automation.create({
            orgId,
            ...automationData,
            status: 'draft',
            createdBy: userId,
        });

        return automation;
    }

    /**
     * Get automation by ID
     */
    async getById(orgId, automationId) {
        const automation = await Automation.findOne({
            _id: automationId,
            orgId,
            status: { $ne: 'deleted' },
        })
            .populate('trigger.listIds', 'name')
            .populate('createdBy', 'firstName lastName email');

        if (!automation) {
            throw new Error('Automation not found');
        }

        return automation;
    }

    /**
     * Get all automations
     */
    async getAll(orgId, options = {}) {
        const {
            page = 1,
            limit = 20,
            status,
            type,
            search,
            sortBy = 'updatedAt',
            sortOrder = 'desc',
        } = options;

        const query = {
            orgId,
            status: { $ne: 'deleted' },
        };

        if (status && status !== 'all') {
            query.status = status;
        }

        if (type) {
            query['trigger.type'] = type;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [automations, total] = await Promise.all([
            Automation.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .select('-steps'),
            Automation.countDocuments(query),
        ]);

        return {
            automations,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update automation
     */
    async update(orgId, automationId, updateData, userId) {
        const automation = await Automation.findOne({
            _id: automationId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!automation) {
            throw new Error('Automation not found');
        }

        // Can't edit active automation
        if (automation.status === 'active' && !updateData.forceUpdate) {
            throw new Error('Cannot edit active automation. Pause it first.');
        }

        // Validate steps if being updated
        if (updateData.steps) {
            await this.validateSteps(orgId, updateData.steps);
        }

        Object.assign(automation, updateData);
        automation.lastModifiedBy = userId;

        await automation.save();

        return automation;
    }

    /**
     * Delete automation
     */
    async delete(orgId, automationId) {
        const automation = await Automation.findOne({
            _id: automationId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!automation) {
            throw new Error('Automation not found');
        }

        // Can't delete active automation
        if (automation.status === 'active') {
            throw new Error('Cannot delete active automation. Pause it first.');
        }

        automation.status = 'deleted';
        await automation.save();

        return { message: 'Automation deleted successfully' };
    }

    /**
     * Activate automation
     */
    async activate(orgId, automationId, userId) {
        const automation = await Automation.findOne({
            _id: automationId,
            orgId,
            status: { $in: ['draft', 'paused'] },
        });

        if (!automation) {
            throw new Error('Automation not found or cannot be activated');
        }

        // Validate workflow
        const validation = automation.validateWorkflow();
        if (!validation.valid) {
            throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
        }

        automation.status = 'active';
        automation.activatedAt = new Date();
        automation.lastModifiedBy = userId;

        await automation.save();

        return automation;
    }

    /**
     * Pause automation
     */
    async pause(orgId, automationId, userId) {
        const automation = await Automation.findOne({
            _id: automationId,
            orgId,
            status: 'active',
        });

        if (!automation) {
            throw new Error('Automation not found or not active');
        }

        automation.status = 'paused';
        automation.lastModifiedBy = userId;

        await automation.save();

        return automation;
    }

    /**
     * Duplicate automation
     */
    async duplicate(orgId, automationId, newName, userId) {
        const original = await this.getById(orgId, automationId);

        const duplicated = new Automation({
            orgId,
            name: newName || `${original.name} (Copy)`,
            description: original.description,
            trigger: original.trigger,
            steps: original.steps,
            conditions: original.conditions,
            settings: original.settings,
            status: 'draft',
            createdBy: userId,
        });

        await duplicated.save();

        return duplicated;
    }

    /**
     * Validate automation steps
     */
    async validateSteps(orgId, steps) {
        for (const step of steps) {
            if (step.type === 'email' && step.config?.templateId) {
                const template = await Template.findOne({
                    _id: step.config.templateId,
                    orgId,
                    status: { $ne: 'deleted' },
                });

                if (!template) {
                    throw new Error(`Template not found for step: ${step.name}`);
                }
            }
        }
    }

    /**
     * Get contacts currently in automation
     */
    async getEnrolledContacts(orgId, automationId, options = {}) {
        const { page = 1, limit = 50 } = options;
        const skip = (page - 1) * limit;

        const [contacts, total] = await Promise.all([
            Contact.find({
                orgId,
                'automations.automationId': automationId,
                'automations.status': { $in: ['active', 'waiting'] },
            })
                .select('email firstName lastName automations')
                .skip(skip)
                .limit(limit),
            Contact.countDocuments({
                orgId,
                'automations.automationId': automationId,
                'automations.status': { $in: ['active', 'waiting'] },
            }),
        ]);

        // Extract automation-specific data
        const enrolledContacts = contacts.map(c => {
            const autoData = c.automations?.find(
                a => a.automationId.toString() === automationId
            );
            return {
                contactId: c._id,
                email: c.email,
                firstName: c.firstName,
                lastName: c.lastName,
                currentStep: autoData?.currentStep,
                status: autoData?.status,
                enteredAt: autoData?.enteredAt,
                nextActionAt: autoData?.nextActionAt,
            };
        });

        return {
            contacts: enrolledContacts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Manually enroll contact in automation
     */
    async enrollContact(orgId, automationId, contactId) {
        const automation = await this.getById(orgId, automationId);

        if (automation.status !== 'active') {
            throw new Error('Automation is not active');
        }

        const contact = await Contact.findOne({
            _id: contactId,
            orgId,
            status: 'subscribed',
        });

        if (!contact) {
            throw new Error('Contact not found or not subscribed');
        }

        // Check if already enrolled
        const existing = contact.automations?.find(
            a => a.automationId.toString() === automationId && a.status === 'active'
        );

        if (existing) {
            throw new Error('Contact is already enrolled in this automation');
        }

        // Add to automation
        contact.automations = contact.automations || [];
        contact.automations.push({
            automationId,
            status: 'active',
            currentStep: 0,
            enteredAt: new Date(),
            nextActionAt: new Date(),
        });

        await contact.save();

        // Update automation stats
        await Automation.updateOne(
            { _id: automationId },
            { $inc: { 'stats.totalEntered': 1, 'stats.currentlyActive': 1 } }
        );

        return { message: 'Contact enrolled successfully' };
    }

    /**
     * Remove contact from automation
     */
    async removeContact(orgId, automationId, contactId) {
        const contact = await Contact.findOne({
            _id: contactId,
            orgId,
        });

        if (!contact) {
            throw new Error('Contact not found');
        }

        const autoIndex = contact.automations?.findIndex(
            a => a.automationId.toString() === automationId
        );

        if (autoIndex === -1) {
            throw new Error('Contact is not in this automation');
        }

        // Update status to exited
        contact.automations[autoIndex].status = 'exited';
        contact.automations[autoIndex].exitedAt = new Date();
        contact.automations[autoIndex].exitReason = 'manual';

        await contact.save();

        // Update automation stats
        await Automation.updateOne(
            { _id: automationId },
            {
                $inc: { 'stats.currentlyActive': -1, 'stats.totalExited': 1 },
            }
        );

        return { message: 'Contact removed from automation' };
    }

    /**
     * Get automation statistics
     */
    async getStats(orgId) {
        const stats = await Automation.aggregate([
            { $match: { orgId: new mongoose.Types.ObjectId(orgId), status: { $ne: 'deleted' } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const totalStats = await Automation.aggregate([
            { $match: { orgId: new mongoose.Types.ObjectId(orgId), status: 'active' } },
            {
                $group: {
                    _id: null,
                    totalEntered: { $sum: '$stats.totalEntered' },
                    currentlyActive: { $sum: '$stats.currentlyActive' },
                    totalCompleted: { $sum: '$stats.totalCompleted' },
                    totalExited: { $sum: '$stats.totalExited' },
                    emailsSent: { $sum: '$stats.emailsSent' },
                },
            },
        ]);

        return {
            byStatus: stats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {}),
            totals: totalStats[0] || {},
            total: await Automation.countDocuments({ orgId, status: { $ne: 'deleted' } }),
        };
    }
}

module.exports = new AutomationService();
