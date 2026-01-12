/**
 * Authentication Middleware
 * 
 * JWT token verification and user authentication.
 */

const tokenUtils = require('../utils/token.utils');
const User = require('../models/User.model');

/**
 * Authenticate user with JWT access token
 * Extracts token from Authorization header and verifies it
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.',
                code: 'NO_TOKEN',
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token
        let decoded;
        try {
            decoded = tokenUtils.verifyAccessToken(token);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED',
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
                code: 'INVALID_TOKEN',
            });
        }

        // Check if user still exists and is active
        const user = await User.findById(decoded.userId).select('status role');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists',
                code: 'USER_NOT_FOUND',
            });
        }

        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'User account is not active',
                code: 'ACCOUNT_INACTIVE',
            });
        }

        // Check if user changed password after token was issued
        if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
            return res.status(401).json({
                success: false,
                message: 'Password was changed. Please login again.',
                code: 'PASSWORD_CHANGED',
            });
        }

        // Attach user to request
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            orgId: decoded.orgId,
            role: decoded.role,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error',
        });
    }
};

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that have different behavior for authenticated users
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = tokenUtils.verifyAccessToken(token);
            req.user = {
                userId: decoded.userId,
                email: decoded.email,
                orgId: decoded.orgId,
                role: decoded.role,
            };
        } catch {
            // Token invalid, but we continue without user
        }

        next();
    } catch (error) {
        next();
    }
};

/**
 * Require specific roles
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                code: 'NOT_AUTHENTICATED',
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                code: 'FORBIDDEN',
            });
        }

        next();
    };
};

/**
 * Require owner role only
 */
const requireOwner = requireRole('owner');

/**
 * Require admin or owner role
 */
const requireAdmin = requireRole('owner', 'admin');

/**
 * Require editor or above
 */
const requireEditor = requireRole('owner', 'admin', 'editor');

/**
 * Check specific permission
 * @param {string} resource - Resource name (campaigns, contacts, etc)
 * @param {string} action - Action name (create, edit, delete, etc)
 */
const requirePermission = (resource, action) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                code: 'NOT_AUTHENTICATED',
            });
        }

        // Owners have all permissions
        if (req.user.role === 'owner') {
            return next();
        }

        // Get full user with permissions
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
                code: 'USER_NOT_FOUND',
            });
        }

        if (!user.hasPermission(resource, action)) {
            return res.status(403).json({
                success: false,
                message: `You don't have permission to ${action} ${resource}`,
                code: 'FORBIDDEN',
            });
        }

        next();
    };
};

module.exports = {
    authenticate,
    optionalAuth,
    requireRole,
    requireOwner,
    requireAdmin,
    requireEditor,
    requirePermission,
};
