/**
 * Template Validators
 * 
 * Request validation for template endpoints.
 */

/**
 * Validate create template request
 */
const validateCreateTemplate = (req, res, next) => {
    const { name, subject, htmlContent } = req.body;
    const errors = [];

    if (!name) {
        errors.push('Template name is required');
    } else if (name.length > 100) {
        errors.push('Template name cannot exceed 100 characters');
    }

    if (!subject) {
        errors.push('Subject line is required');
    } else if (subject.length > 200) {
        errors.push('Subject cannot exceed 200 characters');
    }

    if (!htmlContent) {
        errors.push('HTML content is required');
    }

    if (req.body.type) {
        const validTypes = ['campaign', 'automation', 'transactional', 'system'];
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
 * Validate update template request
 */
const validateUpdateTemplate = (req, res, next) => {
    const errors = [];

    if (req.body.name && req.body.name.length > 100) {
        errors.push('Template name cannot exceed 100 characters');
    }

    if (req.body.subject && req.body.subject.length > 200) {
        errors.push('Subject cannot exceed 200 characters');
    }

    if (req.body.preheader && req.body.preheader.length > 200) {
        errors.push('Preheader cannot exceed 200 characters');
    }

    if (req.body.type) {
        const validTypes = ['campaign', 'automation', 'transactional', 'system'];
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
 * Validate variant request
 */
const validateVariant = (req, res, next) => {
    const { name, subject, htmlContent } = req.body;
    const errors = [];

    if (!name) {
        errors.push('Variant name is required');
    }

    if (!subject) {
        errors.push('Subject line is required');
    }

    if (!htmlContent) {
        errors.push('HTML content is required');
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
    validateCreateTemplate,
    validateUpdateTemplate,
    validateVariant,
};
