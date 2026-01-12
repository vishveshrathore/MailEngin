/**
 * Token Utilities
 * 
 * JWT token generation and verification utilities.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtConfig = require('../config/jwt.config');

/**
 * Generate access token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload) => {
    return jwt.sign(payload, jwtConfig.accessToken.secret, {
        expiresIn: jwtConfig.accessToken.expiresIn,
    });
};

/**
 * Generate refresh token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
    return jwt.sign(payload, jwtConfig.refreshToken.secret, {
        expiresIn: jwtConfig.refreshToken.expiresIn,
    });
};

/**
 * Verify access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, jwtConfig.accessToken.secret);
};

/**
 * Verify refresh token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, jwtConfig.refreshToken.secret);
};

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (user) => {
    const payload = {
        userId: user._id,
        email: user.email,
        orgId: user.orgId,
        role: user.role,
    };

    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken({ userId: user._id }),
    };
};

/**
 * Generate random token for email verification/password reset
 * @returns {Object} { token, hashedToken }
 */
const generateRandomToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    return { token, hashedToken };
};

/**
 * Hash a token
 * @param {string} token - Plain token
 * @returns {string} Hashed token
 */
const hashToken = (token) => {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
};

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
};

/**
 * Get token expiry date
 * @param {string} expiresIn - Express format (e.g., '7d', '15m')
 * @returns {Date} Expiry date
 */
const getExpiryDate = (expiresIn) => {
    const units = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error('Invalid expiry format');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    return new Date(Date.now() + value * units[unit]);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateTokenPair,
    generateRandomToken,
    hashToken,
    decodeToken,
    getExpiryDate,
};
