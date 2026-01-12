/**
 * Global Error Handler Middleware
 * 
 * Catches all errors and returns consistent error responses.
 */

const errorHandler = (err, req, res, next) => {
    console.error('❌ Error:', err);

    // Default error
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let code = err.code || 'SERVER_ERROR';

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        const errors = Object.values(err.errors).map(e => e.message);
        message = errors.join(', ');
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        statusCode = 400;
        code = 'DUPLICATE_ERROR';
        const field = Object.keys(err.keyValue)[0];
        message = `${field} already exists`;
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_ID';
        message = 'Invalid ID format';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        code = 'INVALID_TOKEN';
        message = 'Invalid token';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        code = 'TOKEN_EXPIRED';
        message = 'Token expired';
    }

    // Known error messages
    const knownErrors = {
        'Email already registered': { statusCode: 400, code: 'EMAIL_EXISTS' },
        'Invalid email or password': { statusCode: 401, code: 'INVALID_CREDENTIALS' },
        'Please verify your email before logging in': { statusCode: 401, code: 'EMAIL_NOT_VERIFIED' },
        'Invalid or expired verification token': { statusCode: 400, code: 'INVALID_TOKEN' },
        'Invalid or expired reset token': { statusCode: 400, code: 'INVALID_TOKEN' },
        'User not found': { statusCode: 404, code: 'USER_NOT_FOUND' },
        'Current password is incorrect': { statusCode: 400, code: 'INVALID_PASSWORD' },
        'User not found or already verified': { statusCode: 400, code: 'ALREADY_VERIFIED' },
    };

    if (knownErrors[message]) {
        statusCode = knownErrors[message].statusCode;
        code = knownErrors[message].code;
    }

    // Send response
    res.status(statusCode).json({
        success: false,
        message,
        code,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

/**
 * Not Found Handler
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        code: 'NOT_FOUND',
    });
};

module.exports = {
    errorHandler,
    notFoundHandler,
};
