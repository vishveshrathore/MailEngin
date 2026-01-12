const mongoose = require('mongoose');

/**
 * Segment Model
 * 
 * Represents a dynamic segment of contacts based on filter conditions.
 * Segments are computed on-the-fly or cached.
 * 
 * Relations:
 * - Belongs to Organization
 * - Filters Contacts dynamically
 * - Used by Campaigns for targeting
 */

const conditionSchema = new mongoose.Schema({
    field: {
        type: String,
        required: true,
        // Supported fields: email, firstName, lastName, status, engagement.score,
        // engagement.level, location.country, tags, lists, customFields.*, etc.
    },
    operator: {
        type: String,
        required: true,
        enum: [
            'equals',
            'not_equals',
            'contains',
            'not_contains',
            'starts_with',
            'ends_with',
            'greater_than',
            'less_than',
            'greater_than_or_equals',
            'less_than_or_equals',
            'is_empty',
            'is_not_empty',
            'in_list',        // For lists/tags: contact is in specified list
            'not_in_list',
            'before',         // For dates
            'after',
            'between',
            'within_last',    // within_last X days
        ],
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        // Can be string, number, array, or object depending on operator
    },
    // For 'between' operator
    valueEnd: mongoose.Schema.Types.Mixed,
    // For 'within_last' operator
    unit: {
        type: String,
        enum: ['minutes', 'hours', 'days', 'weeks', 'months'],
    },
}, { _id: false });

const conditionGroupSchema = new mongoose.Schema({
    operator: {
        type: String,
        enum: ['AND', 'OR'],
        default: 'AND',
    },
    conditions: [conditionSchema],
}, { _id: false });

const segmentSchema = new mongoose.Schema({
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
        required: [true, 'Segment name is required'],
        trim: true,
        maxlength: [100, 'Segment name cannot exceed 100 characters'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // Segment type
    type: {
        type: String,
        enum: ['dynamic', 'static'],
        default: 'dynamic',
    },

    // Filter logic
    // Main operator for combining condition groups
    rootOperator: {
        type: String,
        enum: ['AND', 'OR'],
        default: 'AND',
    },

    // Condition groups (allows complex nested logic)
    conditionGroups: [conditionGroupSchema],

    // For static segments: explicitly included/excluded contact IDs
    staticMembers: {
        included: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
        excluded: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    },

    // Base filtering (always applied before conditions)
    baseFilter: {
        lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'List' }], // Limit to specific lists
        status: {
            type: [String],
            enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'bounced', 'complained'],
            default: ['subscribed'],
        },
    },

    // Cached stats (refreshed periodically)
    cache: {
        contactCount: { type: Number, default: 0 },
        lastCalculatedAt: Date,
        isStale: { type: Boolean, default: true },
        // For large segments, store sample IDs for preview
        sampleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
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
        default: '#8B5CF6', // Purple default
    },
    icon: {
        type: String,
        default: 'filter',
    },

    // Usage tracking
    usedInCampaigns: { type: Number, default: 0 },
    lastUsedAt: Date,

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

// Unique segment name per organization
segmentSchema.index({ orgId: 1, name: 1 }, { unique: true });

// Segment browsing
segmentSchema.index({ orgId: 1, status: 1, type: 1 });

// Find by list (segments that target specific lists)
segmentSchema.index({ orgId: 1, 'baseFilter.lists': 1 });

// ============ METHODS ============

// Build MongoDB query from segment conditions
segmentSchema.methods.buildQuery = function () {
    const baseQuery = {
        orgId: this.orgId,
        status: { $in: this.baseFilter.status },
    };

    // If limited to specific lists
    if (this.baseFilter.lists && this.baseFilter.lists.length > 0) {
        baseQuery['lists.listId'] = { $in: this.baseFilter.lists };
        baseQuery['lists.status'] = 'active';
    }

    // For static segments
    if (this.type === 'static') {
        if (this.staticMembers.included.length > 0) {
            baseQuery._id = { $in: this.staticMembers.included };
        }
        if (this.staticMembers.excluded.length > 0) {
            baseQuery._id = { ...baseQuery._id, $nin: this.staticMembers.excluded };
        }
        return baseQuery;
    }

    // Build dynamic conditions
    const groupQueries = this.conditionGroups.map(group => {
        const conditionQueries = group.conditions.map(cond =>
            this._buildConditionQuery(cond)
        );

        if (group.operator === 'OR') {
            return { $or: conditionQueries };
        }
        return { $and: conditionQueries };
    });

    if (groupQueries.length > 0) {
        if (this.rootOperator === 'OR') {
            baseQuery.$or = groupQueries;
        } else {
            baseQuery.$and = groupQueries;
        }
    }

    return baseQuery;
};

