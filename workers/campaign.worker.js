/**
 * Campaign Worker
 * 
 * Processes campaign send jobs - fetches recipients and
 * queues individual email jobs for each contact.
 */

const { campaignQueue, emailQueue } = require('../queues');
const Campaign = require('../models/Campaign.model');
const Contact = require('../models/Contact.model');
const Template = require('../models/Template.model');
const Segment = require('../models/Segment.model');
const EmailLog = require('../models/EmailLog.model');

// Process one campaign at a time per worker
const CONCURRENCY = 1;

// Batch size for queuing emails
const BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE) || 100;

/**
 * Process campaign send jobs
 */
campaignQueue.process(CONCURRENCY, async (job) => {
    const { campaignId, orgId } = job.data;

    console.log(`🚀 Processing campaign ${campaignId}`);

    try {
        // Get campaign with template
        const campaign = await Campaign.findById(campaignId)
            .populate('email.templateId');

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Verify campaign is in correct state
        if (!['queued', 'sending'].includes(campaign.status)) {
            console.log(`Campaign ${campaignId} is not in sendable state: ${campaign.status}`);
            return { skipped: true, reason: 'Invalid status' };
        }

        // Update status to sending
        if (campaign.status !== 'sending') {
            campaign.status = 'sending';
            campaign.startedAt = new Date();
            await campaign.save();
        }

        // Get template content
        let htmlContent = campaign.email.htmlContent;
        let textContent = campaign.email.textContent;
        let subject = campaign.email.subject;

        if (campaign.email.templateId) {
            const template = await Template.findById(campaign.email.templateId);
            if (template) {
                htmlContent = htmlContent || template.htmlContent;
                textContent = textContent || template.textContent;
                subject = subject || template.subject;
            }
        }

        // Build recipient query
        const recipientQuery = await buildRecipientQuery(campaign);

        // Get total recipient count
        const totalRecipients = await Contact.countDocuments(recipientQuery);

        campaign.recipients.estimatedTotal = totalRecipients;
        campaign.progress.total = totalRecipients;
        await campaign.save();

        console.log(`📊 Campaign ${campaignId} has ${totalRecipients} recipients`);

        if (totalRecipients === 0) {
            campaign.status = 'sent';
            campaign.completedAt = new Date();
            await campaign.save();
            return { success: true, sent: 0 };
        }

        // Process recipients in batches using cursor
        let processed = 0;
        let queued = 0;

        const cursor = Contact.find(recipientQuery)
            .select('_id email firstName lastName customFields')
            .cursor();

        let batch = [];

        for await (const contact of cursor) {
            // Check if campaign was paused/cancelled
            const freshCampaign = await Campaign.findById(campaignId).select('status');
            if (['paused', 'cancelled'].includes(freshCampaign?.status)) {
                console.log(`Campaign ${campaignId} was ${freshCampaign.status}, stopping`);
                break;
            }

            // Check if already sent to this contact
            const alreadySent = await EmailLog.exists({
                campaignId,
                contactId: contact._id,
            });

            if (alreadySent) {
                processed++;
                continue;
            }

            // Render email for this contact
            const rendered = renderEmail(subject, htmlContent, textContent, contact, campaign);

            // Generate tracking ID
            const trackingId = EmailLog.generateTrackingId();

            // Add to batch
            batch.push({
                name: 'send-email',
                data: {
                    orgId,
                    campaignId,
                    contactId: contact._id,
                    email: contact.email,
                    subject: rendered.subject,
                    html: rendered.html,
                    text: rendered.text,
                    from: campaign.email.fromEmail || process.env.EMAIL_FROM_ADDRESS,
                    fromName: campaign.email.fromName || process.env.EMAIL_FROM_NAME,
                    replyTo: campaign.email.replyTo,
                    trackingId,
                    variant: null, // For A/B testing
                },
                opts: {
                    priority: 1,
                    attempts: 5,
                },
            });

            queued++;
            processed++;

            // Queue batch when full
            if (batch.length >= BATCH_SIZE) {
                await emailQueue.addBulk(batch);
                batch = [];

                // Update progress
                const percentage = Math.round((processed / totalRecipients) * 100);
                await Campaign.updateOne(
                    { _id: campaignId },
                    {
                        'progress.percentage': percentage,
                        'progress.processed': processed,
                    }
                );

                // Report progress
                job.progress(percentage);

                console.log(`📤 Campaign ${campaignId}: ${processed}/${totalRecipients} (${percentage}%)`);
            }
        }

        // Queue remaining batch
        if (batch.length > 0) {
            await emailQueue.addBulk(batch);
        }

        // Update campaign status
        campaign.status = 'sent';
        campaign.completedAt = new Date();
        campaign.progress.percentage = 100;
        await campaign.save();

        console.log(`✅ Campaign ${campaignId} completed: ${queued} emails queued`);

        return {
            success: true,
            queued,
            total: totalRecipients,
        };

    } catch (error) {
        console.error(`❌ Campaign ${campaignId} failed:`, error.message);

        // Update campaign with error
        await Campaign.updateOne(
            { _id: campaignId },
            {
                status: 'failed',
                $push: {
                    errors: {
                        type: 'PROCESSING_ERROR',
                        message: error.message,
                        count: 1,
                    },
                },
            }
        );

        throw error;
    }
});

