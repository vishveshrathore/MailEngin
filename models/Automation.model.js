const mongoose = require('mongoose');

/**
 * Automation Model
 * 
 * Represents an automated email workflow (drip campaigns, triggers).
 * Supports complex multi-step sequences with conditions and delays.
 * 
 * Relations:
 * - Belongs to Organization
 * - Uses Templates
 * - Targets Lists/Segments
 * - Generates EmailLogs
 * - Created by User
 */

// Action types for workflow steps
const actionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['send_email', 'wait', 'condition', 'update_contact', 'add_tag',
            'remove_tag', 'add_to_list', 'remove_from_list', 'webhook',
            'notify_team', 'end'],
        required: true,
    },

    // For send_email
    email: {
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
        subject: String,
        fromName: String,
    },

    // For wait
    wait: {
        duration: Number,
        unit: {
            type: String,
            enum: ['minutes', 'hours', 'days', 'weeks'],
        },
        // Wait until specific time
        untilTime: String,  // e.g., "09:00"
        untilDay: {
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        },
    },

    // For condition (branching)
    condition: {
        field: String,
        operator: {
            type: String,
            enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than',
                'is_empty', 'is_not_empty', 'opened_email', 'clicked_email',
                'on_list', 'has_tag'],
        },
        value: mongoose.Schema.Types.Mixed,
        // Branch paths
        trueBranch: { type: mongoose.Schema.Types.ObjectId }, // Reference to next step
        falseBranch: { type: mongoose.Schema.Types.ObjectId },
    },

    // For update_contact
    updateContact: {
        field: String,
        value: mongoose.Schema.Types.Mixed,
    },

    // For add_tag/remove_tag
    tag: String,

    // For add_to_list/remove_from_list
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List' },

    // For webhook
    webhook: {
        url: String,
        method: { type: String, enum: ['GET', 'POST'], default: 'POST' },
        headers: { type: Map, of: String },
    },

    // For notify_team
    notification: {
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        message: String,
        channel: {
            type: String,
            enum: ['email', 'slack', 'in_app'],
            default: 'email',
        },
    },
}, { _id: true });

// Workflow step
const stepSchema = new mongoose.Schema({
    // Step identifier
    stepId: {
        type: String,
        required: true,
    },

    // Step name (for UI)
    name: String,

    // Action to perform
    action: actionSchema,

    // Next step(s) - can be multiple for branching
    nextSteps: [{
        stepId: String,
        condition: String,  // 'default', 'true', 'false'
    }],

    // Position for visual editor
    position: {
        x: Number,
        y: Number,
    },

    // Stats for this step
    stats: {
        entered: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
    },
}, { _id: false });

// Trigger configuration
const triggerSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['list_subscription', 'tag_added', 'tag_removed', 'contact_created',
            'contact_updated', 'email_opened', 'email_clicked', 'link_clicked',
            'date_field', 'api', 'manual'],
        required: true,
    },

    // For list_subscription
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List' },

    // For tag triggers
    tag: String,

    // For email_opened/clicked triggers
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },

    // For link_clicked
    linkUrl: String,

    // For date_field (birthday, anniversary)
    dateField: {
        field: String,  // e.g., 'customFields.birthday'
        offset: Number, // Days before/after
        time: String,   // Time to trigger, e.g., "09:00"
    },

    // For api trigger
    apiKey: String,

    // Filter contacts
    filter: {
        segmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Segment' },
        lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'List' }],
    },
}, { _id: false });

