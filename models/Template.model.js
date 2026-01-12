const mongoose = require('mongoose');

/**
 * Template Model
 * 
 * Represents an email template with HTML/text content.
 * Supports variable substitution and versioning.
 * 
 * Relations:
 * - Belongs to Organization
 * - Created by User
 * - Used by many Campaigns
 * - Used by Automations
 */

const templateSchema = new mongoose.Schema({
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
        required: [true, 'Template name is required'],
        trim: true,
        maxlength: [100, 'Template name cannot exceed 100 characters'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // Template type
    type: {
        type: String,
        enum: ['campaign', 'automation', 'transactional', 'system'],
        default: 'campaign',
        index: true,
    },

    // Category for organization
    category: {
        type: String,
        trim: true,
        default: 'General',
    },

    // Email content
    subject: {
        type: String,
        required: [true, 'Subject line is required'],
        maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    preheader: {
        type: String,
        maxlength: [200, 'Preheader cannot exceed 200 characters'],
    },

    // HTML content
    htmlContent: {
        type: String,
        required: [true, 'HTML content is required'],
    },

    // Plain text content (auto-generated if not provided)
    textContent: String,

    // Design method
    designMode: {
        type: String,
        enum: ['code', 'drag-drop', 'import'],
        default: 'code',
    },

    // For drag-drop editor: JSON structure
    designJson: {
        type: mongoose.Schema.Types.Mixed,
    },

    // Template variables (extracted from content)
    variables: [{
        name: {
            type: String,
            required: true,
        },
        defaultValue: String,
        required: {
            type: Boolean,
            default: false,
        },
        description: String,
        // Variable type for validation
        type: {
            type: String,
            enum: ['text', 'number', 'date', 'url', 'html'],
            default: 'text',
        },
    }],

    // System variables that are auto-populated
    // e.g., {{contact.firstName}}, {{contact.email}}, {{unsubscribe_link}}
    systemVariables: [{
        type: String,
    }],

    // Thumbnail/preview image (stored in S3)
    thumbnail: String,

    // A/B testing variants
    variants: [{
        name: String,
        subject: String,
        htmlContent: String,
        textContent: String,
        // Stats per variant
        stats: {
            sent: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
        },
    }],

    // Version history
    versions: [{
        version: Number,
        subject: String,
        htmlContent: String,
        textContent: String,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changeNote: String,
    }],
    currentVersion: {
        type: Number,
        default: 1,
    },

    // Performance stats (aggregated from campaigns)
    stats: {
        timesUsed: { type: Number, default: 0 },
        totalSent: { type: Number, default: 0 },
        totalOpened: { type: Number, default: 0 },
        totalClicked: { type: Number, default: 0 },
        avgOpenRate: { type: Number, default: 0 },
        avgClickRate: { type: Number, default: 0 },
        lastUsedAt: Date,
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'active', 'archived', 'deleted'],
        default: 'draft',
        index: true,
    },

    // Sharing
    isShared: {
        type: Boolean,
        default: false,
    },

    // Tags
    tags: [{
        type: String,
        trim: true,
        lowercase: true,
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

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Unique template name per organization
templateSchema.index({ orgId: 1, name: 1 }, { unique: true });

// Template browsing
templateSchema.index({ orgId: 1, status: 1, type: 1 });

// Category filtering
templateSchema.index({ orgId: 1, category: 1, status: 1 });

// Tag-based filtering
templateSchema.index({ orgId: 1, tags: 1 });

// Performance-based sorting
templateSchema.index({ orgId: 1, 'stats.avgOpenRate': -1 });

// Full-text search
templateSchema.index(
    { name: 'text', description: 'text', subject: 'text' },
    { weights: { name: 10, subject: 5, description: 2 } }
);

// ============ VIRTUALS ============

templateSchema.virtual('hasVariants').get(function () {
    return this.variants && this.variants.length > 0;
});

templateSchema.virtual('variableCount').get(function () {
    return (this.variables?.length || 0) + (this.systemVariables?.length || 0);
});

// ============ METHODS ============

// Extract variables from content ({{variable_name}})
templateSchema.methods.extractVariables = function () {
    const content = this.htmlContent + ' ' + this.subject;
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const matches = content.matchAll(variableRegex);

    const systemVars = ['contact.firstName', 'contact.lastName', 'contact.email',
        'contact.company', 'unsubscribe_link', 'view_in_browser_link',
        'organization.name', 'organization.address', 'current_date', 'current_year'];

    const customVars = [];
    const sysVarsFound = [];

    for (const match of matches) {
        const varName = match[1].trim();

        if (systemVars.some(sv => varName.startsWith(sv.split('.')[0]))) {
            if (!sysVarsFound.includes(varName)) {
                sysVarsFound.push(varName);
            }
        } else {
            if (!customVars.find(v => v.name === varName)) {
                customVars.push({ name: varName, type: 'text' });
            }
        }
    }

    this.variables = customVars;
    this.systemVariables = sysVarsFound;

    return { custom: customVars, system: sysVarsFound };
};

// Render template with data
templateSchema.methods.render = function (data = {}) {
    let html = this.htmlContent;
    let text = this.textContent || '';
    let subject = this.subject;

    // Replace all variables
    const replaceVars = (content) => {
        return content.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
            const path = varPath.trim().split('.');
            let value = data;

            for (const key of path) {
                value = value?.[key];
                if (value === undefined) break;
            }

            // If no value found, check for default in variables
            if (value === undefined) {
                const varDef = this.variables.find(v => v.name === varPath.trim());
                value = varDef?.defaultValue || '';
            }

            return value ?? '';
        });
    };

    return {
        subject: replaceVars(subject),
        html: replaceVars(html),
        text: replaceVars(text),
    };
};

// Create a new version
templateSchema.methods.createVersion = function (changeNote, userId) {
    this.versions.push({
        version: this.currentVersion,
        subject: this.subject,
        htmlContent: this.htmlContent,
        textContent: this.textContent,
        createdBy: userId,
        changeNote,
    });

    this.currentVersion += 1;

    // Keep only last 20 versions
    if (this.versions.length > 20) {
        this.versions = this.versions.slice(-20);
    }

    return this.save();
};

// Restore a previous version
templateSchema.methods.restoreVersion = function (versionNumber) {
    const version = this.versions.find(v => v.version === versionNumber);

    if (!version) {
        throw new Error('Version not found');
    }

    this.subject = version.subject;
    this.htmlContent = version.htmlContent;
    this.textContent = version.textContent;

    return this;
};

// Clone template
templateSchema.methods.clone = function (newName) {
    const cloned = this.toObject();

    delete cloned._id;
    delete cloned.createdAt;
    delete cloned.updatedAt;

    cloned.name = newName || `${this.name} (Copy)`;
    cloned.status = 'draft';
    cloned.stats = {
        timesUsed: 0,
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        avgOpenRate: 0,
        avgClickRate: 0,
    };
    cloned.versions = [];
    cloned.currentVersion = 1;

    return new (mongoose.model('Template'))(cloned);
};

// ============ STATICS ============

// Find active templates
templateSchema.statics.findActive = function (orgId, type) {
    const query = { orgId, status: { $in: ['draft', 'active'] } };
    if (type) query.type = type;
    return this.find(query).sort({ updatedAt: -1 });
};

// Search templates
templateSchema.statics.search = function (orgId, query) {
    return this.find({
        orgId,
        status: { $ne: 'deleted' },
        $text: { $search: query },
    }).sort({ score: { $meta: 'textScore' } });
};

// ============ MIDDLEWARE ============

// Extract variables before saving
templateSchema.pre('save', function (next) {
    if (this.isModified('htmlContent') || this.isModified('subject')) {
        this.extractVariables();
    }
    next();
});

// Generate plain text from HTML if not provided
templateSchema.pre('save', function (next) {
    if (this.isModified('htmlContent') && !this.textContent) {
        // Simple HTML to text conversion (in production, use a proper library)
        this.textContent = this.htmlContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    next();
});

module.exports = mongoose.model('Template', templateSchema);
