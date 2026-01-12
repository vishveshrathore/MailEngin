/**
 * Webhook Controller
 * 
 * Handles incoming webhooks from AWS SNS for SES notifications
 * (bounces, complaints, deliveries).
 */

const crypto = require('crypto');
const https = require('https');
const { analyticsQueue } = require('../queues');
const EmailLog = require('../models/EmailLog.model');

class WebhookController {
    /**
     * POST /api/webhooks/ses
     * Handle AWS SES notifications via SNS
     */
    async handleSESWebhook(req, res, next) {
        try {
            const messageType = req.headers['x-amz-sns-message-type'];
            const body = req.body;

            console.log(`📩 Received SNS message type: ${messageType}`);

            // Handle subscription confirmation
            if (messageType === 'SubscriptionConfirmation') {
                await this.confirmSubscription(body);
                return res.status(200).send('Subscription confirmed');
            }

            // Handle notifications
            if (messageType === 'Notification') {
                // Verify SNS signature (optional but recommended)
                const isValid = await this.verifySNSSignature(body);
                if (!isValid) {
                    console.warn('⚠️ Invalid SNS signature');
                    return res.status(403).json({ error: 'Invalid signature' });
                }

                // Parse the SES notification
                const message = JSON.parse(body.Message);
                await this.processSESNotification(message);

                return res.status(200).send('OK');
            }

            // Handle unsubscribe confirmation
            if (messageType === 'UnsubscribeConfirmation') {
                console.log('📤 Unsubscribe confirmation received');
                return res.status(200).send('OK');
            }

            res.status(400).json({ error: 'Unknown message type' });
        } catch (error) {
            console.error('❌ Webhook error:', error);
            next(error);
        }
    }

    /**
     * Confirm SNS subscription
     */
    async confirmSubscription(body) {
        const subscribeUrl = body.SubscribeURL;

        console.log('📝 Confirming SNS subscription...');

        return new Promise((resolve, reject) => {
            https.get(subscribeUrl, (response) => {
                if (response.statusCode === 200) {
                    console.log('✅ SNS subscription confirmed');
                    resolve();
                } else {
                    reject(new Error(`Failed to confirm subscription: ${response.statusCode}`));
                }
            }).on('error', reject);
        });
    }

