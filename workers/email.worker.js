/**
 * Email Worker
 * 
 * Processes individual email send jobs from the queue.
 * Handles retries, error categorization, and logging.
 */

const { emailQueue } = require('../queues');
const emailProvider = require('../providers/email.provider');
const EmailLog = require('../models/EmailLog.model');
const Contact = require('../models/Contact.model');
const Campaign = require('../models/Campaign.model');

// Worker concurrency - adjust based on server capacity
const CONCURRENCY = parseInt(process.env.EMAIL_WORKER_CONCURRENCY) || 10;

/**
 * Process email send jobs
 */
emailQueue.process(CONCURRENCY, async (job) => {
    const {
        orgId,
        campaignId,
        contactId,
        email,
        subject,
        html,
        text,
        from,
        fromName,
        replyTo,
        trackingId,
        variant,
    } = job.data;

    console.log(`📧 Processing email job ${job.id} to ${email}`);

    try {
        // Create or get email log
        let emailLog = await EmailLog.findOne({ trackingId });

        if (!emailLog) {
            emailLog = await EmailLog.create({
                orgId,
                campaignId,
                contactId,
                email,
                trackingId,
                type: campaignId ? 'campaign' : 'transactional',
                variant,
                status: 'queued',
            });
        }

        // Record processing event
        await emailLog.recordEvent('processing', { jobId: job.id });

        // Send the email
        const result = await emailProvider.send({
            to: email,
            from: from || process.env.EMAIL_FROM_ADDRESS,
            fromName: fromName || process.env.EMAIL_FROM_NAME,
            subject,
            html,
            text,
            replyTo,
            trackingId,
        });

        if (result.success) {
            // Mark as sent
            await emailLog.markSent(result.messageId);

            // Update campaign analytics
            if (campaignId) {
                await Campaign.updateOne(
                    { _id: campaignId },
                    {
                        $inc: {
                            'analytics.sent': 1,
                            'progress.processed': 1,
                        },
                    }
                );
            }

            console.log(`✅ Email sent to ${email} (${result.messageId})`);

            return {
                success: true,
                messageId: result.messageId,
                email,
            };
        } else {
            // Handle send failure
            throw new Error(result.error);
        }
    } catch (error) {
        console.error(`❌ Failed to send email to ${email}:`, error.message);

        // Categorize error to determine if we should retry
        const errorInfo = emailProvider.categorizeError(error);

        // Update email log with error
        const emailLog = await EmailLog.findOne({ trackingId });
        if (emailLog) {
            await emailLog.recordEvent('failed', {
                error: error.message,
                errorCode: errorInfo.code,
                attempt: job.attemptsMade + 1,
            });
        }

        // If not retryable, mark as permanently failed
        if (!errorInfo.retryable) {
            if (emailLog) {
                emailLog.status = 'failed';
                emailLog.error = {
                    message: error.message,
                    code: errorInfo.code,
                    permanent: true,
                };
                await emailLog.save();
            }

            // Update campaign failed count
            if (campaignId) {
                await Campaign.updateOne(
                    { _id: campaignId },
                    {
                        $inc: { 'progress.failed': 1 },
                        $push: {
                            errors: {
                                type: errorInfo.code,
                                message: error.message,
                                count: 1,
                            },
                        },
                    }
                );
            }

            // Don't retry - mark job as complete but failed
            return {
                success: false,
                error: error.message,
                permanent: true,
            };
        }

        // Throw to trigger retry
        throw error;
    }
});

/**
 * Event Handlers
 */

// Job completed successfully
emailQueue.on('completed', (job, result) => {
    console.log(`📬 Job ${job.id} completed:`, result.email);
});

// Job failed after all retries
emailQueue.on('failed', async (job, err) => {
    console.error(`💥 Job ${job.id} failed permanently:`, err.message);

    const { trackingId, campaignId, email } = job.data;

    // Update email log
    const emailLog = await EmailLog.findOne({ trackingId });
    if (emailLog && emailLog.status !== 'failed') {
        emailLog.status = 'failed';
        emailLog.error = {
            message: err.message,
            permanent: true,
            attempts: job.attemptsMade,
        };
        await emailLog.save();
    }

    // Update campaign
    if (campaignId) {
        await Campaign.updateOne(
            { _id: campaignId },
            {
                $inc: { 'progress.failed': 1 },
            }
        );
    }
});

// Job stalled (worker crashed)
emailQueue.on('stalled', (job) => {
    console.warn(`⚠️ Job ${job.id} stalled, will be retried`);
});

// Queue error
emailQueue.on('error', (error) => {
    console.error('❌ Email queue error:', error);
});

console.log(`📧 Email worker started with concurrency: ${CONCURRENCY}`);

module.exports = emailQueue;
