const mongoose = require('mongoose');


const organizationSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        trim: true,
        maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },

    // Contact Info
    email: {
        type: String,
        required: [true, 'Organization email is required'],
        lowercase: true,
        trim: true,
    },
    phone: String,
    website: String,

    // Address
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
    },

    // Branding
    branding: {
        logo: String,           // S3 URL
        favicon: String,        // S3 URL
        primaryColor: {
            type: String,
            default: '#3B82F6',
        },
        accentColor: {
            type: String,
            default: '#10B981',
        },
    },

    // Email Settings
    emailSettings: {
        fromName: {
            type: String,
            required: true,
        },
        fromEmail: {
            type: String,
            required: true,
            lowercase: true,
        },
        replyToEmail: String,
        // Email footer for compliance
        physicalAddress: String,
        // Domain verification
        verifiedDomains: [{
            domain: String,
            verified: { type: Boolean, default: false },
            verifiedAt: Date,
            dkimStatus: { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
        }],
    },

    // Subscription & Limits
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
    },

    // Usage tracking (updated periodically)
    usage: {
        emailsSentThisMonth: { type: Number, default: 0 },
        contactsCount: { type: Number, default: 0 },
        lastResetAt: Date,
    },

    // Feature flags
    features: {
        automations: { type: Boolean, default: false },
        customDomains: { type: Boolean, default: false },
        advancedAnalytics: { type: Boolean, default: false },
        apiAccess: { type: Boolean, default: false },
        dedicatedIp: { type: Boolean, default: false },
        abTesting: { type: Boolean, default: false },
    },

    // Settings
    settings: {
        timezone: {
            type: String,
            default: 'UTC',
        },
        dateFormat: {
            type: String,
            default: 'MM/DD/YYYY',
        },
        // Double opt-in settings
        doubleOptIn: {
            enabled: { type: Boolean, default: false },
            templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
        },
        // Unsubscribe settings
        unsubscribePage: {
            type: String,
            enum: ['default', 'custom'],
            default: 'default',
        },
        customUnsubscribeUrl: String,
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'suspended', 'cancelled', 'trial'],
        default: 'trial',
        index: true,
    },

    // Trial info
    trialEndsAt: Date,

    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Primary lookup by slug (subdomain/URL identification)
// organizationSchema.index({ slug: 1 }, { unique: true }); // Removed: duplicate with schema definition

// Status queries for admin dashboard
organizationSchema.index({ status: 1, createdAt: -1 });

// Subscription management queries
organizationSchema.index({ subscriptionId: 1 });

// Trial expiry queries
organizationSchema.index({ status: 1, trialEndsAt: 1 });

// Usage reset queries (monthly billing cycle)
organizationSchema.index({ 'usage.lastResetAt': 1 });

// ============ VIRTUALS ============

// Check if trial is active
organizationSchema.virtual('isTrialActive').get(function () {
    if (this.status !== 'trial') return false;
    return this.trialEndsAt && this.trialEndsAt > new Date();
});

// Days remaining in trial
organizationSchema.virtual('trialDaysRemaining').get(function () {
    if (!this.trialEndsAt) return 0;
    const diff = this.trialEndsAt - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// ============ METHODS ============

// Check if organization can send more emails
organizationSchema.methods.canSendEmails = async function (count = 1) {
    const Subscription = mongoose.model('Subscription');
    const subscription = await Subscription.findById(this.subscriptionId);

    if (!subscription) return false;

    const limit = subscription.limits.emailsPerMonth;
    return (this.usage.emailsSentThisMonth + count) <= limit;
};

// Increment email count
organizationSchema.methods.incrementEmailCount = function (count = 1) {
    this.usage.emailsSentThisMonth += count;
    return this.save();
};

// ============ STATICS ============

// Find by slug with subscription populated
organizationSchema.statics.findBySlug = function (slug) {
    return this.findOne({ slug }).populate('subscriptionId');
};

// ============ MIDDLEWARE ============

// Generate slug from name if not provided
organizationSchema.pre('validate', function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
    next();
});

module.exports = mongoose.model('Organization', organizationSchema);
