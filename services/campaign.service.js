/**
 * Campaign Service
 * 
 * Business logic for email campaign management including
 * CRUD, scheduling, recipient selection, and status management.
 */

const Campaign = require('../models/Campaign.model');
const Contact = require('../models/Contact.model');
const List = require('../models/List.model');
const Segment = require('../models/Segment.model');
const Template = require('../models/Template.model');
const mongoose = require('mongoose');

class CampaignService {
    /**
     * Create a new campaign (draft)
     */
    async create(orgId, campaignData, userId) {
        // Check for duplicate name
        const existing = await Campaign.findOne({
            orgId,
            name: campaignData.name,
            status: { $ne: 'deleted' },
        });

        if (existing) {
            throw new Error('Campaign with this name already exists');
        }

        // Validate template if provided
        if (campaignData.email?.templateId) {
            const template = await Template.findOne({
                _id: campaignData.email.templateId,
                orgId,
                status: { $ne: 'deleted' },
            });

            if (!template) {
                throw new Error('Template not found');
            }
        }

        const campaign = await Campaign.create({
            orgId,
            ...campaignData,
            status: 'draft',
            createdBy: userId,
        });

        return campaign;
    }

    /**
     * Get campaign by ID
     */
    async getById(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        })
            .populate('email.templateId', 'name subject')
            .populate('recipients.lists', 'name stats.total')
            .populate('recipients.segments', 'name cachedCount')
            .populate('createdBy', 'firstName lastName email');

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        return campaign;
    }

    /**
     * Get all campaigns with filters
     */
    async getAll(orgId, options = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            status,
            type,
            tags,
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
            query.type = type;
        }

        if (tags && tags.length > 0) {
            query.tags = { $in: tags };
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'email.subject': { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [campaigns, total] = await Promise.all([
            Campaign.find(query)
                .select('-analytics.linkClicks')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('email.templateId', 'name'),
            Campaign.countDocuments(query),
        ]);

        return {
            campaigns,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update campaign
     */
    async update(orgId, campaignId, updateData, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Check if campaign is editable
        if (!campaign.isEditable) {
            throw new Error('Campaign cannot be edited in its current state');
        }

        // Check name uniqueness if name is being changed
        if (updateData.name && updateData.name !== campaign.name) {
            const existing = await Campaign.findOne({
                orgId,
                name: updateData.name,
                _id: { $ne: campaignId },
                status: { $ne: 'deleted' },
            });

            if (existing) {
                throw new Error('Campaign with this name already exists');
            }
        }

        // Validate template if being changed
        if (updateData.email?.templateId) {
            const template = await Template.findOne({
                _id: updateData.email.templateId,
                orgId,
                status: { $ne: 'deleted' },
            });

            if (!template) {
                throw new Error('Template not found');
            }
        }

        // Update fields
        Object.assign(campaign, updateData);
        campaign.lastModifiedBy = userId;

        await campaign.save();

        return campaign;
    }

    /**
     * Delete campaign (soft delete)
     */
    async delete(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Can't delete sending or completed campaigns
        if (['sending', 'sent'].includes(campaign.status)) {
            throw new Error('Cannot delete a campaign that is sending or sent');
        }

        campaign.status = 'deleted';
        await campaign.save();

        return { message: 'Campaign deleted successfully' };
    }

    /**
     * Duplicate campaign
     */
    async duplicate(orgId, campaignId, newName, userId) {
        const original = await this.getById(orgId, campaignId);

        const cloned = await original.clone(newName);
        cloned.createdBy = userId;
        cloned.orgId = orgId;

        await cloned.save();

        return cloned;
    }

    /**
     * Set campaign recipients (lists and segments)
     */
    async setRecipients(orgId, campaignId, recipients, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $in: ['draft', 'scheduled'] },
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be modified');
        }

        // Validate lists
        if (recipients.lists && recipients.lists.length > 0) {
            const validLists = await List.countDocuments({
                _id: { $in: recipients.lists },
                orgId,
                status: 'active',
            });

            if (validLists !== recipients.lists.length) {
                throw new Error('One or more lists are invalid');
            }
        }

        // Validate segments
        if (recipients.segments && recipients.segments.length > 0) {
            const validSegments = await Segment.countDocuments({
                _id: { $in: recipients.segments },
                orgId,
                status: 'active',
            });

            if (validSegments !== recipients.segments.length) {
                throw new Error('One or more segments are invalid');
            }
        }

        // Validate exclusion lists
        if (recipients.excludeLists && recipients.excludeLists.length > 0) {
            const validExclusions = await List.countDocuments({
                _id: { $in: recipients.excludeLists },
                orgId,
            });

            if (validExclusions !== recipients.excludeLists.length) {
                throw new Error('One or more exclusion lists are invalid');
            }
        }

        campaign.recipients = recipients;
        campaign.lastModifiedBy = userId;

        // Recalculate recipient count
        await campaign.calculateRecipients();

        return campaign;
    }

    /**
     * Calculate estimated recipients
     */
    async calculateRecipients(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        });

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        await campaign.calculateRecipients();

        return {
            estimatedTotal: campaign.recipients.estimatedTotal,
            calculatedAt: campaign.recipients.calculatedAt,
        };
    }

    /**
     * Get recipient preview
     */
    async getRecipientPreview(orgId, campaignId, limit = 100) {
        const campaign = await this.getById(orgId, campaignId);

        // Build recipient query
        const query = await this.buildRecipientQuery(campaign);

        const contacts = await Contact.find(query)
            .select('email firstName lastName engagement.score status')
            .limit(limit)
            .lean();

        const total = await Contact.countDocuments(query);

        return {
            contacts,
            total,
            showing: contacts.length,
        };
    }

    /**
     * Build MongoDB query for campaign recipients
     */
    async buildRecipientQuery(campaign) {
        const query = {
            orgId: campaign.orgId,
            status: 'subscribed',
        };

        const conditions = [];

        // Add list conditions
        if (campaign.recipients.lists && campaign.recipients.lists.length > 0) {
            conditions.push({
                'lists.listId': { $in: campaign.recipients.lists },
                'lists.status': 'active',
            });
        }

        // Add segment conditions
        if (campaign.recipients.segments && campaign.recipients.segments.length > 0) {
            for (const segmentId of campaign.recipients.segments) {
                const segment = await Segment.findById(segmentId);
                if (segment) {
                    const segmentQuery = segment.buildQuery();
                    conditions.push(segmentQuery);
                }
            }
        }

        if (conditions.length > 0) {
            query.$or = conditions;
        }

        // Add exclusions
        if (campaign.recipients.excludeLists && campaign.recipients.excludeLists.length > 0) {
            query['lists.listId'] = { $nin: campaign.recipients.excludeLists };
        }

        if (campaign.recipients.excludeSegments && campaign.recipients.excludeSegments.length > 0) {
            for (const segmentId of campaign.recipients.excludeSegments) {
                const segment = await Segment.findById(segmentId);
                if (segment) {
                    const excludeQuery = segment.buildQuery();
                    Object.assign(query, { $nor: [excludeQuery] });
                }
            }
        }

        return query;
    }

    /**
     * Schedule campaign
     */
    async schedule(orgId, campaignId, scheduleData, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: 'draft',
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be scheduled');
        }

        // Validate campaign is ready
        const validation = await this.validateForSend(campaign);
        if (!validation.valid) {
            throw new Error(`Campaign not ready: ${validation.errors.join(', ')}`);
        }

        // Set schedule
        campaign.schedule = {
            type: scheduleData.type || 'scheduled',
            scheduledAt: new Date(scheduleData.scheduledAt),
            timezone: scheduleData.timezone || 'UTC',
        };

        campaign.status = 'scheduled';
        campaign.lastModifiedBy = userId;

        await campaign.save();

        return campaign;
    }

    /**
     * Send campaign immediately
     */
    async sendNow(orgId, campaignId, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $in: ['draft', 'scheduled'] },
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be sent');
        }

        // Validate campaign is ready
        const validation = await this.validateForSend(campaign);
        if (!validation.valid) {
            throw new Error(`Campaign not ready: ${validation.errors.join(', ')}`);
        }

        // Update status to queued (worker will pick it up)
        campaign.schedule = {
            type: 'immediate',
            scheduledAt: new Date(),
        };
        campaign.status = 'queued';
        campaign.lastModifiedBy = userId;

        await campaign.save();

        return campaign;
    }

    /**
     * Pause campaign
     */
    async pause(orgId, campaignId, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: 'sending',
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be paused');
        }

        await campaign.pause();
        campaign.lastModifiedBy = userId;
        await campaign.save();

        return campaign;
    }

    /**
     * Resume campaign
     */
    async resume(orgId, campaignId, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: 'paused',
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be resumed');
        }

        await campaign.resume();
        campaign.lastModifiedBy = userId;
        await campaign.save();

        return campaign;
    }

    /**
     * Cancel campaign
     */
    async cancel(orgId, campaignId, userId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $in: ['scheduled', 'queued', 'sending', 'paused'] },
        });

        if (!campaign) {
            throw new Error('Campaign not found or cannot be cancelled');
        }

        await campaign.cancel();
        campaign.lastModifiedBy = userId;
        await campaign.save();

        return campaign;
    }

    /**
     * Validate campaign is ready for sending
     */
    async validateForSend(campaign) {
        const errors = [];

        // Check email content
        if (!campaign.email?.subject) {
            errors.push('Subject line is required');
        }

        if (!campaign.email?.templateId && !campaign.email?.htmlContent) {
            errors.push('Email content is required (template or HTML)');
        }

        // Check recipients
        if (
            (!campaign.recipients.lists || campaign.recipients.lists.length === 0) &&
            (!campaign.recipients.segments || campaign.recipients.segments.length === 0)
        ) {
            errors.push('At least one list or segment is required');
        }

        // Calculate recipients if not done
        if (!campaign.recipients.estimatedTotal) {
            await campaign.calculateRecipients();
        }

        if (campaign.recipients.estimatedTotal === 0) {
            errors.push('No recipients to send to');
        }

        // Validate A/B test if enabled
        if (campaign.abTest?.enabled) {
            if (!campaign.abTest.variants || campaign.abTest.variants.length < 2) {
                errors.push('A/B test requires at least 2 variants');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            recipientCount: campaign.recipients.estimatedTotal,
        };
    }

    /**
     * Get campaign analytics
     */
    async getAnalytics(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        }).select('analytics progress status');

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Calculate additional metrics
        const metrics = {
            ...campaign.analytics.toObject(),
            deliveryRate: this.calculateRate(campaign.analytics.delivered, campaign.analytics.sent),
            bounceRate: this.calculateRate(campaign.analytics.bounced, campaign.analytics.sent),
            uniqueOpenRate: this.calculateRate(campaign.analytics.uniqueOpens, campaign.analytics.delivered),
            uniqueClickRate: this.calculateRate(campaign.analytics.uniqueClicks, campaign.analytics.delivered),
            clickToOpenRate: this.calculateRate(campaign.analytics.uniqueClicks, campaign.analytics.uniqueOpens),
            progress: campaign.progress,
            status: campaign.status,
        };

        return metrics;
    }

    /**
     * Get campaign activity/events
     */
    async getActivity(orgId, campaignId, options = {}) {
        const { page = 1, limit = 50, type } = options;

        const campaign = await this.getById(orgId, campaignId);

        const EmailLog = require('../models/EmailLog.model');

        const query = {
            orgId,
            campaignId: campaign._id,
        };

        if (type) {
            query.status = type;
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            EmailLog.find(query)
                .select('email status events createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('contactId', 'firstName lastName email'),
            EmailLog.countDocuments(query),
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get campaign statistics summary
     */
    async getStats(orgId) {
        const stats = await Campaign.aggregate([
            { $match: { orgId: new mongoose.Types.ObjectId(orgId), status: { $ne: 'deleted' } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const sentStats = await Campaign.aggregate([
            { $match: { orgId: new mongoose.Types.ObjectId(orgId), status: 'sent' } },
            {
                $group: {
                    _id: null,
                    totalSent: { $sum: '$analytics.sent' },
                    totalOpens: { $sum: '$analytics.uniqueOpens' },
                    totalClicks: { $sum: '$analytics.uniqueClicks' },
                    avgOpenRate: { $avg: '$analytics.openRate' },
                    avgClickRate: { $avg: '$analytics.clickRate' },
                },
            },
        ]);

        const recentCampaigns = await Campaign.find({
            orgId,
            status: 'sent',
        })
            .sort({ 'schedule.scheduledAt': -1 })
            .limit(5)
            .select('name analytics.openRate analytics.clickRate schedule.scheduledAt');

        return {
            byStatus: stats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {}),
            totals: sentStats[0] || {},
            recentCampaigns,
            total: await Campaign.countDocuments({ orgId, status: { $ne: 'deleted' } }),
        };
    }

    /**
     * Helper: Calculate rate percentage
     */
    calculateRate(numerator, denominator) {
        if (!denominator || denominator === 0) return 0;
        return Math.round((numerator / denominator) * 10000) / 100;
    }

    /**
     * Get campaigns ready to send (for scheduler)
     */
    async getReadyToSend() {
        return Campaign.findReadyToSend();
    }

    /**
     * Update campaign progress (called by worker)
     */
    async updateProgress(campaignId, progress) {
        await Campaign.findByIdAndUpdate(campaignId, {
            'progress.processed': progress.processed,
            'progress.failed': progress.failed,
            'progress.percentage': progress.percentage,
        });
    }

    /**
     * Mark campaign as complete (called by worker)
     */
    async markComplete(campaignId) {
        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'sent';
            campaign.completedAt = new Date();
            campaign.progress.percentage = 100;
            campaign.recalculateRates();
            await campaign.save();
        }
    }
}

module.exports = new CampaignService();
