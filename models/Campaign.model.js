const mongoose = require('mongoose');

/**
 * Campaign Model
 * 
 * Represents an email campaign (one-time send or scheduled).
 * Tracks sending progress and analytics.
 * 
 * Relations:
 * - Belongs to Organization
 * - Uses one Template
 * - Targets one or more Lists/Segments
 * - Generates many EmailLogs
 * - Created by User
 */

const campaignSchema = new mongoose.Schema({
    // Organization reference
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },

    // Basic Info
    name: {
        type: String,
        required: [true, 'Campaign name is required'],
        trim: true,
        maxlength: [100, 'Campaign name cannot exceed 100 characters'],
    },
    description: String,

    // Campaign type
    type: {
        type: String,
        enum: ['regular', 'ab_test', 'rss', 'automated'],
        default: 'regular',
    },

    // Email content (can override template)
    email: {
        subject: {
            type: String,
            required: [true, 'Subject line is required'],
        },
        preheader: String,
        fromName: String,      // Override org default
        fromEmail: String,     // Override org default  
        replyTo: String,

        // Template reference
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Template',
        },

        // Inline content (if not using template)
        htmlContent: String,
        textContent: String,
    },

    // A/B Testing configuration
    abTest: {
        enabled: { type: Boolean, default: false },
        testType: {
            type: String,
            enum: ['subject', 'content', 'from_name', 'send_time'],
        },
        variants: [{
            name: String,
            subject: String,
            htmlContent: String,
            fromName: String,
            percentage: Number,   // Percentage of audience to receive this variant
            isWinner: { type: Boolean, default: false },
        }],
        testSize: {
            type: Number,
            default: 20,  // Percentage of audience for testing
            min: 5,
            max: 50,
        },
        winnerCriteria: {
            type: String,
            enum: ['open_rate', 'click_rate', 'revenue'],
            default: 'open_rate',
        },
        testDurationHours: {
            type: Number,
            default: 4,
        },
        winnerSelectedAt: Date,
    },

    // Recipients configuration
    recipients: {
        // Target lists
        lists: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'List',
        }],

        // Target segments
        segments: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Segment',
        }],

        // Exclusion lists
        excludeLists: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'List',
        }],

        // Exclusion segments  
        excludeSegments: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Segment',
        }],

        // Exclude contacts who received campaign in last X days
        excludeRecentRecipients: {
            enabled: { type: Boolean, default: false },
            days: { type: Number, default: 7 },
        },

        // Calculated recipient count (at time of send)
        estimatedCount: { type: Number, default: 0 },
        actualCount: { type: Number, default: 0 },
    },

    // Scheduling
    schedule: {
        type: {
            type: String,
            enum: ['immediate', 'scheduled', 'optimal'],
            default: 'immediate',
        },
        scheduledAt: Date,
        timezone: String,

        // Smart send: optimize send time per contact
        optimizeSendTime: { type: Boolean, default: false },

        // Batch sending (spread over time)
        batchSending: {
            enabled: { type: Boolean, default: false },
            batchSize: Number,
            intervalMinutes: Number,
        },
    },

    // Tracking settings
    tracking: {
        opens: { type: Boolean, default: true },
        clicks: { type: Boolean, default: true },
        googleAnalytics: {
            enabled: { type: Boolean, default: false },
            source: String,
            medium: { type: String, default: 'email' },
            campaign: String,
        },
    },

    // Campaign status
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'queued', 'sending', 'paused', 'sent', 'cancelled', 'failed'],
        default: 'draft',
        index: true,
    },

    // Progress tracking
    progress: {
        totalToSend: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        currentBatch: { type: Number, default: 0 },
        totalBatches: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        pausedAt: Date,
        estimatedCompletion: Date,
        lastProcessedAt: Date,
    },

    // Analytics (updated by analytics worker)
    analytics: {
        // Delivery metrics
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 },
        softBounced: { type: Number, default: 0 },
        hardBounced: { type: Number, default: 0 },

        // Engagement metrics
        opened: { type: Number, default: 0 },
        uniqueOpens: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        uniqueClicks: { type: Number, default: 0 },

        // Negative metrics
        unsubscribed: { type: Number, default: 0 },
        complained: { type: Number, default: 0 },

        // Rates (calculated)
        deliveryRate: { type: Number, default: 0 },
        openRate: { type: Number, default: 0 },
        clickRate: { type: Number, default: 0 },
        clickToOpenRate: { type: Number, default: 0 },
        bounceRate: { type: Number, default: 0 },
        unsubscribeRate: { type: Number, default: 0 },
        complaintRate: { type: Number, default: 0 },

        // Link clicks breakdown
        linkClicks: [{
            url: String,
            clicks: { type: Number, default: 0 },
            uniqueClicks: { type: Number, default: 0 },
        }],

        // Time-based analytics
        opensByHour: {
            type: Map,
            of: Number,
        },
        clicksByHour: {
            type: Map,
            of: Number,
        },

        // Device breakdown
        devices: {
            desktop: { type: Number, default: 0 },
            mobile: { type: Number, default: 0 },
            tablet: { type: Number, default: 0 },
        },

        // Email client breakdown
        emailClients: {
            type: Map,
            of: Number,
        },

        // Location breakdown
        locations: [{
            country: String,
            opens: { type: Number, default: 0 },
            clicks: { type: Number, default: 0 },
        }],

        lastUpdatedAt: Date,
    },

    // Revenue tracking (if e-commerce integration)
    revenue: {
        enabled: { type: Boolean, default: false },
        totalRevenue: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
        avgOrderValue: { type: Number, default: 0 },
    },

    // Tags
    tags: [{
        type: String,
        trim: true,
        lowercase: true,
    }],

    // Internal notes
    notes: String,

    // Error tracking
    errors: [{
        message: String,
        code: String,
        count: Number,
        lastOccurredAt: Date,
    }],

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Primary lookup
campaignSchema.index({ orgId: 1, status: 1 });

