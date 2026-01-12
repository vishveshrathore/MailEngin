/**
 * Security Middleware (Dummy Version for Debugging)
 */

console.log("Loading security middleware (dummy)...");

// Dummy middleware
const dummyLimiter = (req, res, next) => next();

module.exports = {
    globalLimiter: dummyLimiter,
    authLimiter: dummyLimiter,
    apiLimiter: dummyLimiter,
    emailLimiter: dummyLimiter,
    checkBlockedIP: (req, res, next) => next(),
    blockIP: () => { },
    unblockIP: () => { },
    getBlockedIPs: () => [],
    trackSuspiciousActivity: () => { },
    securityHeaders: (req, res, next) => next(),
    sanitizeRequest: (req, res, next) => next(),
};
