/**
 * AWS SES Provider
 * 
 * Email sending service using AWS SES with full tracking,
 * bounce handling, and complaint handling support.
 */

const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const awsConfig = require('../config/aws.config');
const EmailLog = require('../models/EmailLog.model');

class SESProvider {
    constructor() {
        this.client = new SESClient({
            region: awsConfig.region,
            credentials: awsConfig.credentials,
        });

        this.configurationSet = awsConfig.ses.configurationSet;
        this.defaultFrom = awsConfig.ses.defaultFromEmail;
        this.defaultFromName = awsConfig.ses.defaultFromName;
        this.sandboxMode = awsConfig.ses.sandboxMode;
    }

    /**
     * Send a single email via SES
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
            trackingId,
            tags = {},
        } = options;

        const fromAddress = from || this.defaultFrom;
        const senderName = fromName || this.defaultFromName;

        // Build email parameters
        const params = {
            Source: senderName ? `"${senderName}" <${fromAddress}>` : fromAddress,
            Destination: {
                ToAddresses: [to],
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: 'UTF-8',
                },
                Body: {
                    Html: {
                        Data: html,
                        Charset: 'UTF-8',
                    },
                    Text: {
                        Data: text || this.stripHtml(html),
                        Charset: 'UTF-8',
                    },
                },
            },
            // Configuration set for tracking bounces/complaints
            ConfigurationSetName: this.configurationSet,
            // Custom tags for tracking
            Tags: [
                { Name: 'TrackingId', Value: trackingId || 'none' },
                { Name: 'Environment', Value: process.env.NODE_ENV || 'development' },
                ...Object.entries(tags).map(([Name, Value]) => ({ Name, Value: String(Value) })),
            ],
        };

        // Add reply-to if specified
        if (replyTo) {
            params.ReplyToAddresses = [replyTo];
        }

        try {
            const command = new SendEmailCommand(params);
            const response = await this.client.send(command);

            console.log(`✅ SES email sent to ${to}: ${response.MessageId}`);

            return {
                success: true,
                messageId: response.MessageId,
                provider: 'ses',
            };
        } catch (error) {
            console.error(`❌ SES send failed to ${to}:`, error.message);

            // Categorize error
            const errorInfo = this.categorizeError(error);

            return {
                success: false,
                error: error.message,
                errorCode: errorInfo.code,
                errorType: errorInfo.type,
                retryable: errorInfo.retryable,
                provider: 'ses',
            };
        }
    }

    /**
     * Send email with attachments (raw email)
     */
    async sendRaw(options) {
        const {
            to,
            from,
            fromName,
            subject,
            html,
            text,
            replyTo,
            attachments = [],
            trackingId,
        } = options;

        const fromAddress = from || this.defaultFrom;
        const senderName = fromName || this.defaultFromName;

        // Build MIME message
        const boundary = `----=_Part_${Date.now()}`;
        const mimeMessage = this.buildMimeMessage({
            from: senderName ? `"${senderName}" <${fromAddress}>` : fromAddress,
            to,
            subject,
            html,
            text,
            replyTo,
            attachments,
            boundary,
        });

        const params = {
            RawMessage: {
                Data: Buffer.from(mimeMessage),
            },
            ConfigurationSetName: this.configurationSet,
            Tags: [
                { Name: 'TrackingId', Value: trackingId || 'none' },
            ],
        };

        try {
            const command = new SendRawEmailCommand(params);
            const response = await this.client.send(command);

            return {
                success: true,
                messageId: response.MessageId,
                provider: 'ses',
            };
        } catch (error) {
            const errorInfo = this.categorizeError(error);
            return {
                success: false,
                error: error.message,
                errorCode: errorInfo.code,
                retryable: errorInfo.retryable,
                provider: 'ses',
            };
        }
    }

