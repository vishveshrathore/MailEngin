/**
 * Analytics Worker
 * 
 * Processes email events (opens, clicks, bounces) from webhooks.
 */

const { analyticsQueue } = require('../queues');
const EmailLog = require('../models/EmailLog.model');
const Contact = require('../models/Contact.model');
const Campaign = require('../models/Campaign.model');

const CONCURRENCY = parseInt(process.env.ANALYTICS_WORKER_CONCURRENCY) || 20;

/**
 * Process analytics events
 */
analyticsQueue.process(CONCURRENCY, async (job) => {
    const { type, data } = job.data;

    console.log(`📊 Processing ${type} event`);

    try {
        switch (type) {
            case 'open':
                return await processOpen(data);
            case 'click':
                return await processClick(data);
            case 'bounce':
                return await processBounce(data);
            case 'complaint':
                return await processComplaint(data);
            case 'delivery':
                return await processDelivery(data);
            case 'unsubscribe':
                return await processUnsubscribe(data);
            default:
                console.warn(`Unknown event type: ${type}`);
                return { skipped: true };
        }
    } catch (error) {
        console.error(`❌ Failed to process ${type} event:`, error.message);
        throw error;
    }
});

/**
 * Process email open event
 */
async function processOpen(data) {
    const { trackingId, messageId, timestamp, metadata } = data;

    const emailLog = await EmailLog.findOne({
        $or: [
            { trackingId },
            { messageId },
        ],
    });

    if (!emailLog) {
        console.warn(`Email log not found for tracking: ${trackingId}`);
        return { found: false };
    }

    // Record open
    await emailLog.recordOpen(metadata);

    // Update campaign analytics (only for first open)
    if (!emailLog.engagement.opened && emailLog.campaignId) {
        await Campaign.updateOne(
            { _id: emailLog.campaignId },
            {
                $inc: {
                    'analytics.opens': 1,
                    'analytics.uniqueOpens': 1,
                },
            }
        );
    } else if (emailLog.campaignId) {
        // Subsequent opens
        await Campaign.updateOne(
            { _id: emailLog.campaignId },
            { $inc: { 'analytics.opens': 1 } }
        );
    }

    // Update contact engagement
    if (emailLog.contactId) {
        await Contact.updateOne(
            { _id: emailLog.contactId },
            {
                $inc: { 'engagement.emailsOpened': 1 },
                'engagement.lastOpenedAt': new Date(),
            }
        );
    }

    return { success: true, type: 'open' };
}

/**
 * Process click event
 */
async function processClick(data) {
    const { trackingId, messageId, url, timestamp, metadata } = data;

    const emailLog = await EmailLog.findOne({
        $or: [
            { trackingId },
            { messageId },
        ],
    });

    if (!emailLog) {
        return { found: false };
    }

    // Record click
    await emailLog.recordClick(url, metadata);

    // Update campaign analytics
    if (emailLog.campaignId) {
        const isFirstClick = !emailLog.engagement.clicked;

        await Campaign.updateOne(
            { _id: emailLog.campaignId },
            {
                $inc: {
                    'analytics.clicks': 1,
                    ...(isFirstClick && { 'analytics.uniqueClicks': 1 }),
                },
            }
        );

        // Update link-specific clicks
        await Campaign.updateOne(
            { _id: emailLog.campaignId, 'analytics.linkClicks.url': url },
            { $inc: { 'analytics.linkClicks.$.clicks': 1 } }
        );

        // Add new link if not exists
        await Campaign.updateOne(
            { _id: emailLog.campaignId, 'analytics.linkClicks.url': { $ne: url } },
            {
                $push: {
                    'analytics.linkClicks': {
                        url,
                        clicks: 1,
                        uniqueClicks: isFirstClick ? 1 : 0,
                    },
                },
            }
        );
    }

    // Update contact engagement
    if (emailLog.contactId) {
        await Contact.updateOne(
            { _id: emailLog.contactId },
            {
                $inc: { 'engagement.emailsClicked': 1 },
                'engagement.lastClickedAt': new Date(),
            }
        );
    }

    return { success: true, type: 'click', url };
}