// Scheduler queries (find campaigns to send)
campaignSchema.index({ status: 1, 'schedule.scheduledAt': 1 });

// Performance queries
campaignSchema.index({ orgId: 1, 'analytics.openRate': -1 });

// Type filtering
campaignSchema.index({ orgId: 1, type: 1, status: 1 });

// Date-based queries
campaignSchema.index({ orgId: 1, createdAt: -1 });
campaignSchema.index({ orgId: 1, 'progress.completedAt': -1 });

// Tag filtering
campaignSchema.index({ orgId: 1, tags: 1 });

// Template usage tracking
campaignSchema.index({ 'email.templateId': 1 });

// ============ VIRTUALS ============

campaignSchema.virtual('isActive').get(function () {
    return ['sending', 'queued', 'scheduled'].includes(this.status);
});

campaignSchema.virtual('canEdit').get(function () {
    return ['draft', 'scheduled'].includes(this.status);
});

campaignSchema.virtual('performanceScore').get(function () {
    // Weighted score: 50% open rate, 30% click rate, 20% no complaints/bounces
    const openScore = Math.min(this.analytics.openRate / 30, 1) * 50;
    const clickScore = Math.min(this.analytics.clickRate / 5, 1) * 30;
    const healthScore = (1 - (this.analytics.bounceRate + this.analytics.complaintRate) / 100) * 20;

    return Math.round(openScore + clickScore + healthScore);
});

// ============ METHODS ============

// Calculate recipient count
campaignSchema.methods.calculateRecipients = async function () {
    const Contact = mongoose.model('Contact');
    const Segment = mongoose.model('Segment');

    // Build query for included contacts
    let includeIds = new Set();
    let excludeIds = new Set();

    // Get contacts from lists
    for (const listId of this.recipients.lists) {
        const contacts = await Contact.find({
            orgId: this.orgId,
            'lists.listId': listId,
            'lists.status': 'active',
            status: 'subscribed',
        }).select('_id');

        contacts.forEach(c => includeIds.add(c._id.toString()));
    }

    // Get contacts from segments
    for (const segmentId of this.recipients.segments) {
        const segment = await Segment.findById(segmentId);
        if (segment) {
            const contacts = await segment.getContacts({ select: '_id' });
            contacts.forEach(c => includeIds.add(c._id.toString()));
        }
    }

    // Remove excluded lists
    for (const listId of this.recipients.excludeLists || []) {
        const contacts = await Contact.find({
            orgId: this.orgId,
            'lists.listId': listId,
            'lists.status': 'active',
        }).select('_id');

        contacts.forEach(c => excludeIds.add(c._id.toString()));
    }

    // Remove excluded segments
    for (const segmentId of this.recipients.excludeSegments || []) {
        const segment = await Segment.findById(segmentId);
        if (segment) {
            const contacts = await segment.getContacts({ select: '_id' });
            contacts.forEach(c => excludeIds.add(c._id.toString()));
        }
    }

    // Calculate final count
    const finalIds = [...includeIds].filter(id => !excludeIds.has(id));
    this.recipients.estimatedCount = finalIds.length;

    return this.recipients.estimatedCount;
};