    /**
     * Build MIME message for raw email with attachments
     */
    buildMimeMessage(options) {
        const { from, to, subject, html, text, replyTo, attachments, boundary } = options;

        let message = '';

        // Headers
        message += `From: ${from}\r\n`;
        message += `To: ${to}\r\n`;
        message += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
        if (replyTo) {
            message += `Reply-To: ${replyTo}\r\n`;
        }
        message += `MIME-Version: 1.0\r\n`;
        message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

        // Text part
        if (text) {
            message += `--${boundary}\r\n`;
            message += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
            message += `${text}\r\n\r\n`;
        }

        // HTML part
        if (html) {
            message += `--${boundary}\r\n`;
            message += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
            message += `${html}\r\n\r\n`;
        }

        // Attachments
        for (const attachment of attachments) {
            message += `--${boundary}\r\n`;
            message += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n`;
            message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
            message += `Content-Transfer-Encoding: base64\r\n\r\n`;
            message += `${attachment.content.toString('base64')}\r\n\r\n`;
        }

        message += `--${boundary}--`;

        return message;
    }

    /**
     * Categorize SES errors for retry logic
     */
    categorizeError(error) {
        const code = error.name || error.code || '';
        const message = error.message.toLowerCase();

        // Throttling - should retry with backoff
        if (code === 'Throttling' || message.includes('rate exceeded') || message.includes('throttl')) {
            return {
                code: 'THROTTLED',
                type: 'temporary',
                retryable: true,
            };
        }

        // Service unavailable - should retry
        if (code === 'ServiceUnavailable' || message.includes('service') && message.includes('unavailable')) {
            return {
                code: 'SERVICE_UNAVAILABLE',
                type: 'temporary',
                retryable: true,
            };
        }

        // Network/timeout errors - should retry
        if (message.includes('timeout') || message.includes('econnrefused') || message.includes('network')) {
            return {
                code: 'NETWORK_ERROR',
                type: 'temporary',
                retryable: true,
            };
        }

        // Invalid address - permanent failure
        if (code === 'MessageRejected' && message.includes('address')) {
            return {
                code: 'INVALID_ADDRESS',
                type: 'permanent',
                retryable: false,
            };
        }

        // Blacklisted - permanent failure
        if (message.includes('blacklist') || message.includes('suppression')) {
            return {
                code: 'BLACKLISTED',
                type: 'permanent',
                retryable: false,
            };
        }

        // Quota exceeded - should retry later
        if (code === 'LimitExceeded' || message.includes('quota') || message.includes('limit')) {
            return {
                code: 'QUOTA_EXCEEDED',
                type: 'temporary',
                retryable: true,
            };
        }

        // Credentials/auth error - permanent
        if (code === 'InvalidClientTokenId' || code === 'SignatureDoesNotMatch' || message.includes('credentials')) {
            return {
                code: 'AUTH_ERROR',
                type: 'permanent',
                retryable: false,
            };
        }

        // Configuration set not found - permanent
        if (message.includes('configuration set')) {
            return {
                code: 'CONFIG_ERROR',
                type: 'permanent',
                retryable: false,
            };
        }

        // Default - allow limited retries
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
     * Verify SES is properly configured
     */
    async verifyConfiguration() {
        try {
            // Try to get send quota to verify credentials
            const { GetSendQuotaCommand } = require('@aws-sdk/client-ses');
            const command = new GetSendQuotaCommand({});
            const response = await this.client.send(command);

            return {
                success: true,
                quota: {
                    max24HourSend: response.Max24HourSend,
                    sentLast24Hours: response.SentLast24Hours,
                    maxSendRate: response.MaxSendRate,
                },
                sandboxMode: this.sandboxMode,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Get sending statistics
     */
    async getSendStatistics() {
        try {
            const { GetSendStatisticsCommand } = require('@aws-sdk/client-ses');
            const command = new GetSendStatisticsCommand({});
            const response = await this.client.send(command);

            return {
                success: true,
                dataPoints: response.SendDataPoints,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

module.exports = new SESProvider();
