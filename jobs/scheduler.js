/**
 * Campaign Scheduler
 * 
 * Runs on a schedule to find campaigns ready to send
 * and queue them for processing.
 */

const cron = require('node-cron');
const Campaign = require('../models/Campaign.model');
const { campaignQueue } = require('../queues');

/**
 * Check for scheduled campaigns and queue them
 */
async function checkScheduledCampaigns() {
    try {
        // Find campaigns that are scheduled and ready to send
        const campaigns = await Campaign.find({
            status: 'scheduled',
            'schedule.scheduledAt': { $lte: new Date() },
        }).select('_id orgId name');

        if (campaigns.length === 0) {
            return;
        }

        console.log(`⏰ Found ${campaigns.length} campaigns ready to send`);

        for (const campaign of campaigns) {
            // Update status to queued
            await Campaign.updateOne(
                { _id: campaign._id, status: 'scheduled' },
                { status: 'queued' }
            );

            // Add to campaign queue
            await campaignQueue.add(
                'process-campaign',
                {
                    campaignId: campaign._id.toString(),
                    orgId: campaign.orgId.toString(),
                },
                {
                    priority: 1,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 30000,
                    },
                }
            );

            console.log(`📤 Queued campaign: ${campaign.name} (${campaign._id})`);
        }
    } catch (error) {
        console.error('❌ Scheduler error:', error.message);
    }
}

/**
 * Check for stalled campaigns and handle them
 */
async function checkStalledCampaigns() {
    try {
        // Find campaigns that have been "sending" for too long
        const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours

        const stalledCampaigns = await Campaign.find({
            status: 'sending',
            startedAt: { $lt: staleThreshold },
            'progress.percentage': { $lt: 100 },
        }).select('_id name');

        for (const campaign of stalledCampaigns) {
            console.warn(`⚠️ Campaign ${campaign.name} appears stalled, re-queuing`);

            // Re-queue for processing
            await campaignQueue.add(
                'process-campaign',
                {
                    campaignId: campaign._id.toString(),
                    orgId: campaign.orgId.toString(),
                    isRetry: true,
                },
                {
                    priority: 2,
                    attempts: 2,
                }
            );
        }
    } catch (error) {
        console.error('❌ Stalled check error:', error.message);
    }
}

/**
 * Start the scheduler
 */
function startScheduler() {
    // Check for scheduled campaigns every minute
    cron.schedule('* * * * *', () => {
        checkScheduledCampaigns();
    });

    // Check for stalled campaigns every 15 minutes
    cron.schedule('*/15 * * * *', () => {
        checkStalledCampaigns();
    });

    console.log('⏰ Campaign scheduler started');

    // Run initial check
    checkScheduledCampaigns();
}

/**
 * Manually trigger a campaign send
 */
async function triggerCampaign(campaignId, orgId) {
    await campaignQueue.add(
        'process-campaign',
        {
            campaignId: campaignId.toString(),
            orgId: orgId.toString(),
        },
        {
            priority: 1,
        }
    );

    console.log(`📤 Manually triggered campaign: ${campaignId}`);
}

module.exports = {
    startScheduler,
    checkScheduledCampaigns,
    checkStalledCampaigns,
    triggerCampaign,
};