// Update analytics rates
campaignSchema.methods.recalculateRates = function () {
    const a = this.analytics;

    if (a.sent > 0) {
        a.deliveryRate = Math.round((a.delivered / a.sent) * 10000) / 100;
        a.bounceRate = Math.round((a.bounced / a.sent) * 10000) / 100;
    }

    if (a.delivered > 0) {
        a.openRate = Math.round((a.uniqueOpens / a.delivered) * 10000) / 100;
        a.clickRate = Math.round((a.uniqueClicks / a.delivered) * 10000) / 100;
        a.unsubscribeRate = Math.round((a.unsubscribed / a.delivered) * 10000) / 100;
        a.complaintRate = Math.round((a.complained / a.delivered) * 10000) / 100;
    }

    if (a.uniqueOpens > 0) {
        a.clickToOpenRate = Math.round((a.uniqueClicks / a.uniqueOpens) * 10000) / 100;
    }

    a.lastUpdatedAt = new Date();

    return this;
};

// Pause campaign
campaignSchema.methods.pause = function () {
    if (this.status !== 'sending') {
        throw new Error('Can only pause sending campaigns');
    }

    this.status = 'paused';
    this.progress.pausedAt = new Date();

    return this.save();
};

// Resume campaign
campaignSchema.methods.resume = function () {
    if (this.status !== 'paused') {
        throw new Error('Can only resume paused campaigns');
    }

    this.status = 'sending';

    return this.save();
};

// Cancel campaign
campaignSchema.methods.cancel = function () {
    if (!['scheduled', 'queued', 'sending', 'paused'].includes(this.status)) {
        throw new Error('Cannot cancel this campaign');
    }

    this.status = 'cancelled';

    return this.save();
};

// Clone campaign
campaignSchema.methods.clone = function (newName) {
    const cloned = this.toObject();

    delete cloned._id;
    delete cloned.createdAt;
    delete cloned.updatedAt;

    cloned.name = newName || `${this.name} (Copy)`;
    cloned.status = 'draft';
    cloned.progress = {
        totalToSend: 0,
        sent: 0,
        failed: 0,
        percentage: 0,
    };
    cloned.analytics = {
        sent: 0,
        delivered: 0,
        bounced: 0,
        opened: 0,
        uniqueOpens: 0,
        clicked: 0,
        uniqueClicks: 0,
        unsubscribed: 0,
        complained: 0,
    };
    cloned.errors = [];

    return new (mongoose.model('Campaign'))(cloned);
};

// ============ STATICS ============

// Find campaigns ready to send
campaignSchema.statics.findReadyToSend = function () {
    return this.find({
        status: 'scheduled',
        'schedule.scheduledAt': { $lte: new Date() },
    });
};

// Find active sending campaigns
campaignSchema.statics.findSending = function () {
    return this.find({ status: 'sending' });
};

// Get campaign analytics summary for dashboard
campaignSchema.statics.getDashboardStats = async function (orgId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.aggregate([
        {
            $match: {
                orgId: new mongoose.Types.ObjectId(orgId),
                status: 'sent',
                'progress.completedAt': { $gte: startDate },
            },
        },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                totalSent: { $sum: '$analytics.sent' },
                totalOpens: { $sum: '$analytics.uniqueOpens' },
                totalClicks: { $sum: '$analytics.uniqueClicks' },
                avgOpenRate: { $avg: '$analytics.openRate' },
                avgClickRate: { $avg: '$analytics.clickRate' },
            },
        },
    ]);
};

// ============ MIDDLEWARE ============

// Update progress percentage
campaignSchema.pre('save', function (next) {
    if (this.progress.totalToSend > 0) {
        this.progress.percentage = Math.round(
            (this.progress.sent / this.progress.totalToSend) * 100
        );
    }
    next();
});

module.exports = mongoose.model('Campaign', campaignSchema);
