/**
 * Global Error Handler Middleware
 * 
 * Catches all errors, logs them using Winston, and returns consistent error responses.
 * Distinguishes between development and production environments.
 */

const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/**
 * Handle Mongoose CastError (Invalid ID)
 */
const handleCastErrorDB = (err) => {
    const message = `Invalid ${err.path}: ${err.value}.`;
    return new AppError(message, 400, 'INVALID_ID');
};

/**
 * Handle Mongoose Duplicate Key Error
 */
const handleDuplicateFieldsDB = (err) => {
    // Extract duplicate field value
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value: ${field}. Please use another value!`;
    return new AppError(message, 400, 'DUPLICATE_VALUE');
};

/**
 * Handle Mongoose Validation Error
 */
const handleValidationErrorDB = (err) => {
    const errors = Object.values(err.errors).map((el) => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    return new AppError(message, 400, 'VALIDATION_ERROR');
};

/**
 * Handle JWT Invalid Token
 */
const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401, 'INVALID_TOKEN');

/**
 * Handle JWT Expired Token
 */
const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401, 'TOKEN_EXPIRED');

/**
 * Send detailed error in Development
 */
const sendErrorDev = (err, req, res) => {
    logger.error('DEV ERROR 💥', {
        statusCode: err.statusCode,
        status: err.status,
        message: err.message,
        stack: err.stack,
        error: err
    });

    return res.status(err.statusCode).json({
        success: false,
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
    });
};

/**
 * Send sanitized error in Production
 */
const sendErrorProd = (err, req, res) => {
    // A) Operational, trusted error: send message to client
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            status: err.status,
            message: err.message,
            code: err.code || 'ERROR',
        });
    }

    // B) Programming or other unknown error: don't leak details
    // 1) Log error
    logger.error('PROD ERROR 💥', err);

    // 2) Send generic message
    return res.status(500).json({
        success: false,
        status: 'error',
        message: 'Something went very wrong!',
        code: 'INTERNAL_SERVER_ERROR',
    });
};

/**
 * Main Error Handler
 */
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, req, res);
    } else {
        let error = { ...err };
        error.message = err.message; // Important: message property is sometimes lost in spread
        error.name = err.name;
        error.code = err.code;

        // Mongoose specific error handling
        if (error.name === 'CastError') error = handleCastErrorDB(error);
        if (error.code === 11000) error = handleDuplicateFieldsDB(error);
        if (error.name === 'ValidationError') error = handleValidationErrorDB(error);

        // JWT specific error handling
        if (error.name === 'JsonWebTokenError') error = handleJWTError();
        if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

        // Handle known string errors (legacy support)
        const knownErrors = {
            'Email already registered': { statusCode: 400, code: 'EMAIL_EXISTS' },
            'Invalid email or password': { statusCode: 401, code: 'INVALID_CREDENTIALS' },
            'Please verify your email before logging in': { statusCode: 401, code: 'EMAIL_NOT_VERIFIED' },
            'Invalid or expired verification token': { statusCode: 400, code: 'INVALID_TOKEN' },
            'User not found': { statusCode: 404, code: 'USER_NOT_FOUND' },
        };

        if (knownErrors[error.message]) {
            error = new AppError(error.message, knownErrors[error.message].statusCode, knownErrors[error.message].code);
        }

        sendErrorProd(error, req, res);
    }
};

/**
 * Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
    const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404, 'NOT_FOUND');
    next(err);
};

module.exports = {
    errorHandler,
    notFoundHandler,
};
