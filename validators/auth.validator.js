/**
 * Authentication Validators
 * 
 * Request validation for authentication endpoints.
 */

/**
 * Validate signup request
 */
const validateSignup = (req, res, next) => {
    const { email, password, firstName, lastName } = req.body;
    const errors = [];

    // Email validation
    if (!email) {
        errors.push('Email is required');
    } else if (!isValidEmail(email)) {
        errors.push('Invalid email format');
    }

    // Password validation
    if (!password) {
        errors.push('Password is required');
    } else {
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }
    }

    // Name validation
    if (!firstName) {
        errors.push('First name is required');
    } else if (firstName.length > 50) {
        errors.push('First name cannot exceed 50 characters');
    }

    if (!lastName) {
        errors.push('Last name is required');
    } else if (lastName.length > 50) {
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
 * Validate login request
 */
const validateLogin = (req, res, next) => {
    const { email, password } = req.body;
    const errors = [];

    if (!email) {
        errors.push('Email is required');
    } else if (!isValidEmail(email)) {
        errors.push('Invalid email format');
    }

    if (!password) {
        errors.push('Password is required');
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
 * Validate email request
 */
const validateEmail = (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required',
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format',
        });
    }

    next();
};

/**
 * Validate password reset request
 */
const validateResetPassword = (req, res, next) => {
    const { token, password } = req.body;
    const errors = [];

    if (!token) {
        errors.push('Reset token is required');
    }

    if (!password) {
        errors.push('Password is required');
    } else {
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
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
 * Validate change password request
 */
const validateChangePassword = (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    const errors = [];

    if (!currentPassword) {
        errors.push('Current password is required');
    }

    if (!newPassword) {
        errors.push('New password is required');
    } else {
        if (newPassword.length < 8) {
            errors.push('New password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(newPassword)) {
            errors.push('New password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(newPassword)) {
            errors.push('New password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(newPassword)) {
            errors.push('New password must contain at least one number');
        }
        if (currentPassword === newPassword) {
            errors.push('New password must be different from current password');
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
 * Helper: Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

module.exports = {
    validateSignup,
    validateLogin,
    validateEmail,
    validateResetPassword,
    validateChangePassword,
};