/**
 * Build MongoDB query for campaign recipients
 */
async function buildRecipientQuery(campaign) {
    const query = {
        orgId: campaign.orgId,
        status: 'subscribed',
    };

    const conditions = [];

    // Add list conditions
    if (campaign.recipients.lists?.length > 0) {
        conditions.push({
            'lists': {
                $elemMatch: {
                    listId: { $in: campaign.recipients.lists },
                    status: 'active',
                },
            },
        });
    }

    // Add segment conditions
    if (campaign.recipients.segments?.length > 0) {
        for (const segmentId of campaign.recipients.segments) {
            const segment = await Segment.findById(segmentId);
            if (segment) {
                const segmentQuery = segment.buildQuery();
                conditions.push(segmentQuery);
            }
        }
    }

    if (conditions.length > 0) {
        query.$or = conditions;
    }

    // Add exclusions
    if (campaign.recipients.excludeLists?.length > 0) {
        query['lists.listId'] = {
            ...query['lists.listId'],
            $nin: campaign.recipients.excludeLists,
        };
    }

    return query;
}

/**
 * Render email content with contact data
 */
function renderEmail(subject, html, text, contact, campaign) {
    const data = {
        contact: {
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            email: contact.email,
            ...Object.fromEntries(contact.customFields || new Map()),
        },
        campaign: {
            name: campaign.name,
        },
        unsubscribe_link: `${process.env.APP_URL}/unsubscribe?c=${contact._id}`,
        view_in_browser_link: `${process.env.APP_URL}/view/${campaign._id}?c=${contact._id}`,
        current_year: new Date().getFullYear().toString(),
    };

    // Simple variable replacement
    const render = (template) => {
        if (!template) return '';
        return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = path.trim().split('.').reduce((obj, key) => obj?.[key], data);
            return value !== undefined ? value : match;
        });
    };

    return {
        subject: render(subject),
        html: render(html),
        text: render(text),
    };
}

/**
 * Event Handlers
 */

campaignQueue.on('completed', (job, result) => {
    console.log(`📬 Campaign job ${job.id} completed:`, result);
});

campaignQueue.on('failed', (job, err) => {
    console.error(`💥 Campaign job ${job.id} failed:`, err.message);
});

campaignQueue.on('stalled', (job) => {
    console.warn(`⚠️ Campaign job ${job.id} stalled`);
});

console.log(`🚀 Campaign worker started`);

module.exports = campaignQueue;
