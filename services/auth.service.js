/**
 * Authentication Service
 * 
 * Handles all authentication business logic.
 */

const User = require('../models/User.model');
const Organization = require('../models/Organization.model');
const Subscription = require('../models/Subscription.model');
const tokenUtils = require('../utils/token.utils');
const emailService = require('./email.service');
const jwtConfig = require('../config/jwt.config');

class AuthService {
    /**
     * Register a new user and organization
     */
    async signup({ email, password, firstName, lastName, organizationName }) {
        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            throw new Error('Email already registered');
        }

        // Create organization first
        const organization = await Organization.create({
            name: organizationName || `${firstName}'s Organization`,
            email: email.toLowerCase(),
            emailSettings: {
                fromName: organizationName || `${firstName} ${lastName}`,
                fromEmail: email.toLowerCase(),
            },
            status: 'trial',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
        });

        // Create subscription for the organization
        const subscription = await Subscription.create({
            orgId: organization._id,
            plan: 'free',
            planDetails: Subscription.PLANS.free,
            limits: Subscription.PLANS.free.limits,
            features: Subscription.PLANS.free.features,
            status: 'active',
            trial: {
                isTrialing: true,
                startedAt: new Date(),
                endsAt: organization.trialEndsAt,
            },
        });

        // Update organization with subscription reference
        organization.subscriptionId = subscription._id;
        await organization.save();

        // Generate email verification token
        const { token, hashedToken } = tokenUtils.generateRandomToken();

        // Create user
        const user = await User.create({
            orgId: organization._id,
            email: email.toLowerCase(),
            password,
            firstName,
            lastName,
            role: 'owner',
            status: 'pending',
            emailVerificationToken: hashedToken,
            emailVerificationExpires: new Date(Date.now() + jwtConfig.emailVerification.expiresIn),
        });

        // Update organization with creator
        organization.createdBy = user._id;
        await organization.save();

        // Send verification email
        try {
            await emailService.sendVerificationEmail(user, token);
        } catch (error) {
            console.error('Failed to send verification email:', error.message);
            // Don't fail signup if email fails
        }

