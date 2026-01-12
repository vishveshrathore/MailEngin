/**
 * Authentication Controller
 * 
 * Handles HTTP requests for authentication endpoints.
 */

const authService = require('../services/auth.service');
const jwtConfig = require('../config/jwt.config');

class AuthController {
    /**
     * POST /api/auth/signup
     * Register a new user
     */
    async signup(req, res, next) {
        try {
            const { email, password, firstName, lastName, organizationName } = req.body;

            const result = await authService.signup({
                email,
                password,
                firstName,
                lastName,
                organizationName,
            });

            res.status(201).json({
                success: true,
                message: result.message,
                data: {
                    user: result.user,
                    organization: result.organization,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/login
     * Login user
     */
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const device = req.headers['user-agent'];
            const ip = req.ip || req.connection.remoteAddress;

            const result = await authService.login({ email, password, device, ip });

            // Set refresh token as HTTP-only cookie
            res.cookie('refreshToken', result.tokens.refreshToken, jwtConfig.cookie);

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/verify-email
     * Verify email with token
     */
    async verifyEmail(req, res, next) {
        try {
            const { token } = req.body;

            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification token is required',
                });
            }

            const result = await authService.verifyEmail(token);

            // Set refresh token as HTTP-only cookie
            res.cookie('refreshToken', result.tokens.refreshToken, jwtConfig.cookie);

            res.json({
                success: true,
                message: result.message,
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/resend-verification
     * Resend verification email
     */
    async resendVerification(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required',
                });
            }

            const result = await authService.resendVerificationEmail(email);

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/forgot-password
     * Request password reset
     */
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required',
                });
            }

            const result = await authService.forgotPassword(email);

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/reset-password
     * Reset password with token
     */
    async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Token and password are required',
                });
            }

            const result = await authService.resetPassword(token, password);

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/refresh
     * Refresh access token
     */
    async refreshToken(req, res, next) {
        try {
            // Get refresh token from cookie or body
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token is required',
                });
            }

            const result = await authService.refreshToken(refreshToken);

            res.json({
                success: true,
                data: {
                    accessToken: result.accessToken,
                },
            });
        } catch (error) {
            // Clear invalid refresh token cookie
            res.clearCookie('refreshToken');
            next(error);
        }
    }

    /**
     * POST /api/auth/logout
     * Logout user
     */
    async logout(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
            const userId = req.user?.userId;

            await authService.logout(userId, refreshToken);

            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            res.json({
                success: true,
                message: 'Logged out successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/logout-all
     * Logout from all devices
     */
    async logoutAll(req, res, next) {
        try {
            const userId = req.user.userId;

            const result = await authService.logoutAll(userId);

            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/change-password
     * Change password (authenticated)
     */
    async changePassword(req, res, next) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.userId;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password and new password are required',
                });
            }

            const result = await authService.changePassword(userId, currentPassword, newPassword);

            // Clear refresh token cookie
            res.clearCookie('refreshToken');

            res.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/auth/me
     * Get current user
     */
    async getCurrentUser(req, res, next) {
        try {
            const userId = req.user.userId;

            const result = await authService.getCurrentUser(userId);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();
