const mongoose = require('mongoose');

/**
 * List Model
 * 
 * Represents a subscriber list/audience.
 * Contacts are added to lists for targeted campaigns.
 * 
 * Relations:
 * - Belongs to Organization
 * - Has many Contacts (via Contact.lists array)
 * - Used by many Campaigns
 */

const listSchema = new mongoose.Schema({
    // Organization reference (tenant isolation)
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },

    // Basic Info
    name: {
        type: String,
        required: [true, 'List name is required'],
        trim: true,
        maxlength: [100, 'List name cannot exceed 100 characters'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // List type
    type: {
        type: String,
        enum: ['standard', 'seed', 'suppression'],
        default: 'standard',
    },

    // Stats (updated periodically by worker)
    stats: {
        totalContacts: { type: Number, default: 0 },
        subscribedCount: { type: Number, default: 0 },
        unsubscribedCount: { type: Number, default: 0 },
        bouncedCount: { type: Number, default: 0 },
        complainedCount: { type: Number, default: 0 },
        cleanedCount: { type: Number, default: 0 },

        // Growth metrics
        newThisWeek: { type: Number, default: 0 },
        newThisMonth: { type: Number, default: 0 },

        // Engagement averages
        avgOpenRate: { type: Number, default: 0 },
        avgClickRate: { type: Number, default: 0 },

        lastUpdatedAt: Date,
    },

    // Default values for contacts added to this list
    defaults: {
        tags: [String],
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
    },

    // Double opt-in settings (override org settings)
    doubleOptIn: {
        enabled: { type: Boolean, default: null }, // null = use org default
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    },

    // Welcome email
    welcomeEmail: {
        enabled: { type: Boolean, default: false },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
        delayMinutes: { type: Number, default: 0 },
    },

    // Visibility & access
    visibility: {
        type: String,
        enum: ['public', 'private', 'team'],
        default: 'public',
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active',
        index: true,
    },

    // Metadata
    color: {
        type: String,
        default: '#3B82F6', // Blue default
    },
    icon: {
        type: String,
        default: 'users',
    },

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Unique list name per organization
listSchema.index({ orgId: 1, name: 1 }, { unique: true });

// List browsing
listSchema.index({ orgId: 1, status: 1, type: 1 });

// Stats-based ordering
listSchema.index({ orgId: 1, 'stats.totalContacts': -1 });

// ============ VIRTUALS ============

listSchema.virtual('activeContactsCount').get(function () {
    return this.stats.subscribedCount;
});

listSchema.virtual('unsubscribeRate').get(function () {
    if (this.stats.totalContacts === 0) return 0;
    return ((this.stats.unsubscribedCount / this.stats.totalContacts) * 100).toFixed(2);
});

listSchema.virtual('healthScore').get(function () {
    // Calculate list health based on engagement and deliverability
    const bounceRate = this.stats.totalContacts > 0
        ? (this.stats.bouncedCount / this.stats.totalContacts) * 100
        : 0;
    const complaintRate = this.stats.totalContacts > 0
        ? (this.stats.complainedCount / this.stats.totalContacts) * 100
        : 0;

    let score = 100;
    score -= bounceRate * 2;
    score -= complaintRate * 10;
    score -= (100 - this.stats.avgOpenRate) * 0.2;

    return Math.max(0, Math.min(100, Math.round(score)));
});

// ============ METHODS ============

// Refresh stats from Contact collection
listSchema.methods.refreshStats = async function () {
    const Contact = mongoose.model('Contact');

    const pipeline = [
        {
            $match: {
                orgId: this.orgId,
                'lists.listId': this._id,
                'lists.status': 'active',
            },
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgOpenRate: { $avg: '$engagement.openRate' },
                avgClickRate: { $avg: '$engagement.clickRate' },
            },
        },
    ];

    const results = await Contact.aggregate(pipeline);

    // Reset stats
    this.stats.totalContacts = 0;
    this.stats.subscribedCount = 0;
    this.stats.unsubscribedCount = 0;
    this.stats.bouncedCount = 0;
    this.stats.complainedCount = 0;
    this.stats.cleanedCount = 0;

    let totalOpenRate = 0;
    let totalClickRate = 0;
    let rateCount = 0;

    results.forEach(result => {
        this.stats.totalContacts += result.count;

        switch (result._id) {
            case 'subscribed':
                this.stats.subscribedCount = result.count;
                break;
            case 'unsubscribed':
                this.stats.unsubscribedCount = result.count;
                break;
            case 'bounced':
                this.stats.bouncedCount = result.count;
                break;
            case 'complained':
                this.stats.complainedCount = result.count;
                break;
            case 'cleaned':
                this.stats.cleanedCount = result.count;
                break;
        }

        if (result.avgOpenRate !== null) {
            totalOpenRate += result.avgOpenRate * result.count;
            totalClickRate += result.avgClickRate * result.count;
            rateCount += result.count;
        }
    });

    if (rateCount > 0) {
        this.stats.avgOpenRate = Math.round((totalOpenRate / rateCount) * 100) / 100;
        this.stats.avgClickRate = Math.round((totalClickRate / rateCount) * 100) / 100;
    }

    this.stats.lastUpdatedAt = new Date();

    return this.save();
};

// Archive list
listSchema.methods.archive = function () {
    this.status = 'archived';
    return this.save();
};

// ============ STATICS ============

// Find active lists for organization
listSchema.statics.findActive = function (orgId) {
    return this.find({ orgId, status: 'active' }).sort({ createdAt: -1 });
};

// Get suppression list for organization
listSchema.statics.getSuppressionList = function (orgId) {
    return this.findOne({ orgId, type: 'suppression', status: 'active' });
};

module.exports = mongoose.model('List', listSchema);
