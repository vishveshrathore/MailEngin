const mongoose = require('mongoose');

/**
 * Contact Model
 * 
 * Represents an individual email subscriber/contact.
 * Contacts can belong to multiple lists and segments.
 * 
 * Relations:
 * - Belongs to Organization
 * - Belongs to many Lists (via ContactList junction)
 * - Belongs to many Segments (computed dynamically)
 * - Has many EmailLogs
 */

const contactSchema = new mongoose.Schema({
    // Organization reference (tenant isolation)
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },

    // Primary identifier - email
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },

    // Personal Information
    firstName: {
        type: String,
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
        type: String,
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    phone: {
        type: String,
        trim: true,
    },
    company: {
        type: String,
        trim: true,
    },
    jobTitle: {
        type: String,
        trim: true,
    },

    // Location (for timezone & segmentation)
    location: {
        city: String,
        state: String,
        country: String,
        zipCode: String,
        timezone: String,
    },

    // Custom fields (flexible schema for user-defined fields)
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map(),
    },

    // Tags for categorization
    tags: [{
        type: String,
        trim: true,
        lowercase: true,
    }],

    // Subscription Status
    status: {
        type: String,
        enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'bounced', 'complained'],
        default: 'subscribed',
        index: true,
    },

    // Status reason (for audit)
    statusReason: String,
    statusChangedAt: Date,

    // Opt-in tracking
    optIn: {
        type: {
            type: String,
            enum: ['single', 'double', 'import', 'api'],
            default: 'single',
        },
        confirmedAt: Date,
        confirmationToken: String,
        confirmationExpires: Date,
        ipAddress: String,
        userAgent: String,
    },

    // Unsubscribe tracking
    unsubscribe: {
        unsubscribedAt: Date,
        reason: String,
        feedback: String,
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    },

    // Engagement Metrics (updated by analytics worker)
    engagement: {
        // Email stats
        emailsReceived: { type: Number, default: 0 },
        emailsOpened: { type: Number, default: 0 },
        emailsClicked: { type: Number, default: 0 },

        // Calculated rates (0-100)
        openRate: { type: Number, default: 0 },
        clickRate: { type: Number, default: 0 },

        // Engagement score (0-100, weighted algorithm)
        score: { type: Number, default: 50, index: true },

        // Activity timestamps
        lastEmailSentAt: Date,
        lastOpenedAt: Date,
        lastClickedAt: Date,

        // Engagement level (computed from score)
        level: {
            type: String,
            enum: ['cold', 'cooling', 'warm', 'hot', 'new'],
            default: 'new',
        },
    },

    // Email deliverability
    deliverability: {
        bounceCount: { type: Number, default: 0 },
        lastBounceAt: Date,
        lastBounceType: {
            type: String,
            enum: ['soft', 'hard'],
        },
        lastBounceReason: String,

        complaintCount: { type: Number, default: 0 },
        lastComplaintAt: Date,

        // Email validation
        emailValidation: {
            status: {
                type: String,
                enum: ['unknown', 'valid', 'invalid', 'risky', 'catch-all'],
                default: 'unknown',
            },
            validatedAt: Date,
        },
    },

    // Source tracking
    source: {
        type: {
            type: String,
            enum: ['manual', 'import', 'api', 'form', 'landing_page', 'integration'],
            default: 'manual',
        },
        detail: String,        // e.g., 'csv_import_1234', 'signup_form_homepage'
        referrer: String,      // Referrer URL if applicable
        campaign: String,      // UTM campaign
        medium: String,        // UTM medium
        utmSource: String,     // UTM source
    },

    // Lists this contact belongs to
    lists: [{
        listId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'List',
            required: true,
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
        status: {
            type: String,
            enum: ['active', 'unsubscribed', 'removed'],
            default: 'active',
        },
    }],

    // Metadata
    importId: String,  // Reference to import batch
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

// Unique email per organization
contactSchema.index({ orgId: 1, email: 1 }, { unique: true });

// List membership queries - find all contacts in a list
contactSchema.index({ orgId: 1, 'lists.listId': 1, 'lists.status': 1 });

// Status-based queries (e.g., get all subscribed contacts)
contactSchema.index({ orgId: 1, status: 1 });

// Tag-based segmentation
contactSchema.index({ orgId: 1, tags: 1 });

// Engagement-based segmentation
contactSchema.index({ orgId: 1, 'engagement.score': -1 });
contactSchema.index({ orgId: 1, 'engagement.level': 1 });

