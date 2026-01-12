/**
 * Tracking Controller
 * 
 * Handles email open tracking pixels and click tracking redirects.
 */

const EmailLog = require('../models/EmailLog.model');
const Contact = require('../models/Contact.model');
const Campaign = require('../models/Campaign.model');
const { analyticsQueue } = require('../queues');

// 1x1 transparent GIF (smallest valid GIF)
const TRACKING_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

class TrackingController {
    /**
     * GET /t/o/:trackingId
     * Open tracking pixel - returns 1x1 transparent GIF
     */
    async trackOpen(req, res) {
        const { trackingId } = req.params;

        // Always return the pixel first (fast response)
        res.set({
            'Content-Type': 'image/gif',
            'Content-Length': TRACKING_PIXEL.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.send(TRACKING_PIXEL);

        // Process open event asynchronously
        try {
            await this.processOpen(trackingId, req);
        } catch (error) {
            console.error('❌ Open tracking error:', error.message);
        }
    }

    /**
     * GET /t/c/:trackingId/:linkIndex
     * Click tracking redirect
     */
    async trackClick(req, res) {
        const { trackingId, linkIndex } = req.params;
        const { url } = req.query;

        try {
            // Get email log to find the original URL
            const emailLog = await EmailLog.findOne({ trackingId })
                .select('trackedLinks campaignId contactId orgId');

            let redirectUrl = url;

            // If we have tracked links, use the stored URL
            if (emailLog?.trackedLinks && emailLog.trackedLinks.length > parseInt(linkIndex)) {
                redirectUrl = emailLog.trackedLinks[parseInt(linkIndex)]?.originalUrl || url;
            }

            // Fallback to query param URL
            if (!redirectUrl) {
                redirectUrl = url || 'https://example.com';
            }

            // Redirect immediately
            res.redirect(302, redirectUrl);

            // Process click event asynchronously
            await this.processClick(trackingId, linkIndex, redirectUrl, req, emailLog);
        } catch (error) {
            console.error('❌ Click tracking error:', error.message);
            // Fallback redirect
            res.redirect(302, url || 'https://example.com');
        }
    }

    /**
     * Process open event
     */
    async processOpen(trackingId, req) {
        // Extract metadata
        const metadata = this.extractMetadata(req);

        // Find email log
        const emailLog = await EmailLog.findOne({ trackingId });

        if (!emailLog) {
            console.warn(`⚠️ Open tracking: Email log not found for ${trackingId}`);
            return;
        }

        // Check if this is the first open
        const isFirstOpen = !emailLog.engagement.opened;

        // Update email log
        await EmailLog.updateOne(
            { trackingId },
            {
                $set: {
                    'engagement.opened': true,
                    'engagement.lastOpenedAt': new Date(),
                },
                $inc: {
                    'engagement.openCount': 1,
                },
                $push: {
                    events: {
                        type: 'opened',
                        timestamp: new Date(),
                        metadata,
                    },
                },
            }
        );

        // Queue for further processing (campaign/contact updates)
        await analyticsQueue.add('process-event', {
            type: 'open',
            data: {
                trackingId,
                emailLogId: emailLog._id,
                campaignId: emailLog.campaignId,
                contactId: emailLog.contactId,
                orgId: emailLog.orgId,
                isFirstOpen,
                metadata,
                timestamp: new Date(),
            },
        }, {
            priority: 2,
        });

        console.log(`📖 Open tracked: ${trackingId} (first: ${isFirstOpen})`);
    }

    /**
     * Process click event
     */
    async processClick(trackingId, linkIndex, url, req, emailLog) {
        // Extract metadata
        const metadata = this.extractMetadata(req);

        if (!emailLog) {
            emailLog = await EmailLog.findOne({ trackingId })
                .select('campaignId contactId orgId engagement');
        }

        if (!emailLog) {
            console.warn(`⚠️ Click tracking: Email log not found for ${trackingId}`);
            return;
        }

        // Check if this is the first click
        const isFirstClick = !emailLog.engagement?.clicked;

        // Update email log
        await EmailLog.updateOne(
            { trackingId },
            {
                $set: {
                    'engagement.clicked': true,
                    'engagement.lastClickedAt': new Date(),
                },
                $inc: {
                    'engagement.clickCount': 1,
                    [`trackedLinks.${linkIndex}.clickCount`]: 1,
                },
                $push: {
                    events: {
                        type: 'clicked',
                        timestamp: new Date(),
                        metadata: {
                            ...metadata,
                            url,
                            linkIndex: parseInt(linkIndex),
                        },
                    },
                },
            }
        );

        // Queue for further processing
        await analyticsQueue.add('process-event', {
            type: 'click',
            data: {
                trackingId,
                emailLogId: emailLog._id,
                campaignId: emailLog.campaignId,
                contactId: emailLog.contactId,
                orgId: emailLog.orgId,
                url,
                linkIndex: parseInt(linkIndex),
                isFirstClick,
                metadata,
                timestamp: new Date(),
            },
        }, {
            priority: 2,
        });

        console.log(`🔗 Click tracked: ${trackingId} -> ${url}`);
    }

    /**
     * GET /t/u/:trackingId
     * Unsubscribe tracking
     */
    async trackUnsubscribe(req, res) {
        const { trackingId } = req.params;
        const { reason } = req.query;

        try {
            const emailLog = await EmailLog.findOne({ trackingId })
                .select('contactId campaignId orgId email');

            if (!emailLog) {
                return res.status(404).send('Invalid unsubscribe link');
            }

            // Update contact status
            if (emailLog.contactId) {
                await Contact.updateOne(
                    { _id: emailLog.contactId },
                    {
                        status: 'unsubscribed',
                        statusReason: reason || 'Unsubscribed via email link',
                        statusChangedAt: new Date(),
                        'unsubscribe.unsubscribedAt': new Date(),
                        'unsubscribe.reason': reason || 'link',
                        'unsubscribe.campaignId': emailLog.campaignId,
                    }
                );
            }

            // Update email log
            await EmailLog.updateOne(
                { trackingId },
                {
                    $push: {
                        events: {
                            type: 'unsubscribed',
                            timestamp: new Date(),
                            metadata: { reason },
                        },
                    },
                }
            );

            // Update campaign stats
            if (emailLog.campaignId) {
                await Campaign.updateOne(
                    { _id: emailLog.campaignId },
                    { $inc: { 'analytics.unsubscribed': 1 } }
                );
            }

            // Queue for processing
            await analyticsQueue.add('process-event', {
                type: 'unsubscribe',
                data: {
                    trackingId,
                    contactId: emailLog.contactId,
                    campaignId: emailLog.campaignId,
                    email: emailLog.email,
                    reason,
                },
            });

            // Redirect to unsubscribe confirmation page
            const confirmUrl = `${process.env.APP_URL}/unsubscribed?email=${encodeURIComponent(emailLog.email)}`;
            res.redirect(302, confirmUrl);

        } catch (error) {
            console.error('❌ Unsubscribe tracking error:', error.message);
            res.status(500).send('An error occurred');
        }
    }

    /**
     * GET /t/v/:trackingId
     * View in browser redirect
     */
    async viewInBrowser(req, res) {
        const { trackingId } = req.params;

        try {
            const emailLog = await EmailLog.findOne({ trackingId })
                .select('campaignId orgId');

            if (!emailLog || !emailLog.campaignId) {
                return res.status(404).send('Email not found');
            }

            // Track as an open
            await this.processOpen(trackingId, req);

            // Redirect to web version
            const viewUrl = `${process.env.APP_URL}/view/${emailLog.campaignId}/${trackingId}`;
            res.redirect(302, viewUrl);

        } catch (error) {
            console.error('❌ View in browser error:', error.message);
            res.status(500).send('An error occurred');
        }
    }

    /**
     * Extract metadata from request
     */
    extractMetadata(req) {
        return {
            ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            referer: req.headers['referer'],
            timestamp: new Date().toISOString(),
        };
    }
}

module.exports = new TrackingController();
