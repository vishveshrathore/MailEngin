/**
 * Audit Log Model
 * 
 * Tracks all important user actions for compliance and security.
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    // Who performed the action
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },

    userEmail: String,

    // Organization context
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true,
    },

    // Action details
    action: {
        type: String,
        required: true,
        index: true,
        enum: [
            // Auth actions
            'login', 'logout', 'login_failed', 'password_change', 'password_reset',
            '2fa_enabled', '2fa_disabled', 'token_refresh',

            // User management
            'user_create', 'user_update', 'user_delete', 'user_invite',
            'role_change', 'permission_change',

            // Contact actions
            'contact_create', 'contact_update', 'contact_delete', 'contact_import',
            'contact_export', 'contact_unsubscribe', 'contact_resubscribe',

            // Campaign actions
            'campaign_create', 'campaign_update', 'campaign_delete',
            'campaign_send', 'campaign_schedule', 'campaign_pause', 'campaign_cancel',

            // Template actions
            'template_create', 'template_update', 'template_delete',

            // List actions
            'list_create', 'list_update', 'list_delete',

            // Automation actions
            'automation_create', 'automation_update', 'automation_delete',
            'automation_activate', 'automation_pause',

            // Subscription actions
            'subscription_upgrade', 'subscription_downgrade', 'subscription_cancel',
            'payment_success', 'payment_failed',

            // Admin actions
            'admin_user_suspend', 'admin_user_reactivate',
            'admin_org_suspend', 'admin_org_reactivate',
            'admin_plan_change', 'admin_credits_grant',
            'admin_campaign_flag', 'admin_ip_block',

            // Security events
            'suspicious_activity', 'rate_limit_exceeded', 'ip_blocked',

            // Other
            'api_key_create', 'api_key_delete', 'webhook_create', 'webhook_delete',
            'settings_update', 'other',
        ],
    },

    // Resource affected
    resource: {
        type: {
            type: String,
            enum: ['user', 'contact', 'campaign', 'template', 'list', 'automation',
                'subscription', 'organization', 'apiKey', 'webhook', 'settings', 'other'],
        },
        id: mongoose.Schema.Types.ObjectId,
        name: String,
    },

    // Request details
    request: {
        method: String,
        path: String,
        ip: String,
        userAgent: String,
    },

    // Changes made
    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed,
    },

    // Additional metadata
    metadata: mongoose.Schema.Types.Mixed,

    // Status
    status: {
        type: String,
        enum: ['success', 'failure', 'warning'],
        default: 'success',
    },

    // Error if failed
    error: String,

}, {
    timestamps: true,
});

// Indexes for efficient queries
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// TTL - keep logs for 1 year
auditLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 365 * 24 * 60 * 60 }
);

/**
 * Static: Create audit log entry
 */
auditLogSchema.statics.log = async function (data) {
    try {
        return await this.create(data);
    } catch (error) {
        console.error('Failed to create audit log:', error.message);
    }
};

/**
 * Static: Get logs for organization
 */
auditLogSchema.statics.getForOrg = async function (orgId, options = {}) {
    const { page = 1, limit = 50, action, userId, startDate, endDate } = options;

    const query = { orgId };

    if (action) query.action = action;
    if (userId) query.userId = userId;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        this.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'email firstName lastName'),
        this.countDocuments(query),
    ]);

    return {
        logs,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
};

/**
 * Static: Get security events
 */
auditLogSchema.statics.getSecurityEvents = async function (options = {}) {
    const { hours = 24, limit = 100 } = options;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.find({
        action: {
            $in: ['login_failed', 'suspicious_activity', 'rate_limit_exceeded', 'ip_blocked']
        },
        createdAt: { $gte: since },
    })
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