// Build query for a single condition
segmentSchema.methods._buildConditionQuery = function (condition) {
    const { field, operator, value, valueEnd, unit } = condition;

    switch (operator) {
        case 'equals':
            return { [field]: value };

        case 'not_equals':
            return { [field]: { $ne: value } };

        case 'contains':
            return { [field]: { $regex: value, $options: 'i' } };

        case 'not_contains':
            return { [field]: { $not: { $regex: value, $options: 'i' } } };

        case 'starts_with':
            return { [field]: { $regex: `^${value}`, $options: 'i' } };

        case 'ends_with':
            return { [field]: { $regex: `${value}$`, $options: 'i' } };

        case 'greater_than':
            return { [field]: { $gt: value } };

        case 'less_than':
            return { [field]: { $lt: value } };

        case 'greater_than_or_equals':
            return { [field]: { $gte: value } };

        case 'less_than_or_equals':
            return { [field]: { $lte: value } };

        case 'is_empty':
            return { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] };

        case 'is_not_empty':
            return { [field]: { $exists: true, $ne: null, $ne: '' } };

        case 'in_list':
            if (field === 'lists') {
                return { 'lists.listId': { $in: Array.isArray(value) ? value : [value] }, 'lists.status': 'active' };
            }
            return { [field]: { $in: Array.isArray(value) ? value : [value] } };

        case 'not_in_list':
            if (field === 'lists') {
                return { 'lists.listId': { $nin: Array.isArray(value) ? value : [value] } };
            }
            return { [field]: { $nin: Array.isArray(value) ? value : [value] } };

        case 'before':
            return { [field]: { $lt: new Date(value) } };

        case 'after':
            return { [field]: { $gt: new Date(value) } };

        case 'between':
            return { [field]: { $gte: new Date(value), $lte: new Date(valueEnd) } };

        case 'within_last': {
            const multipliers = {
                minutes: 60 * 1000,
                hours: 60 * 60 * 1000,
                days: 24 * 60 * 60 * 1000,
                weeks: 7 * 24 * 60 * 60 * 1000,
                months: 30 * 24 * 60 * 60 * 1000,
            };
            const ms = value * (multipliers[unit] || multipliers.days);
            const date = new Date(Date.now() - ms);
            return { [field]: { $gte: date } };
        }

        default:
            return {};
    }
};

// Get contacts matching this segment
segmentSchema.methods.getContacts = async function (options = {}) {
    const Contact = mongoose.model('Contact');
    const query = this.buildQuery();

    let queryBuilder = Contact.find(query);

    if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
    }
    if (options.skip) {
        queryBuilder = queryBuilder.skip(options.skip);
    }
    if (options.select) {
        queryBuilder = queryBuilder.select(options.select);
    }
    if (options.sort) {
        queryBuilder = queryBuilder.sort(options.sort);
    }

    return queryBuilder.exec();
};

// Count contacts matching this segment
segmentSchema.methods.countContacts = async function () {
    const Contact = mongoose.model('Contact');
    const query = this.buildQuery();
    return Contact.countDocuments(query);
};

// Refresh cached count
segmentSchema.methods.refreshCache = async function () {
    const count = await this.countContacts();

    // Get sample IDs for preview
    const contacts = await this.getContacts({ limit: 10, select: '_id' });

    this.cache = {
        contactCount: count,
        lastCalculatedAt: new Date(),
        isStale: false,
        sampleIds: contacts.map(c => c._id),
    };

    return this.save();
};

// ============ STATICS ============

// Find active segments
segmentSchema.statics.findActive = function (orgId) {
    return this.find({ orgId, status: 'active' }).sort({ createdAt: -1 });
};

// Pre-built segment templates
segmentSchema.statics.TEMPLATES = {
    ENGAGED: {
        name: 'Highly Engaged',
        description: 'Contacts with high engagement scores',
        conditionGroups: [{
            operator: 'AND',
            conditions: [
                { field: 'engagement.score', operator: 'greater_than_or_equals', value: 70 },
            ],
        }],
    },
    INACTIVE: {
        name: 'Inactive (90 days)',
        description: 'Contacts who haven\'t opened emails in 90 days',
        conditionGroups: [{
            operator: 'AND',
            conditions: [
                { field: 'engagement.lastOpenedAt', operator: 'before', value: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            ],
        }],
    },
    NEW_SUBSCRIBERS: {
        name: 'New Subscribers (7 days)',
        description: 'Contacts who subscribed in the last 7 days',
        conditionGroups: [{
            operator: 'AND',
            conditions: [
                { field: 'createdAt', operator: 'within_last', value: 7, unit: 'days' },
            ],
        }],
    },
};

// ============ MIDDLEWARE ============

// Mark cache as stale when conditions change
segmentSchema.pre('save', function (next) {
    if (this.isModified('conditionGroups') || this.isModified('baseFilter') || this.isModified('staticMembers')) {
        this.cache.isStale = true;
    }
    next();
});

module.exports = mongoose.model('Segment', segmentSchema);
