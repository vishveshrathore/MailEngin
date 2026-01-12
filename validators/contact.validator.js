/**
 * Contact Validators
 * 
 * Request validation for contact endpoints.
 */

/**
 * Validate create contact request
 */
const validateCreateContact = (req, res, next) => {
    const { email } = req.body;
    const errors = [];

    if (!email) {
        errors.push('Email is required');
    } else if (!isValidEmail(email)) {
        errors.push('Invalid email format');
    }

    if (req.body.firstName && req.body.firstName.length > 50) {
        errors.push('First name cannot exceed 50 characters');
    }

    if (req.body.lastName && req.body.lastName.length > 50) {
        errors.push('Last name cannot exceed 50 characters');
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
 * Validate update contact request
 */
const validateUpdateContact = (req, res, next) => {
    const errors = [];

    if (req.body.email && !isValidEmail(req.body.email)) {
        errors.push('Invalid email format');
    }

    if (req.body.firstName && req.body.firstName.length > 50) {
        errors.push('First name cannot exceed 50 characters');
    }

    if (req.body.lastName && req.body.lastName.length > 50) {
        errors.push('Last name cannot exceed 50 characters');
    }

    if (req.body.status) {
        const validStatuses = ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'bounced', 'complained'];
        if (!validStatuses.includes(req.body.status)) {
            errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
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
 * Validate MongoDB ObjectId
 */
const validateObjectId = (paramName) => (req, res, next) => {
    const id = req.params[paramName];

    if (!id || !isValidObjectId(id)) {
        return res.status(400).json({
            success: false,
            message: `Invalid ${paramName} format`,
        });
    }

    next();
};

/**
 * Helper: Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Helper: Validate MongoDB ObjectId
 */
function isValidObjectId(id) {
    return /^[a-fA-F0-9]{24}$/.test(id);
}

module.exports = {
    validateCreateContact,
    validateUpdateContact,
    validateObjectId,
};
