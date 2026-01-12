/**
 * Analytics Service
 * 
 * Business logic for campaign analytics, dashboard metrics,
 * and reporting queries.
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign.model');
const Contact = require('../models/Contact.model');
const EmailLog = require('../models/EmailLog.model');
const List = require('../models/List.model');

class AnalyticsService {
    /**
     * Get detailed campaign analytics
     */
    async getCampaignAnalytics(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            status: { $ne: 'deleted' },
        }).select('name status analytics progress schedule completedAt recipients');

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        const analytics = campaign.analytics;
        const sent = analytics.sent || 0;
        const delivered = analytics.delivered || 0;

        // Calculate rates
        const rates = {
            deliveryRate: this.calculateRate(delivered, sent),
            openRate: this.calculateRate(analytics.uniqueOpens, delivered),
            clickRate: this.calculateRate(analytics.uniqueClicks, delivered),
            clickToOpenRate: this.calculateRate(analytics.uniqueClicks, analytics.uniqueOpens),
            bounceRate: this.calculateRate(analytics.bounced, sent),
            unsubscribeRate: this.calculateRate(analytics.unsubscribed, delivered),
            complaintRate: this.calculateRate(analytics.complained, delivered),
        };

        // Get hourly breakdown for the last 24 hours
        const hourlyData = await this.getHourlyBreakdown(campaignId);

        // Get top links
        const topLinks = (analytics.linkClicks || [])
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10);

        // Get device/client breakdown
        const deviceBreakdown = await this.getDeviceBreakdown(campaignId);

        // Get location breakdown
        const locationBreakdown = await this.getLocationBreakdown(campaignId);

        return {
            campaign: {
                id: campaign._id,
                name: campaign.name,
                status: campaign.status,
                sentAt: campaign.schedule?.scheduledAt,
                completedAt: campaign.completedAt,
                recipientCount: campaign.recipients?.estimatedTotal,
            },
            metrics: {
                sent,
                delivered,
                opens: analytics.opens,
                uniqueOpens: analytics.uniqueOpens,
                clicks: analytics.clicks,
                uniqueClicks: analytics.uniqueClicks,
                bounced: analytics.bounced,
                hardBounced: analytics.hardBounced,
                softBounced: analytics.softBounced,
                unsubscribed: analytics.unsubscribed,
                complained: analytics.complained,
            },
            rates,
            progress: campaign.progress,
            hourlyData,
            topLinks,
            deviceBreakdown,
            locationBreakdown,
        };
    }

    /**
     * Get dashboard summary for organization
     */
    async getDashboardSummary(orgId, period = 30) {
        const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

        // Overall stats from campaigns
        const campaignStats = await Campaign.aggregate([
            {
                $match: {
                    orgId: new mongoose.Types.ObjectId(orgId),
                    status: 'sent',
                    completedAt: { $gte: since },
                },
            },
            {
                $group: {
                    _id: null,
                    totalCampaigns: { $sum: 1 },
                    totalSent: { $sum: '$analytics.sent' },
                    totalDelivered: { $sum: '$analytics.delivered' },
                    totalOpens: { $sum: '$analytics.uniqueOpens' },
                    totalClicks: { $sum: '$analytics.uniqueClicks' },
                    totalBounced: { $sum: '$analytics.bounced' },
                    totalUnsubscribed: { $sum: '$analytics.unsubscribed' },
                },
            },
        ]);

        const stats = campaignStats[0] || {
            totalCampaigns: 0,
            totalSent: 0,
            totalDelivered: 0,
            totalOpens: 0,
            totalClicks: 0,
            totalBounced: 0,
            totalUnsubscribed: 0,
        };

        // Calculate overall rates
        const overallRates = {
            deliveryRate: this.calculateRate(stats.totalDelivered, stats.totalSent),
            openRate: this.calculateRate(stats.totalOpens, stats.totalDelivered),
            clickRate: this.calculateRate(stats.totalClicks, stats.totalDelivered),
            bounceRate: this.calculateRate(stats.totalBounced, stats.totalSent),
        };

        // Contact stats
        const contactStats = await Contact.aggregate([
            {
                $match: {
                    orgId: new mongoose.Types.ObjectId(orgId),
                },
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const contacts = contactStats.reduce((acc, s) => {
            acc[s._id] = s.count;
            return acc;
        }, {});

        // Recent campaign performance
        const recentCampaigns = await Campaign.find({
            orgId,
            status: 'sent',
        })
            .sort({ completedAt: -1 })
            .limit(5)
            .select('name analytics.sent analytics.uniqueOpens analytics.uniqueClicks completedAt')
            .lean();

        // Daily trend
        const dailyTrend = await this.getDailyTrend(orgId, period);

        // List health
        const listHealth = await this.getListHealth(orgId);

        return {
            period: `${period} days`,
            campaigns: {
                total: stats.totalCampaigns,
                sent: stats.totalSent,
                delivered: stats.totalDelivered,
                opens: stats.totalOpens,
                clicks: stats.totalClicks,
                bounced: stats.totalBounced,
                unsubscribed: stats.totalUnsubscribed,
            },
            rates: overallRates,
            contacts: {
                total: Object.values(contacts).reduce((a, b) => a + b, 0),
                subscribed: contacts.subscribed || 0,
                unsubscribed: contacts.unsubscribed || 0,
                bounced: contacts.bounced || 0,
                cleaned: contacts.cleaned || 0,
            },
            recentCampaigns: recentCampaigns.map(c => ({
                id: c._id,
                name: c.name,
                sent: c.analytics.sent,
                openRate: this.calculateRate(c.analytics.uniqueOpens, c.analytics.sent),
                clickRate: this.calculateRate(c.analytics.uniqueClicks, c.analytics.sent),
                completedAt: c.completedAt,
            })),
            dailyTrend,
            listHealth,
        };
    }

    /**
     * Get daily trend for dashboard chart
     */
    async getDailyTrend(orgId, days = 30) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const trend = await EmailLog.aggregate([
            {
                $match: {
                    orgId: new mongoose.Types.ObjectId(orgId),
                    createdAt: { $gte: since },
                },
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    },
                    sent: { $sum: 1 },
                    opened: {
                        $sum: { $cond: ['$engagement.opened', 1, 0] },
                    },
                    clicked: {
                        $sum: { $cond: ['$engagement.clicked', 1, 0] },
                    },
                },
            },
            {
                $sort: { '_id.date': 1 },
            },
        ]);

        return trend.map(t => ({
            date: t._id.date,
            sent: t.sent,
            opened: t.opened,
            clicked: t.clicked,
            openRate: this.calculateRate(t.opened, t.sent),
            clickRate: this.calculateRate(t.clicked, t.sent),
        }));
    }

    /**
     * Get hourly breakdown for a campaign
     */
    async getHourlyBreakdown(campaignId) {
        const breakdown = await EmailLog.aggregate([
            {
                $match: {
                    campaignId: new mongoose.Types.ObjectId(campaignId),
                },
            },
            {
                $unwind: { path: '$events', preserveNullAndEmptyArrays: true },
            },
            {
                $group: {
                    _id: {
                        hour: { $hour: '$events.timestamp' },
                        type: '$events.type',
                    },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { '_id.hour': 1 },
            },
        ]);

        // Format into hourly buckets
        const hourly = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            opens: 0,
            clicks: 0,
        }));

        for (const item of breakdown) {
            if (item._id.hour !== null) {
                const hour = item._id.hour;
                if (item._id.type === 'opened') {
                    hourly[hour].opens += item.count;
                } else if (item._id.type === 'clicked') {
                    hourly[hour].clicks += item.count;
                }
            }
        }

        return hourly;
    }

    /**
     * Get device/client breakdown
     */
    async getDeviceBreakdown(campaignId) {
        const breakdown = await EmailLog.aggregate([
            {
                $match: {
                    campaignId: new mongoose.Types.ObjectId(campaignId),
                    'engagement.opened': true,
                },
            },
            {
                $unwind: '$events',
            },
            {
                $match: {
                    'events.type': 'opened',
                },
            },
            {
                $group: {
                    _id: '$events.metadata.userAgent',
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { count: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        // Parse user agents into categories
        return breakdown.map(item => {
            const ua = item._id || 'Unknown';
            return {
                userAgent: ua,
                device: this.parseDeviceType(ua),
                client: this.parseEmailClient(ua),
                count: item.count,
            };
        });
    }

    /**
     * Get location breakdown (based on IP geolocation)
     */
    async getLocationBreakdown(campaignId) {
        // This would require IP geolocation service
        // For now, return placeholder
        return [];
    }

    /**
     * Get list health metrics
     */
    async getListHealth(orgId) {
        const lists = await List.find({
            orgId,
            status: 'active',
        })
            .select('name stats')
            .limit(10)
            .lean();

        return lists.map(list => ({
            id: list._id,
            name: list.name,
            total: list.stats?.total || 0,
            subscribed: list.stats?.subscribed || 0,
            unsubscribed: list.stats?.unsubscribed || 0,
            bounced: list.stats?.bounced || 0,
            healthScore: this.calculateListHealth(list.stats),
        }));
    }

    /**
     * Calculate list health score
     */
    calculateListHealth(stats) {
        if (!stats || !stats.total) return 0;

        const unsubRate = (stats.unsubscribed || 0) / stats.total;
        const bounceRate = (stats.bounced || 0) / stats.total;
        const complaintRate = (stats.complained || 0) / stats.total;

        // Health score: 100 - penalties
        let score = 100;
        score -= unsubRate * 30;      // Up to 30% penalty for unsubscribes
        score -= bounceRate * 40;     // Up to 40% penalty for bounces
        score -= complaintRate * 50;  // Up to 50% penalty for complaints

        return Math.max(0, Math.round(score));
    }

    /**
     * Get email activity for a contact
     */
    async getContactActivity(orgId, contactId, options = {}) {
        const { page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            EmailLog.find({
                orgId,
                contactId,
            })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('email status engagement createdAt campaignId')
                .populate('campaignId', 'name'),
            EmailLog.countDocuments({ orgId, contactId }),
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Compare campaigns
     */
    async compareCampaigns(orgId, campaignIds) {
        const campaigns = await Campaign.find({
            _id: { $in: campaignIds },
            orgId,
        }).select('name analytics schedule completedAt');

        return campaigns.map(c => ({
            id: c._id,
            name: c.name,
            sent: c.analytics.sent,
            delivered: c.analytics.delivered,
            opens: c.analytics.uniqueOpens,
            clicks: c.analytics.uniqueClicks,
            bounced: c.analytics.bounced,
            openRate: this.calculateRate(c.analytics.uniqueOpens, c.analytics.delivered),
            clickRate: this.calculateRate(c.analytics.uniqueClicks, c.analytics.delivered),
            bounceRate: this.calculateRate(c.analytics.bounced, c.analytics.sent),
            sentAt: c.schedule?.scheduledAt,
            completedAt: c.completedAt,
        }));
    }

    /**
     * Get A/B test results
     */
    async getABTestResults(orgId, campaignId) {
        const campaign = await Campaign.findOne({
            _id: campaignId,
            orgId,
            'abTest.enabled': true,
        }).select('name abTest analytics');

        if (!campaign) {
            throw new Error('A/B test campaign not found');
        }

        const variants = campaign.abTest.variants.map(v => ({
            name: v.name,
            subject: v.subject,
            sent: v.stats?.sent || 0,
            opens: v.stats?.opened || 0,
            clicks: v.stats?.clicked || 0,
            openRate: this.calculateRate(v.stats?.opened, v.stats?.sent),
            clickRate: this.calculateRate(v.stats?.clicked, v.stats?.sent),
        }));

        // Determine winner
        const metric = campaign.abTest.winnerCriteria || 'openRate';
        const winner = variants.reduce((best, v) => {
            return v[metric] > (best?.[metric] || 0) ? v : best;
        }, null);

        return {
            campaignId: campaign._id,
            campaignName: campaign.name,
            testMetric: metric,
            variants,
            winner: winner?.name,
            winnerStats: winner,
        };
    }

    /**
     * Export analytics data
     */
    async exportAnalytics(orgId, campaignId, format = 'json') {
        const analytics = await this.getCampaignAnalytics(orgId, campaignId);

        if (format === 'csv') {
            // Convert to CSV format
            const rows = [
                ['Metric', 'Value'],
                ['Sent', analytics.metrics.sent],
                ['Delivered', analytics.metrics.delivered],
                ['Open Rate', `${analytics.rates.openRate}%`],
                ['Click Rate', `${analytics.rates.clickRate}%`],
                ['Bounce Rate', `${analytics.rates.bounceRate}%`],
                ['Unsubscribe Rate', `${analytics.rates.unsubscribeRate}%`],
            ];

            return rows.map(row => row.join(',')).join('\n');
        }

        return analytics;
    }

    /**
     * Calculate rate as percentage
     */
    calculateRate(numerator, denominator) {
        if (!denominator || denominator === 0) return 0;
        return Math.round((numerator / denominator) * 10000) / 100;
    }

    /**
     * Parse device type from user agent
     */
    parseDeviceType(ua) {
        if (!ua) return 'Unknown';
        const lower = ua.toLowerCase();
        if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
            return 'Mobile';
        }
        if (lower.includes('tablet') || lower.includes('ipad')) {
            return 'Tablet';
        }
        return 'Desktop';
    }

    /**
     * Parse email client from user agent
     */
    parseEmailClient(ua) {
        if (!ua) return 'Unknown';
        const lower = ua.toLowerCase();

        if (lower.includes('gmail')) return 'Gmail';
        if (lower.includes('outlook') || lower.includes('microsoft')) return 'Outlook';
        if (lower.includes('apple') || lower.includes('iphone') || lower.includes('ipad')) return 'Apple Mail';
        if (lower.includes('yahoo')) return 'Yahoo Mail';
        if (lower.includes('thunderbird')) return 'Thunderbird';

        return 'Other';
    }
}

module.exports = new AnalyticsService();
