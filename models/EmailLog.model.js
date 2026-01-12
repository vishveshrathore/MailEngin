const mongoose = require('mongoose');

/**
 * EmailLog Model
 * 
 * Tracks individual email sends with delivery status and events.
 * Used for detailed analytics, debugging, and compliance.
 * 
 * Relations:
 * - Belongs to Organization
 * - Belongs to Campaign
 * - Belongs to Contact
 * - Optionally belongs to Automation
 */

const eventSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'bounced', 'dropped', 'deferred',
            'opened', 'clicked', 'unsubscribed', 'complained', 'failed'],
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
    data: {
        // For clicks: URL clicked
        url: String,
        // For bounces: bounce type and reason
        bounceType: { type: String, enum: ['soft', 'hard'] },
        bounceReason: String,
        bounceCode: String,
        // For complaints: complaint type
        complaintType: String,
        // Device/location info
        device: String,
        os: String,
        browser: String,
        ip: String,
        country: String,
        city: String,
        // Email client
        emailClient: String,
        // User agent
        userAgent: String,
    },
}, { _id: false });

const emailLogSchema = new mongoose.Schema({
    // Organization reference
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },

    // Campaign reference (null for transactional emails)
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        index: true,
    },

    // Automation reference (for automated emails)
    automationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Automation',
        index: true,
    },

    // Contact reference
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true,
        index: true,
    },

    // Email type
    type: {
        type: String,
        enum: ['campaign', 'automation', 'transactional', 'test'],
        default: 'campaign',
        index: true,
    },

    // Recipient email (denormalized for quick access)
    email: {
        type: String,
        required: true,
        lowercase: true,
        index: true,
    },

    // Email content snapshot
    content: {
        subject: String,
        fromName: String,
        fromEmail: String,
        // Don't store full HTML to save space - reference template instead
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
        // Store personalized subject for debugging
        personalizedSubject: String,
    },

    // Unique tracking ID
    trackingId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

    // AWS SES Message ID
    messageId: {
        type: String,
        index: true,
    },

    // Current status
    status: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'bounced', 'dropped', 'failed', 'complained'],
        default: 'queued',
        index: true,
    },

    // Detailed event log
    events: [eventSchema],

    // Engagement flags (for quick queries)
    engagement: {
        opened: { type: Boolean, default: false, index: true },
        clicked: { type: Boolean, default: false, index: true },
        unsubscribed: { type: Boolean, default: false },
        complained: { type: Boolean, default: false },

        // First event timestamps
        firstOpenedAt: Date,
        firstClickedAt: Date,

        // Counts
        openCount: { type: Number, default: 0 },
        clickCount: { type: Number, default: 0 },

        // Unique links clicked
        clickedLinks: [String],
    },

    // Delivery info
    delivery: {
        attempts: { type: Number, default: 0 },
        lastAttemptAt: Date,
        deliveredAt: Date,

        // Bounce info
        bounced: { type: Boolean, default: false },
        bounceType: { type: String, enum: ['soft', 'hard'] },
        bounceReason: String,

        // SMTP response
        smtpResponse: String,
    },

    // A/B test variant (if applicable)
    abVariant: String,

    // Queue job reference (for debugging)
    jobId: String,

    // Error info
    error: {
        message: String,
        code: String,
        stack: String,
    },

    // Timestamps
    queuedAt: {
        type: Date,
        default: Date.now,
    },
    sentAt: Date,

    // TTL for auto-cleanup (optional - e.g., delete after 1 year)
    expiresAt: {
        type: Date,
        index: { expires: 0 }, // TTL index
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
});

// ============ INDEXES ============

// Primary campaign analytics
emailLogSchema.index({ orgId: 1, campaignId: 1, status: 1 });

// Contact email history
emailLogSchema.index({ orgId: 1, contactId: 1, createdAt: -1 });

// Tracking lookups
emailLogSchema.index({ trackingId: 1 }, { unique: true });

// Message ID lookups (for webhooks)
emailLogSchema.index({ messageId: 1 }, { sparse: true });

// Engagement queries
emailLogSchema.index({ orgId: 1, campaignId: 1, 'engagement.opened': 1 });
emailLogSchema.index({ orgId: 1, campaignId: 1, 'engagement.clicked': 1 });