        return {
            user: this.sanitizeUser(user),
            organization: {
                id: organization._id,
                name: organization.name,
                slug: organization.slug,
            },
            message: 'Please check your email to verify your account',
        };
    }

    /**
     * Login user
     */
    async login({ email, password, device, ip }) {
        // Find user with password field
        const user = await User.findOne({
            email: email.toLowerCase(),
            status: { $ne: 'suspended' },
        }).select('+password');

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        // Check if email is verified
        if (!user.emailVerified) {
            throw new Error('Please verify your email before logging in');
        }

        // Generate tokens
        const tokens = tokenUtils.generateTokenPair(user);

        // Store refresh token
        const refreshTokenExpiry = tokenUtils.getExpiryDate(jwtConfig.refreshToken.expiresIn);

        // Limit refresh tokens per user
        if (user.refreshTokens.length >= jwtConfig.refreshToken.maxPerUser) {
            // Remove oldest token
            user.refreshTokens.shift();
        }

        user.refreshTokens.push({
            token: tokenUtils.hashToken(tokens.refreshToken),
            device: device || 'unknown',
            ip: ip || 'unknown',
            expiresAt: refreshTokenExpiry,
        });

        // Update login stats
        user.lastLoginAt = new Date();
        user.loginCount += 1;
        await user.save();

        return {
            user: this.sanitizeUser(user),
            tokens,
        };
    }

    /**
     * Verify email address
     */
    async verifyEmail(token) {
        const hashedToken = tokenUtils.hashToken(token);

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpires: { $gt: new Date() },
        });

        if (!user) {
            throw new Error('Invalid or expired verification token');
        }

        // Update user
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        user.status = 'active';
        await user.save();

        // Send welcome email
        try {
            await emailService.sendWelcomeEmail(user);
        } catch (error) {
            console.error('Failed to send welcome email:', error.message);
        }

        // Generate tokens for auto-login
        const tokens = tokenUtils.generateTokenPair(user);

        return {
            user: this.sanitizeUser(user),
            tokens,
            message: 'Email verified successfully',
        };
    }

    /**
     * Resend verification email
     */
    async resendVerificationEmail(email) {
        const user = await User.findOne({
            email: email.toLowerCase(),
            emailVerified: false,
        });

        if (!user) {
            throw new Error('User not found or already verified');
        }

        // Generate new token
        const { token, hashedToken } = tokenUtils.generateRandomToken();

        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = new Date(Date.now() + jwtConfig.emailVerification.expiresIn);
        await user.save();

        // Send verification email
        await emailService.sendVerificationEmail(user, token);

        return {
            message: 'Verification email sent',
        };
    }

    /**
     * Forgot password - send reset email
     */
    async forgotPassword(email) {
        const user = await User.findOne({
            email: email.toLowerCase(),
            status: { $ne: 'suspended' },
        });

        // Always return success to prevent email enumeration
        if (!user) {
            return {
                message: 'If an account exists with this email, you will receive a password reset link',
            };
        }

        // Generate reset token
        const { token, hashedToken } = tokenUtils.generateRandomToken();

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + jwtConfig.passwordReset.expiresIn);
        await user.save();

        // Send reset email
        try {
            await emailService.sendPasswordResetEmail(user, token);
        } catch (error) {
            console.error('Failed to send password reset email:', error.message);
        }

        return {
            message: 'If an account exists with this email, you will receive a password reset link',
        };
    }

    /**
     * Reset password with token
     */
    async resetPassword(token, newPassword) {
        const hashedToken = tokenUtils.hashToken(token);

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: new Date() },
        });

        if (!user) {
            throw new Error('Invalid or expired reset token');
        }

        // Update password
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        // Invalidate all refresh tokens (force re-login on all devices)
        user.refreshTokens = [];

        await user.save();

        return {
            message: 'Password reset successfully. Please login with your new password.',
        };
    }

    /**
     * Refresh access token
     */
    async refreshToken(refreshToken) {
        // Verify the refresh token
        let decoded;
        try {
            decoded = tokenUtils.verifyRefreshToken(refreshToken);
        } catch (error) {
            throw new Error('Invalid refresh token');
        }

        // Find user and check if refresh token is valid
        const hashedToken = tokenUtils.hashToken(refreshToken);
        const user = await User.findOne({
            _id: decoded.userId,
            'refreshTokens.token': hashedToken,
            status: 'active',
        });

        if (!user) {
            throw new Error('Invalid refresh token');
        }

        // Check if specific refresh token is expired
        const tokenRecord = user.refreshTokens.find(t => t.token === hashedToken);
        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
            // Remove expired token
            user.refreshTokens = user.refreshTokens.filter(t => t.token !== hashedToken);
            await user.save();
            throw new Error('Refresh token expired');
        }

        // Generate new access token only
        const newAccessToken = tokenUtils.generateAccessToken({
            userId: user._id,
            email: user.email,
            orgId: user.orgId,
            role: user.role,
        });

        return {
            accessToken: newAccessToken,
        };
    }

    /**
     * Logout - invalidate refresh token
     */
    async logout(userId, refreshToken) {
        if (!refreshToken) {
            return { message: 'Logged out successfully' };
        }

        const hashedToken = tokenUtils.hashToken(refreshToken);

        await User.updateOne(
            { _id: userId },
            { $pull: { refreshTokens: { token: hashedToken } } }
        );

        return { message: 'Logged out successfully' };
    }

    /**
     * Logout from all devices
     */
    async logoutAll(userId) {
        await User.updateOne(
            { _id: userId },
            { $set: { refreshTokens: [] } }
        );

        return { message: 'Logged out from all devices' };
    }

    /**
     * Change password (requires current password)
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await User.findById(userId).select('+password');

        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            throw new Error('Current password is incorrect');
        }

        // Update password
        user.password = newPassword;

        // Invalidate all refresh tokens except current session
        user.refreshTokens = [];

        await user.save();

        return {
            message: 'Password changed successfully. Please login again on other devices.',
        };
    }

    /**
     * Get current user with organization
     */
    async getCurrentUser(userId) {
        const user = await User.findById(userId)
            .populate('orgId', 'name slug email branding status trialEndsAt');

        if (!user) {
            throw new Error('User not found');
        }

        return {
            user: this.sanitizeUser(user),
            organization: user.orgId,
        };
    }

    /**
     * Remove sensitive fields from user object
     */
    sanitizeUser(user) {
        const userObj = user.toObject();

        delete userObj.password;
        delete userObj.refreshTokens;
        delete userObj.emailVerificationToken;
        delete userObj.emailVerificationExpires;
        delete userObj.passwordResetToken;
        delete userObj.passwordResetExpires;
        delete userObj.twoFactorSecret;
        delete userObj.twoFactorBackupCodes;

        return userObj;
    }
}

module.exports = new AuthService();
