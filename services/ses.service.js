/**
 * SES Service
 * 
 * High-level service for email operations with AWS SES,
 * including suppression list checking and logging.
 */

const sesProvider = require('../providers/ses.provider');
const SESLog = require('../models/SESLog.model');
const EmailLog = require('../models/EmailLog.model');
const Contact = require('../models/Contact.model');

class SESService {
    /**
     * Send email with pre-send checks
     */
    async sendEmail(options) {
        const { orgId, to, subject, html, text, from, fromName, replyTo, trackingId, campaignId, contactId } = options;

        // Check suppression list
        const isSuppressed = await SESLog.isEmailSuppressed(to);
        if (isSuppressed) {
            console.log(`⛔ Email ${to} is suppressed, skipping`);

            // Log the skip
            await EmailLog.create({
                orgId,
                campaignId,
                contactId,
                email: to,
                trackingId,
                status: 'dropped',
                error: {
                    message: 'Email is on suppression list',
                    code: 'SUPPRESSED',
                    permanent: true,
                },
            });

            return {
                success: false,
                error: 'Email is suppressed',
                errorCode: 'SUPPRESSED',
                retryable: false,
            };
        }

        // Check contact status
        if (contactId) {
            const contact = await Contact.findById(contactId).select('status');
            if (contact && !['subscribed', 'pending'].includes(contact.status)) {
                console.log(`⛔ Contact ${to} status is ${contact.status}, skipping`);

                return {
                    success: false,
                    error: `Contact status is ${contact.status}`,
                    errorCode: 'INVALID_STATUS',
                    retryable: false,
                };
            }
        }

        // Send via SES
        const result = await sesProvider.send({
            to,
            from,
            fromName,
            subject,
            html,
            text,
            replyTo,
            trackingId,
            tags: {
                OrgId: orgId?.toString() || 'none',
                CampaignId: campaignId?.toString() || 'none',
            },
        });

        // Update email log with result
        if (trackingId) {
            await EmailLog.updateOne(
                { trackingId },
                {
                    messageId: result.messageId,
                    status: result.success ? 'sent' : 'failed',
                    'delivery.provider': 'ses',
                    ...(result.success && { 'delivery.sentAt': new Date() }),
                    ...(!result.success && {
                        error: {
                            message: result.error,
                            code: result.errorCode,
                            permanent: !result.retryable,
                        },
                    }),
                }
            );
        }

        return result;
    }

    /**
     * Send transactional email (verification, password reset, etc.)
     */
    async sendTransactional(options) {
        const { to, subject, html, text, type, metadata = {} } = options;

        const trackingId = EmailLog.generateTrackingId();

        // Create email log
        await EmailLog.create({
            email: to,
            trackingId,
            type: 'transactional',
            status: 'queued',
            metadata: {
                transactionalType: type,
                ...metadata,
            },
        });

        // Send email
        const result = await sesProvider.send({
            to,
            subject,
            html,
            text,
            trackingId,
            tags: {
                Type: 'transactional',
                TransactionalType: type,
            },
        });

        // Update log
        await EmailLog.updateOne(
            { trackingId },
            {
                messageId: result.messageId,
                status: result.success ? 'sent' : 'failed',
                ...(result.success && { 'delivery.sentAt': new Date() }),
                ...(!result.success && {
                    error: {
                        message: result.error,
                        code: result.errorCode,
                    },
                }),
            }
        );

        return result;
    }

    /**
     * Get suppression list for organization
     */
    async getSuppressionList(orgId) {
        return SESLog.getSuppressionList(orgId);
    }

    /**
     * Check if email is suppressed
     */
    async isEmailSuppressed(email) {
        return SESLog.isEmailSuppressed(email);
    }

    /**
     * Get SES statistics
     */
    async getStats(orgId, days = 30) {
        const [sesStats, logStats] = await Promise.all([
            sesProvider.getSendStatistics(),
            SESLog.getStatsForOrg(orgId, days),
        ]);

        return {
            ses: sesStats,
            events: logStats,
        };
    }

    /**
     * Get bounce/complaint trend
     */
    async getTrend(orgId, days = 14) {
        return SESLog.getDailyTrend(orgId, days);
    }

    /**
     * Verify SES configuration
     */
    async verifyConfiguration() {
        return sesProvider.verifyConfiguration();
    }

    /**
     * Clean suppression list (remove old entries)
     */
    async cleanSuppressionList(daysOld = 180) {
        const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

        // Only remove soft bounces older than cutoff
        const result = await SESLog.deleteMany({
            type: 'bounce',
            'details.bounceType': 'Transient',
            timestamp: { $lt: cutoff },
        });

        return {
            removed: result.deletedCount,
            message: `Removed ${result.deletedCount} old soft bounce records`,
        };
    }
}

module.exports = new SESService();