// Activity-based queries (recently active, dormant, etc.)
contactSchema.index({ orgId: 1, 'engagement.lastOpenedAt': -1 });
contactSchema.index({ orgId: 1, 'engagement.lastClickedAt': -1 });

// Location-based segmentation
contactSchema.index({ orgId: 1, 'location.country': 1 });

// Deliverability management
contactSchema.index({ orgId: 1, 'deliverability.bounceCount': 1 });

// Source tracking for analytics
contactSchema.index({ orgId: 1, 'source.type': 1, createdAt: -1 });

// Full-text search on name and email
contactSchema.index(
    { email: 'text', firstName: 'text', lastName: 'text', company: 'text' },
    { weights: { email: 10, firstName: 5, lastName: 5, company: 2 } }
);

// ============ VIRTUALS ============

contactSchema.virtual('fullName').get(function () {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.firstName || this.lastName || this.email.split('@')[0];
});

contactSchema.virtual('displayName').get(function () {
    return this.fullName || this.email;
});

contactSchema.virtual('isSubscribed').get(function () {
    return this.status === 'subscribed';
});

contactSchema.virtual('isEngaged').get(function () {
    return this.engagement.level === 'hot' || this.engagement.level === 'warm';
});

// ============ METHODS ============

// Add contact to a list
contactSchema.methods.addToList = function (listId) {
    const existingEntry = this.lists.find(l => l.listId.equals(listId));

    if (existingEntry) {
        if (existingEntry.status !== 'active') {
            existingEntry.status = 'active';
            existingEntry.addedAt = new Date();
        }
    } else {
        this.lists.push({ listId, addedAt: new Date(), status: 'active' });
    }

    return this.save();
};

// Remove contact from a list
contactSchema.methods.removeFromList = function (listId) {
    const entry = this.lists.find(l => l.listId.equals(listId));
    if (entry) {
        entry.status = 'removed';
    }
    return this.save();
};

// Unsubscribe contact
contactSchema.methods.unsubscribe = function (reason, campaignId) {
    this.status = 'unsubscribed';
    this.statusReason = reason;
    this.statusChangedAt = new Date();
    this.unsubscribe = {
        unsubscribedAt: new Date(),
        reason,
        campaignId,
    };
    return this.save();
};

// Update engagement score
contactSchema.methods.updateEngagementScore = function () {
    const { emailsReceived, emailsOpened, emailsClicked } = this.engagement;

    if (emailsReceived === 0) {
        this.engagement.score = 50; // New contact
        this.engagement.level = 'new';
        return this.save();
    }

    // Calculate rates
    const openRate = (emailsOpened / emailsReceived) * 100;
    const clickRate = emailsReceived > 0 ? (emailsClicked / emailsReceived) * 100 : 0;

    this.engagement.openRate = Math.round(openRate * 100) / 100;
    this.engagement.clickRate = Math.round(clickRate * 100) / 100;

    // Weighted score: 40% open rate + 60% click rate (clicks are more valuable)
    const score = Math.round((openRate * 0.4) + (clickRate * 0.6) * 2);
    this.engagement.score = Math.min(100, Math.max(0, score));

    // Determine engagement level
    if (this.engagement.score >= 70) {
        this.engagement.level = 'hot';
    } else if (this.engagement.score >= 40) {
        this.engagement.level = 'warm';
    } else if (this.engagement.score >= 20) {
        this.engagement.level = 'cooling';
    } else {
        this.engagement.level = 'cold';
    }

    return this.save();
};

// ============ STATICS ============

// Find contacts by list
contactSchema.statics.findByList = function (orgId, listId, status = 'active') {
    return this.find({
        orgId,
        'lists.listId': listId,
        'lists.status': status,
        status: 'subscribed',
    });
};

// Find contacts by tag
contactSchema.statics.findByTag = function (orgId, tag) {
    return this.find({
        orgId,
        tags: tag.toLowerCase(),
        status: 'subscribed',
    });
};

// Search contacts
contactSchema.statics.search = function (orgId, query) {
    return this.find({
        orgId,
        $text: { $search: query },
    }).sort({ score: { $meta: 'textScore' } });
};

// ============ MIDDLEWARE ============

// Update statusChangedAt when status changes
contactSchema.pre('save', function (next) {
    if (this.isModified('status')) {
        this.statusChangedAt = new Date();
    }
    next();
});

module.exports = mongoose.model('Contact', contactSchema);
