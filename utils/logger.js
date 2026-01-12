/**
 * Logger Utility
 * 
 * Centralized logging system using Winston.
 * Supports different log levels, console output, and file rotation.
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define log colors
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

// Link colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Print stack trace
    winston.format.splat(),
    winston.format.json()
);

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
    )
);

// Create the logger instance
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    levels,
    format,
    transports: [
        // - Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // - Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: path.join(__dirname, '../logs/exceptions.log') })
    ],
    rejectionHandlers: [
        new winston.transports.File({ filename: path.join(__dirname, '../logs/rejections.log') })
    ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
    }));
} else {
    // In production, also log errors to console for cloud provider logs (like CloudWatch/Stackdriver)
    logger.add(new winston.transports.Console({
        level: 'error',
        format: winston.format.simple(),
    }));
}

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    },
};

module.exports = logger;