// Bounce management
emailLogSchema.index({ orgId: 1, 'delivery.bounced': 1, 'delivery.bounceType': 1 });

// Time-based queries
emailLogSchema.index({ orgId: 1, sentAt: -1 });
emailLogSchema.index({ orgId: 1, createdAt: -1 });

// Automation tracking
emailLogSchema.index({ automationId: 1, contactId: 1 });

// ============ METHODS ============

// Record an event
emailLogSchema.methods.recordEvent = function (type, data = {}) {
    const event = { type, timestamp: new Date(), data };
    this.events.push(event);

    // Update status and engagement based on event type
    switch (type) {
        case 'sent':
            this.status = 'sent';
            this.sentAt = event.timestamp;
            this.delivery.lastAttemptAt = event.timestamp;
            break;

        case 'delivered':
            this.status = 'delivered';
            this.delivery.deliveredAt = event.timestamp;
            break;

        case 'bounced':
            this.status = 'bounced';
            this.delivery.bounced = true;
            this.delivery.bounceType = data.bounceType;
            this.delivery.bounceReason = data.bounceReason;
            break;

        case 'opened':
            if (!this.engagement.opened) {
                this.engagement.opened = true;
                this.engagement.firstOpenedAt = event.timestamp;
            }
            this.engagement.openCount += 1;
            break;

        case 'clicked':
            if (!this.engagement.clicked) {
                this.engagement.clicked = true;
                this.engagement.firstClickedAt = event.timestamp;
            }
            this.engagement.clickCount += 1;
            if (data.url && !this.engagement.clickedLinks.includes(data.url)) {
                this.engagement.clickedLinks.push(data.url);
            }
            break;

        case 'unsubscribed':
            this.engagement.unsubscribed = true;
            break;

        case 'complained':
            this.status = 'complained';
            this.engagement.complained = true;
            break;

        case 'failed':
        case 'dropped':
            this.status = type;
            this.error = {
                message: data.bounceReason || data.message,
                code: data.bounceCode || data.code,
            };
            break;
    }

    return this.save();
};

// Mark as sent
emailLogSchema.methods.markSent = function (messageId) {
    this.messageId = messageId;
    return this.recordEvent('sent');
};

// Record open
emailLogSchema.methods.recordOpen = function (metadata = {}) {
    return this.recordEvent('opened', metadata);
};

// Record click
emailLogSchema.methods.recordClick = function (url, metadata = {}) {
    return this.recordEvent('clicked', { url, ...metadata });
};

// Record bounce
emailLogSchema.methods.recordBounce = function (bounceType, reason, code) {
    return this.recordEvent('bounced', {
        bounceType,
        bounceReason: reason,
        bounceCode: code,
    });
};

// ============ STATICS ============

// Find by tracking ID
emailLogSchema.statics.findByTrackingId = function (trackingId) {
    return this.findOne({ trackingId });
};

// Find by AWS SES message ID
emailLogSchema.statics.findByMessageId = function (messageId) {
    return this.findOne({ messageId });
};

// Get campaign analytics
emailLogSchema.statics.getCampaignAnalytics = async function (campaignId) {
    return this.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
            },
        },
    ]);
};

// Get engagement analytics
emailLogSchema.statics.getEngagementAnalytics = async function (campaignId) {
    return this.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                opened: { $sum: { $cond: ['$engagement.opened', 1, 0] } },
                clicked: { $sum: { $cond: ['$engagement.clicked', 1, 0] } },
                totalOpens: { $sum: '$engagement.openCount' },
                totalClicks: { $sum: '$engagement.clickCount' },
                unsubscribed: { $sum: { $cond: ['$engagement.unsubscribed', 1, 0] } },
                complained: { $sum: { $cond: ['$engagement.complained', 1, 0] } },
            },
        },
    ]);
};

// Get contact email history
emailLogSchema.statics.getContactHistory = function (orgId, contactId, limit = 50) {
    return this.find({ orgId, contactId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('campaignId', 'name')
        .select('email subject status engagement sentAt createdAt');
};

// Cleanup old logs
emailLogSchema.statics.cleanupOld = function (daysToKeep = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return this.deleteMany({
        createdAt: { $lt: cutoffDate },
    });
};

// Generate tracking ID
emailLogSchema.statics.generateTrackingId = function () {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
};

module.exports = mongoose.model('EmailLog', emailLogSchema);
