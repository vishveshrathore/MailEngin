/**
 * Audit Middleware
 * 
 * Automatic audit logging for API requests.
 */

const AuditLog = require('../models/AuditLog.model');

/**
 * Map route patterns to actions
 */
const actionMap = {
    // Auth
    'POST:/api/auth/login': 'login',
    'POST:/api/auth/logout': 'logout',
    'POST:/api/auth/register': 'user_create',
    'POST:/api/auth/change-password': 'password_change',
    'POST:/api/auth/reset-password': 'password_reset',

    // Contacts
    'POST:/api/contacts': 'contact_create',
    'PATCH:/api/contacts/:id': 'contact_update',
    'DELETE:/api/contacts/:id': 'contact_delete',
    'POST:/api/contacts/import': 'contact_import',
    'GET:/api/contacts/export': 'contact_export',

    // Campaigns
    'POST:/api/campaigns': 'campaign_create',
    'PATCH:/api/campaigns/:id': 'campaign_update',
    'DELETE:/api/campaigns/:id': 'campaign_delete',
    'POST:/api/campaigns/:id/send': 'campaign_send',
    'POST:/api/campaigns/:id/schedule': 'campaign_schedule',
    'POST:/api/campaigns/:id/pause': 'campaign_pause',
    'POST:/api/campaigns/:id/cancel': 'campaign_cancel',

    // Templates
    'POST:/api/templates': 'template_create',
    'PATCH:/api/templates/:id': 'template_update',
    'DELETE:/api/templates/:id': 'template_delete',

    // Automations
    'POST:/api/automations': 'automation_create',
    'PATCH:/api/automations/:id': 'automation_update',
    'DELETE:/api/automations/:id': 'automation_delete',
    'POST:/api/automations/:id/activate': 'automation_activate',
    'POST:/api/automations/:id/pause': 'automation_pause',

    // Subscriptions
    'POST:/api/subscriptions/upgrade': 'subscription_upgrade',
    'POST:/api/subscriptions/cancel': 'subscription_cancel',

    // Admin
    'POST:/api/admin/users/:id/suspend': 'admin_user_suspend',
    'POST:/api/admin/users/:id/reactivate': 'admin_user_reactivate',
    'POST:/api/admin/organizations/:id/suspend': 'admin_org_suspend',
    'POST:/api/admin/organizations/:id/reactivate': 'admin_org_reactivate',
    'POST:/api/admin/organizations/:id/change-plan': 'admin_plan_change',
    'POST:/api/admin/organizations/:id/grant-credits': 'admin_credits_grant',
    'POST:/api/admin/campaigns/:id/flag': 'admin_campaign_flag',
};

/**
 * Match route pattern
 */
function matchRoute(method, path) {
    const fullRoute = `${method}:${path}`;

    // Try exact match first
    if (actionMap[fullRoute]) {
        return actionMap[fullRoute];
    }

    // Try pattern matching
    for (const [pattern, action] of Object.entries(actionMap)) {
        const [patternMethod, patternPath] = pattern.split(':');
        if (patternMethod !== method) continue;

        const patternParts = patternPath.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) continue;

        let match = true;
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) continue;
            if (patternParts[i] !== pathParts[i]) {
                match = false;
                break;
            }
        }

        if (match) return action;
    }

    return null;
}

/**
 * Extract resource info from request
 */
function extractResource(req, action) {
    const resource = { type: 'other' };

    if (action.includes('contact')) resource.type = 'contact';
    else if (action.includes('campaign')) resource.type = 'campaign';
    else if (action.includes('template')) resource.type = 'template';
    else if (action.includes('automation')) resource.type = 'automation';
    else if (action.includes('user')) resource.type = 'user';
    else if (action.includes('org')) resource.type = 'organization';
    else if (action.includes('subscription')) resource.type = 'subscription';

    // Extract ID from params
    if (req.params.id) {
        resource.id = req.params.id;
    }

    // Extract name from body or response
    if (req.body?.name) {
        resource.name = req.body.name;
    }

    return resource;
}

/**
 * Audit logging middleware
 */
const auditLogger = (options = {}) => {
    const { excludePaths = [], includeBody = false } = options;

    return async (req, res, next) => {
        // Skip excluded paths
        if (excludePaths.some(p => req.path.startsWith(p))) {
            return next();
        }

        // Skip GET requests (read operations)
        if (req.method === 'GET' && !options.includeReads) {
            return next();
        }

        const action = matchRoute(req.method, req.path);

        // Skip if no mapped action
        if (!action) {
            return next();
        }

        // Store original end function
        const originalEnd = res.end;
        const startTime = Date.now();

        // Override res.end to log after response
        res.end = function (...args) {
            // Restore original
            res.end = originalEnd;

            // Call original
            res.end.apply(this, args);

            // Log asynchronously
            setImmediate(async () => {
                try {
                    const logData = {
                        userId: req.user?.userId,
                        userEmail: req.user?.email,
                        orgId: req.user?.orgId,
                        action,
                        resource: extractResource(req, action),
                        request: {
                            method: req.method,
                            path: req.path,
                            ip: req.ip || req.headers['x-forwarded-for'],
                            userAgent: req.headers['user-agent'],
                        },
                        status: res.statusCode < 400 ? 'success' : 'failure',
                        metadata: {
                            duration: Date.now() - startTime,
                            statusCode: res.statusCode,
                        },
                    };

                    // Include body for certain actions
                    if (includeBody && ['create', 'update'].some(a => action.includes(a))) {
                        logData.changes = {
                            after: sanitizeBody(req.body),
                        };
                    }

                    await AuditLog.log(logData);
                } catch (error) {
                    console.error('Audit log error:', error.message);
                }
            });
        };

        next();
    };
};

/**
 * Sanitize body for logging (remove sensitive fields)
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }

    return sanitized;
}

/**
 * Log action manually
 */
async function logAction(req, action, options = {}) {
    const { resource, changes, metadata, status = 'success', error } = options;

    await AuditLog.log({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        orgId: req.user?.orgId,
        action,
        resource,
        request: {
            method: req.method,
            path: req.path,
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
        },
        changes,
        metadata,
        status,
        error,
    });
}

/**
 * Log security event
 */
async function logSecurityEvent(req, action, metadata = {}) {
    await AuditLog.log({
        action,
        request: {
            method: req.method,
            path: req.path,
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
        },
        status: 'warning',
        metadata,
    });
}

module.exports = {
    auditLogger,
    logAction,
    logSecurityEvent,
};
