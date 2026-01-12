/**
 * SES Log Model
 * 
 * Logs all SES events (bounces, complaints, deliveries) for auditing
 * and suppression list management.
 */

const mongoose = require('mongoose');

const sesLogSchema = new mongoose.Schema({
    // Event type
    type: {
        type: String,
        enum: ['bounce', 'complaint', 'delivery', 'send', 'reject', 'open', 'click'],
        required: true,
        index: true,
    },

    // SES Message ID
    messageId: {
        type: String,
        required: true,
        index: true,
    },

    // Recipient email
    email: {
        type: String,
        required: true,
        lowercase: true,
        index: true,
    },

    // Organization (if known)
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true,
    },

    // Related campaign
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        index: true,
    },

    // Event-specific details
    details: {
        // Bounce details
        bounceType: String,          // Permanent, Transient
        bounceSubType: String,       // General, NoEmail, Suppressed, etc.
        diagnosticCode: String,

        // Complaint details
        complaintType: String,       // abuse, not-spam, virus, etc.

        // Delivery details
        smtpResponse: String,
        processingTimeMillis: Number,

        // Tracking details
        userAgent: String,
        ipAddress: String,
        url: String,
    },

    // Feedback ID from SES
    feedbackId: String,

    // Timestamp from SES
    timestamp: {
        type: Date,
        required: true,
        index: true,
    },

    // Whether this has been processed
    processed: {
        type: Boolean,
        default: false,
    },

    // Actions taken
    actions: [{
        action: String,     // suppressed, unsubscribed, cleaned
        timestamp: Date,
    }],

}, {
    timestamps: true,
});

// Compound indexes
sesLogSchema.index({ email: 1, type: 1 });
sesLogSchema.index({ timestamp: -1 });
sesLogSchema.index({ orgId: 1, type: 1, timestamp: -1 });

// TTL - keep logs for 90 days
sesLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

/**
 * Static: Get suppression list (all permanent bounces and complaints)
 */
sesLogSchema.statics.getSuppressionList = async function (orgId = null) {
    const query = {
        $or: [
            { type: 'complaint' },
            { type: 'bounce', 'details.bounceType': 'Permanent' },
        ],
    };

    if (orgId) {
        query.orgId = orgId;
    }

    const results = await this.find(query)
        .select('email type details.bounceType timestamp')
        .sort({ timestamp: -1 });

    // Return unique emails
    const suppressed = new Map();
    for (const log of results) {
        if (!suppressed.has(log.email)) {
            suppressed.set(log.email, {
                email: log.email,
                reason: log.type === 'complaint' ? 'complaint' : 'bounce',
                timestamp: log.timestamp,
            });
        }
    }

    return Array.from(suppressed.values());
};

/**
 * Static: Check if email is suppressed
 */
sesLogSchema.statics.isEmailSuppressed = async function (email) {
    const count = await this.countDocuments({
        email: email.toLowerCase(),
        $or: [
            { type: 'complaint' },
            { type: 'bounce', 'details.bounceType': 'Permanent' },
        ],
    });

    return count > 0;
};

/**
 * Static: Get bounce/complaint stats for organization
 */
sesLogSchema.statics.getStatsForOrg = async function (orgId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await this.aggregate([
        {
            $match: {
                orgId: new mongoose.Types.ObjectId(orgId),
                timestamp: { $gte: since },
            },
        },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
            },
        },
    ]);

    return stats.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
    }, {});
};

/**
 * Static: Get daily bounce/complaint trend
 */
sesLogSchema.statics.getDailyTrend = async function (orgId, days = 14) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.aggregate([
        {
            $match: {
                orgId: new mongoose.Types.ObjectId(orgId),
                timestamp: { $gte: since },
                type: { $in: ['bounce', 'complaint'] },
            },
        },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    type: '$type',
                },
                count: { $sum: 1 },
            },
        },
        {
            $sort: { '_id.date': 1 },
        },
    ]);
};

module.exports = mongoose.model('SESLog', sesLogSchema);