/**
 * Process bounce event
 */
async function processBounce(data) {
    const { messageId, bounceType, bounceSubType, email, timestamp } = data;

    const emailLog = await EmailLog.findOne({ messageId });

    if (emailLog) {
        await emailLog.recordBounce(bounceType, bounceSubType);

        // Update campaign analytics
        if (emailLog.campaignId) {
            await Campaign.updateOne(
                { _id: emailLog.campaignId },
                {
                    $inc: {
                        'analytics.bounced': 1,
                        ...(bounceType === 'hard' && { 'analytics.hardBounced': 1 }),
                        ...(bounceType === 'soft' && { 'analytics.softBounced': 1 }),
                    },
                }
            );
        }

        // Update contact status for hard bounces
        if (emailLog.contactId && bounceType === 'hard') {
            await Contact.updateOne(
                { _id: emailLog.contactId },
                {
                    status: 'bounced',
                    statusReason: `Hard bounce: ${bounceSubType}`,
                    statusChangedAt: new Date(),
                    'deliverability.bounceCount': { $inc: 1 },
                    'deliverability.lastBounceAt': new Date(),
                    'deliverability.lastBounceType': bounceType,
                }
            );
        }
    }

    return { success: true, type: 'bounce', bounceType };
}

/**
 * Process complaint event (spam report)
 */
async function processComplaint(data) {
    const { messageId, email, timestamp } = data;

    const emailLog = await EmailLog.findOne({ messageId });

    if (emailLog) {
        emailLog.status = 'complained';
        await emailLog.recordEvent('complained', { timestamp });
        await emailLog.save();

        // Update campaign
        if (emailLog.campaignId) {
            await Campaign.updateOne(
                { _id: emailLog.campaignId },
                { $inc: { 'analytics.complained': 1 } }
            );
        }

        // Unsubscribe contact immediately
        if (emailLog.contactId) {
            await Contact.updateOne(
                { _id: emailLog.contactId },
                {
                    status: 'complained',
                    statusReason: 'Spam complaint',
                    statusChangedAt: new Date(),
                    'deliverability.complaintCount': { $inc: 1 },
                }
            );
        }
    }

    return { success: true, type: 'complaint' };
}

/**
 * Process delivery confirmation
 */
async function processDelivery(data) {
    const { messageId, timestamp } = data;

    const emailLog = await EmailLog.findOne({ messageId });

    if (emailLog && emailLog.status === 'sent') {
        emailLog.status = 'delivered';
        emailLog.delivery.deliveredAt = new Date(timestamp);
        await emailLog.recordEvent('delivered', { timestamp });
        await emailLog.save();

        // Update campaign
        if (emailLog.campaignId) {
            await Campaign.updateOne(
                { _id: emailLog.campaignId },
                { $inc: { 'analytics.delivered': 1 } }
            );
        }
    }

    return { success: true, type: 'delivery' };
}

/**
 * Process unsubscribe event
 */
async function processUnsubscribe(data) {
    const { contactId, campaignId, reason } = data;

    if (contactId) {
        await Contact.updateOne(
            { _id: contactId },
            {
                status: 'unsubscribed',
                statusReason: reason || 'Unsubscribed via link',
                statusChangedAt: new Date(),
                'unsubscribe.unsubscribedAt': new Date(),
                'unsubscribe.reason': reason,
                'unsubscribe.campaignId': campaignId,
            }
        );

        // Update campaign
        if (campaignId) {
            await Campaign.updateOne(
                { _id: campaignId },
                { $inc: { 'analytics.unsubscribed': 1 } }
            );
        }
    }

    return { success: true, type: 'unsubscribe' };
}

/**
 * Event Handlers
 */
analyticsQueue.on('completed', (job) => {
    // Silent completion
});

analyticsQueue.on('failed', (job, err) => {
    console.error(`💥 Analytics job ${job.id} failed:`, err.message);
});

console.log(`📊 Analytics worker started with concurrency: ${CONCURRENCY}`);

module.exports = analyticsQueue;