const automationSchema = new mongoose.Schema({
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
        required: [true, 'Automation name is required'],
        trim: true,
        maxlength: [100, 'Automation name cannot exceed 100 characters'],
    },
    description: String,

    // Trigger that starts the automation
    trigger: triggerSchema,

    // Workflow steps
    steps: [stepSchema],

    // Entry step ID
    entryStepId: String,

    // Settings
    settings: {
        // Allow contact to enter multiple times
        allowReentry: { type: Boolean, default: false },
        reentryWaitDays: { type: Number, default: 30 },

        // Timezone for scheduled sends
        timezone: String,

        // Send window (only send during these hours)
        sendWindow: {
            enabled: { type: Boolean, default: false },
            startHour: { type: Number, min: 0, max: 23 },
            endHour: { type: Number, min: 0, max: 23 },
            days: [{
                type: String,
                enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            }],
        },

        // Goal (ends automation early if achieved)
        goal: {
            enabled: { type: Boolean, default: false },
            type: {
                type: String,
                enum: ['email_opened', 'email_clicked', 'tag_added', 'list_added'],
            },
            value: String,
        },

        // Exit conditions
        exitConditions: [{
            type: {
                type: String,
                enum: ['unsubscribed', 'tag_added', 'tag_removed', 'list_removed']
            },
            value: String,
        }],
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'active', 'paused', 'archived'],
        default: 'draft',
        index: true,
    },

    // Stats
    stats: {
        totalEntered: { type: Number, default: 0 },
        currentlyActive: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        goalReached: { type: Number, default: 0 },
        exited: { type: Number, default: 0 },

        emailsSent: { type: Number, default: 0 },
        emailsOpened: { type: Number, default: 0 },
        emailsClicked: { type: Number, default: 0 },

        lastTriggeredAt: Date,
        lastUpdatedAt: Date,
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
    activatedAt: Date,
    activatedBy: {
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
automationSchema.index({ orgId: 1, status: 1 });

// Trigger-based lookup
automationSchema.index({ orgId: 1, 'trigger.type': 1, status: 1 });

// List-triggered automations
automationSchema.index({ 'trigger.listId': 1, status: 1 });

// Tag-triggered automations
automationSchema.index({ 'trigger.tag': 1, status: 1 });

// ============ VIRTUALS ============

automationSchema.virtual('stepCount').get(function () {
    return this.steps?.length || 0;
});

automationSchema.virtual('emailStepCount').get(function () {
    return this.steps?.filter(s => s.action.type === 'send_email').length || 0;
});

automationSchema.virtual('conversionRate').get(function () {
    if (this.stats.totalEntered === 0) return 0;
    return Math.round((this.stats.goalReached / this.stats.totalEntered) * 10000) / 100;
});

// ============ METHODS ============

// Activate automation
automationSchema.methods.activate = function (userId) {
    if (this.steps.length === 0) {
        throw new Error('Cannot activate automation without steps');
    }
    if (!this.trigger || !this.trigger.type) {
        throw new Error('Cannot activate automation without trigger');
    }

    this.status = 'active';
    this.activatedAt = new Date();
    this.activatedBy = userId;

    return this.save();
};

// Pause automation
automationSchema.methods.pause = function () {
    this.status = 'paused';
    return this.save();
};

// Get step by ID
automationSchema.methods.getStep = function (stepId) {
    return this.steps.find(s => s.stepId === stepId);
};

// Get next steps for a given step
automationSchema.methods.getNextSteps = function (stepId, branchCondition = 'default') {
    const step = this.getStep(stepId);
    if (!step) return [];

    return step.nextSteps
        .filter(ns => ns.condition === branchCondition || ns.condition === 'default')
        .map(ns => this.getStep(ns.stepId))
        .filter(Boolean);
};

// Validate workflow
automationSchema.methods.validate = function () {
    const errors = [];

    // Check entry step exists
    if (!this.entryStepId) {
        errors.push('Entry step not defined');
    } else if (!this.getStep(this.entryStepId)) {
        errors.push('Entry step not found in steps');
    }

    // Check all next steps reference valid steps
    for (const step of this.steps) {
        for (const next of step.nextSteps || []) {
            if (!this.getStep(next.stepId)) {
                errors.push(`Step ${step.stepId} references non-existent step ${next.stepId}`);
            }
        }

        // Check email steps have templates
        if (step.action.type === 'send_email' && !step.action.email?.templateId) {
            errors.push(`Email step ${step.stepId} missing template`);
        }
    }

    return { valid: errors.length === 0, errors };
};

// Clone automation
automationSchema.methods.clone = function (newName) {
    const cloned = this.toObject();

    delete cloned._id;
    delete cloned.createdAt;
    delete cloned.updatedAt;

    cloned.name = newName || `${this.name} (Copy)`;
    cloned.status = 'draft';
    cloned.stats = {
        totalEntered: 0,
        currentlyActive: 0,
        completed: 0,
        goalReached: 0,
        exited: 0,
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
    };
    cloned.activatedAt = null;
    cloned.activatedBy = null;

    // Reset step stats
    cloned.steps = cloned.steps.map(step => ({
        ...step,
        stats: { entered: 0, completed: 0, failed: 0 },
    }));

    return new (mongoose.model('Automation'))(cloned);
};

// ============ STATICS ============

// Find active automations for a trigger type
automationSchema.statics.findByTrigger = function (orgId, triggerType, options = {}) {
    const query = {
        orgId,
        status: 'active',
        'trigger.type': triggerType,
    };

    if (options.listId) {
        query['trigger.listId'] = options.listId;
    }
    if (options.tag) {
        query['trigger.tag'] = options.tag;
    }

    return this.find(query);
};

// Find automations triggered by list subscription
automationSchema.statics.findByListSubscription = function (orgId, listId) {
    return this.findByTrigger(orgId, 'list_subscription', { listId });
};

// Find automations triggered by tag
automationSchema.statics.findByTagAdded = function (orgId, tag) {
    return this.findByTrigger(orgId, 'tag_added', { tag });
};

module.exports = mongoose.model('Automation', automationSchema);
