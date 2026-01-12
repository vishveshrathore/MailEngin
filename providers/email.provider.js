/**
 * Email Provider Service
 * 
 * Handles actual email delivery via AWS SES or SMTP.
 * Abstracts provider details from the rest of the application.
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailProvider {
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'smtp';
        this.transporter = null;
        this.initialize();
    }

    /**
     * Initialize the email transporter
     */
    initialize() {
        if (this.provider === 'ses') {
            // AWS SES configuration
            this.transporter = nodemailer.createTransport({
                host: `email-smtp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
                port: 587,
                secure: false,
                auth: {
                    user: process.env.AWS_SES_SMTP_USER,
                    pass: process.env.AWS_SES_SMTP_PASS,
                },
            });
        } else {
            // Standard SMTP configuration
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
                pool: true,                    // Use pooled connections
                maxConnections: 5,             // Max parallel connections
                maxMessages: 100,              // Messages per connection
                rateDelta: 1000,               // Rate limit window (1 second)
                rateLimit: 10,                 // Max messages per rateDelta
            });
        }
    }

    /**
     * Send a single email
     */
    async send(options) {
        const {
            to,
            from,
            fromName,
            subject,
            html,
            text,
            replyTo,
            headers = {},
            trackingId,
        } = options;

        // Add tracking headers
        const customHeaders = {
            ...headers,
            'X-Tracking-ID': trackingId,
            'X-Mailer': 'MailEngin',
        };

        const mailOptions = {
            from: fromName ? `"${fromName}" <${from}>` : from,
            to,
            subject,
            html,
            text: text || this.stripHtml(html),
            replyTo,
            headers: customHeaders,
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: result.messageId,
                response: result.response,
            };
        } catch (error) {
            // Categorize errors
            const errorInfo = this.categorizeError(error);

            return {
                success: false,
                error: error.message,
                errorCode: errorInfo.code,
                errorType: errorInfo.type,
                retryable: errorInfo.retryable,
            };
        }
    }

    /**
     * Send bulk emails (for batch processing)
     */
    async sendBulk(emails) {
        const results = [];

        for (const email of emails) {
            const result = await this.send(email);
            results.push({
                email: email.to,
                ...result,
            });

            // Small delay between emails to prevent rate limiting
            await this.delay(50);
        }

        return results;
    }

    /**
     * Verify email configuration
     */
    async verify() {
        try {
            await this.transporter.verify();
            return { success: true, message: 'Email configuration is valid' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Categorize email errors for proper handling
     */
    categorizeError(error) {
        const message = error.message.toLowerCase();

        // Rate limiting errors - should retry
        if (message.includes('rate') || message.includes('throttl') || message.includes('too many')) {
            return {
                code: 'RATE_LIMITED',
                type: 'temporary',
                retryable: true,
            };
        }

        // Connection errors - should retry
        if (message.includes('connect') || message.includes('timeout') || message.includes('econnrefused')) {
            return {
                code: 'CONNECTION_ERROR',
                type: 'temporary',
                retryable: true,
            };
        }

        // Authentication errors - should not retry
        if (message.includes('auth') || message.includes('credential') || message.includes('535')) {
            return {
                code: 'AUTH_ERROR',
                type: 'permanent',
                retryable: false,
            };
        }

        // Invalid recipient - should not retry
        if (message.includes('invalid') || message.includes('recipient') || message.includes('550')) {
            return {
                code: 'INVALID_RECIPIENT',
                type: 'permanent',
                retryable: false,
            };
        }

        // Bounce - should not retry
        if (message.includes('bounce') || message.includes('reject') || message.includes('blocked')) {
            return {
                code: 'BOUNCED',
                type: 'permanent',
                retryable: false,
            };
        }

        // Default - might be temporary, allow limited retries
        return {
            code: 'UNKNOWN',
            type: 'unknown',
            retryable: true,
        };
    }

    /**
     * Strip HTML tags for plain text version
     */
    stripHtml(html) {
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Close connections
     */
    close() {
        if (this.transporter) {
            this.transporter.close();
        }
    }
}

// Singleton instance
const emailProvider = new EmailProvider();

module.exports = emailProvider;