    /**
     * Verify SNS message signature
     */
    async verifySNSSignature(body) {
        // Skip verification in development
        if (process.env.NODE_ENV === 'development' && process.env.SKIP_SNS_VERIFICATION === 'true') {
            return true;
        }

        try {
            const signatureVersion = body.SignatureVersion;

            if (signatureVersion !== '1') {
                console.warn('Unsupported signature version:', signatureVersion);
                return false;
            }

            // Build the string to sign
            const fieldsToSign = body.Type === 'Notification'
                ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
                : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

            let stringToSign = '';
            for (const field of fieldsToSign) {
                if (body[field]) {
                    stringToSign += `${field}\n${body[field]}\n`;
                }
            }

            // Get the certificate
            const certUrl = body.SigningCertURL;
            const cert = await this.fetchCertificate(certUrl);

            // Verify signature
            const verify = crypto.createVerify('SHA1');
            verify.update(stringToSign);

            return verify.verify(cert, body.Signature, 'base64');
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }

    /**
     * Fetch signing certificate from AWS
     */
    fetchCertificate(url) {
        return new Promise((resolve, reject) => {
            // Validate URL is from AWS
            const urlObj = new URL(url);
            if (!urlObj.hostname.endsWith('.amazonaws.com')) {
                return reject(new Error('Invalid certificate URL'));
            }

            https.get(url, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    /**
     * Process SES notification (bounce, complaint, delivery)
     */
    async processSESNotification(message) {
        const notificationType = message.notificationType || message.eventType;

        console.log(`📧 Processing SES ${notificationType} notification`);

        switch (notificationType) {
            case 'Bounce':
                await this.handleBounce(message);
                break;
            case 'Complaint':
                await this.handleComplaint(message);
                break;
            case 'Delivery':
                await this.handleDelivery(message);
                break;
            case 'Send':
                await this.handleSend(message);
                break;
            case 'Reject':
                await this.handleReject(message);
                break;
            case 'Open':
                await this.handleOpen(message);
                break;
            case 'Click':
                await this.handleClick(message);
                break;
            default:
                console.log(`Unknown notification type: ${notificationType}`);
        }
    }

    /**
     * Handle bounce notification
     */
    async handleBounce(message) {
        const bounce = message.bounce;
        const mail = message.mail;

        console.log(`🔴 Bounce received: ${bounce.bounceType} - ${bounce.bounceSubType}`);

        for (const recipient of bounce.bouncedRecipients) {
            // Queue for processing
            await analyticsQueue.add('process-event', {
                type: 'bounce',
                data: {
                    messageId: mail.messageId,
                    email: recipient.emailAddress,
                    bounceType: bounce.bounceType.toLowerCase(),
                    bounceSubType: bounce.bounceSubType,
                    diagnosticCode: recipient.diagnosticCode,
                    timestamp: bounce.timestamp,
                    feedbackId: bounce.feedbackId,
                },
            });

            // Log to database immediately for critical bounces
            if (bounce.bounceType === 'Permanent') {
                await this.logBounce({
                    messageId: mail.messageId,
                    email: recipient.emailAddress,
                    bounceType: bounce.bounceType,
                    bounceSubType: bounce.bounceSubType,
                    diagnosticCode: recipient.diagnosticCode,
                    timestamp: bounce.timestamp,
                });
            }
        }
    }

    /**
     * Handle complaint notification
     */
    async handleComplaint(message) {
        const complaint = message.complaint;
        const mail = message.mail;

        console.log(`🟠 Complaint received: ${complaint.complaintFeedbackType}`);

        for (const recipient of complaint.complainedRecipients) {
            // Queue for processing
            await analyticsQueue.add('process-event', {
                type: 'complaint',
                data: {
                    messageId: mail.messageId,
                    email: recipient.emailAddress,
                    complaintType: complaint.complaintFeedbackType,
                    timestamp: complaint.timestamp,
                    feedbackId: complaint.feedbackId,
                },
            });

            // Log complaint immediately
            await this.logComplaint({
                messageId: mail.messageId,
                email: recipient.emailAddress,
                complaintType: complaint.complaintFeedbackType,
                timestamp: complaint.timestamp,
            });
        }
    }

    /**
     * Handle delivery notification
     */
    async handleDelivery(message) {
        const delivery = message.delivery;
        const mail = message.mail;

        console.log(`🟢 Delivery confirmed to ${delivery.recipients.length} recipients`);

        // Queue for processing
        await analyticsQueue.add('process-event', {
            type: 'delivery',
            data: {
                messageId: mail.messageId,
                recipients: delivery.recipients,
                timestamp: delivery.timestamp,
                processingTimeMillis: delivery.processingTimeMillis,
                smtpResponse: delivery.smtpResponse,
            },
        });
    }

    /**
     * Handle send notification
     */
    async handleSend(message) {
        const mail = message.mail;

        console.log(`📤 Send confirmed for ${mail.messageId}`);

        // Update email log
        await EmailLog.updateOne(
            { messageId: mail.messageId },
            {
                status: 'sent',
                'delivery.sentAt': new Date(mail.timestamp),
            }
        );
    }

    /**
     * Handle reject notification
     */
    async handleReject(message) {
        const mail = message.mail;
        const reject = message.reject;

        console.log(`🔴 Reject: ${reject.reason}`);

        await EmailLog.updateOne(
            { messageId: mail.messageId },
            {
                status: 'rejected',
                error: {
                    message: reject.reason,
                    code: 'REJECTED',
                    permanent: true,
                },
            }
        );
    }

    /**
     * Handle open notification (if SES event publishing is configured)
     */
    async handleOpen(message) {
        const mail = message.mail;
        const open = message.open;

        // Queue for processing
        await analyticsQueue.add('process-event', {
            type: 'open',
            data: {
                messageId: mail.messageId,
                timestamp: open.timestamp,
                userAgent: open.userAgent,
                ipAddress: open.ipAddress,
            },
        });
    }

    /**
     * Handle click notification (if SES event publishing is configured)
     */
    async handleClick(message) {
        const mail = message.mail;
        const click = message.click;

        // Queue for processing
        await analyticsQueue.add('process-event', {
            type: 'click',
            data: {
                messageId: mail.messageId,
                url: click.link,
                timestamp: click.timestamp,
                userAgent: click.userAgent,
                ipAddress: click.ipAddress,
            },
        });
    }

    /**
     * Log bounce to database
     */
    async logBounce(data) {
        const SESLog = require('../models/SESLog.model');

        await SESLog.create({
            type: 'bounce',
            messageId: data.messageId,
            email: data.email,
            details: {
                bounceType: data.bounceType,
                bounceSubType: data.bounceSubType,
                diagnosticCode: data.diagnosticCode,
            },
            timestamp: new Date(data.timestamp),
        });

        // Update email log
        await EmailLog.updateOne(
            { messageId: data.messageId },
            {
                status: 'bounced',
                'delivery.bouncedAt': new Date(data.timestamp),
                'delivery.bounceType': data.bounceType.toLowerCase(),
                'delivery.bounceReason': data.diagnosticCode,
            }
        );
    }

    /**
     * Log complaint to database
     */
    async logComplaint(data) {
        const SESLog = require('../models/SESLog.model');

        await SESLog.create({
            type: 'complaint',
            messageId: data.messageId,
            email: data.email,
            details: {
                complaintType: data.complaintType,
            },
            timestamp: new Date(data.timestamp),
        });

        // Update email log
        await EmailLog.updateOne(
            { messageId: data.messageId },
            {
                status: 'complained',
            }
        );
    }
}

module.exports = new WebhookController();
