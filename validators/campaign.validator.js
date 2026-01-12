/**
 * Campaign Validators
 * 
 * Request validation for campaign endpoints.
 */

/**
 * Validate create campaign request
 */
const validateCreateCampaign = (req, res, next) => {
    const { name } = req.body;
    const errors = [];

    if (!name) {
        errors.push('Campaign name is required');
    } else if (name.length > 100) {
        errors.push('Campaign name cannot exceed 100 characters');
    }

    if (req.body.type) {
        const validTypes = ['regular', 'ab_test', 'automated', 'rss'];
        if (!validTypes.includes(req.body.type)) {
            errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

/**
 * Validate update campaign request
 */
const validateUpdateCampaign = (req, res, next) => {
    const errors = [];

    if (req.body.name && req.body.name.length > 100) {
        errors.push('Campaign name cannot exceed 100 characters');
    }

    if (req.body.email?.subject && req.body.email.subject.length > 200) {
        errors.push('Subject cannot exceed 200 characters');
    }

    if (req.body.type) {
        const validTypes = ['regular', 'ab_test', 'automated', 'rss'];
        if (!validTypes.includes(req.body.type)) {
            errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

/**
 * Validate recipients request
 */
const validateRecipients = (req, res, next) => {
    const { lists, segments } = req.body;
    const errors = [];

    if ((!lists || lists.length === 0) && (!segments || segments.length === 0)) {
        errors.push('At least one list or segment is required');
    }

    if (lists && !Array.isArray(lists)) {
        errors.push('Lists must be an array');
    }

    if (segments && !Array.isArray(segments)) {
        errors.push('Segments must be an array');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

/**
 * Validate schedule request
 */
const validateSchedule = (req, res, next) => {
    const { scheduledAt } = req.body;
    const errors = [];

    if (!scheduledAt) {
        errors.push('Scheduled date/time is required');
    } else {
        const scheduleDate = new Date(scheduledAt);
        if (isNaN(scheduleDate.getTime())) {
            errors.push('Invalid date format');
        } else if (scheduleDate < new Date()) {
            errors.push('Schedule time must be in the future');
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

module.exports = {
    validateCreateCampaign,
    validateUpdateCampaign,
    validateRecipients,
    validateSchedule,
};
