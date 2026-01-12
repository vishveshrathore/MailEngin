/**
 * JWT Configuration
 * 
 * Central configuration for JWT token management.
 */

require('dotenv').config();

module.exports = {
    // Access token settings
    accessToken: {
        secret: process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-key-change-in-production',
        expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    },

    // Refresh token settings
    refreshToken: {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret-key-change-in-production',
        expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
        // Max refresh tokens per user (for session management)
        maxPerUser: 5,
    },

    // Email verification token
    emailVerification: {
        expiresIn: 24 * 60 * 60 * 1000, // 24 hours in ms
    },

    // Password reset token
    passwordReset: {
        expiresIn: 10 * 60 * 1000, // 10 minutes in ms
    },

    // Cookie settings
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
};
