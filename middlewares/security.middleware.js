/**
 * Security Middleware
 * 
 * Rate limiting, IP blocking, and security headers.
 */

const rateLimit = require('express-rate-limit');

// Store for blocked IPs (in production use Redis)
const blockedIPs = new Set();
const suspiciousActivity = new Map();

/**
 * Global rate limiter
 */
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: {
        success: false,
        message: 'Too many requests, please try again later',
        error: { code: 'RATE_LIMITED' },
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    },
});

/**
 * Auth rate limiter (stricter for login/signup)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later',
        error: { code: 'AUTH_RATE_LIMITED' },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

/**
 * API rate limiter (per user)
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        success: false,
        message: 'API rate limit exceeded',
        error: { code: 'API_RATE_LIMITED' },
    },
    keyGenerator: (req) => {
        return req.user?.userId || req.ip || 'unknown';
    },
});

/**
 * Email sending rate limiter
 */
const emailLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 campaign sends per minute
    message: {
        success: false,
        message: 'Email sending rate limit exceeded',
        error: { code: 'EMAIL_RATE_LIMITED' },
    },
    keyGenerator: (req) => {
        return req.user?.orgId || req.ip || 'unknown';
    },
});

/**
 * IP blocking middleware
 */
const checkBlockedIP = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'];

    if (blockedIPs.has(ip)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied',
            error: { code: 'IP_BLOCKED' },
        });
    }

    next();
};

/**
 * Block an IP address
 */
const blockIP = (ip, reason, duration = 24 * 60 * 60 * 1000) => {
    blockedIPs.add(ip);
    console.log(`🚫 Blocked IP: ${ip} - Reason: ${reason}`);

    // Auto-unblock after duration
    if (duration > 0) {
        setTimeout(() => {
            blockedIPs.delete(ip);
            console.log(`✅ Unblocked IP: ${ip}`);
        }, duration);
    }
};

/**
 * Unblock an IP address
 */
const unblockIP = (ip) => {
    blockedIPs.delete(ip);
    console.log(`✅ Manually unblocked IP: ${ip}`);
};

/**
 * Get all blocked IPs
 */
const getBlockedIPs = () => {
    return Array.from(blockedIPs);
};

/**
 * Track suspicious activity
 */
const trackSuspiciousActivity = (req, type) => {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const key = `${ip}:${type}`;

    const current = suspiciousActivity.get(key) || { count: 0, firstSeen: Date.now() };
    current.count++;
    current.lastSeen = Date.now();
    suspiciousActivity.set(key, current);

    // Auto-block after threshold
    const thresholds = {
        failed_login: 10,
        invalid_token: 20,
        sql_injection: 3,
        xss_attempt: 3,
    };

    if (current.count >= (thresholds[type] || 10)) {
        blockIP(ip, `Suspicious activity: ${type} (${current.count} attempts)`);
        suspiciousActivity.delete(key);
    }
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
    // Prevent XSS
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'");

    // Strict Transport Security (HTTPS only)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
};

/**
 * Request sanitization middleware
 */
const sanitizeRequest = (req, res, next) => {
    // Check for common injection patterns
    const checkValue = (value, path) => {
        if (typeof value !== 'string') return;

        // SQL injection patterns
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i,
            /('|"|;|--|\*|\/\*)/,
        ];

        // XSS patterns
        const xssPatterns = [
            /<script\b[^>]*>/i,
            /javascript:/i,
            /on\w+\s*=/i,
        ];

        for (const pattern of sqlPatterns) {
            if (pattern.test(value)) {
                trackSuspiciousActivity(req, 'sql_injection');
                console.warn(`⚠️ SQL injection attempt from ${req.ip}: ${path}`);
            }
        }

        for (const pattern of xssPatterns) {
            if (pattern.test(value)) {
                trackSuspiciousActivity(req, 'xss_attempt');
                console.warn(`⚠️ XSS attempt from ${req.ip}: ${path}`);
            }
        }
    };

    // Check query params
    for (const [key, value] of Object.entries(req.query || {})) {
        checkValue(value, `query.${key}`);
    }

    // Check body (shallow check)
    if (req.body && typeof req.body === 'object') {
        for (const [key, value] of Object.entries(req.body)) {
            checkValue(value, `body.${key}`);
        }
    }

    next();
};

module.exports = {
    globalLimiter,
    authLimiter,
    apiLimiter,
    emailLimiter,
    checkBlockedIP,
    blockIP,
    unblockIP,
    getBlockedIPs,
    trackSuspiciousActivity,
    securityHeaders,
    sanitizeRequest,
};
