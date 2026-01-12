/**
 * AppError Class
 * 
 * Custom error class for operational errors.
 * distinguishing between operational (trusted) errors and programming bugs.
 */

class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Marks error as trusted/operational
        this.code = code;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
