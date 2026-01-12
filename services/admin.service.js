/**
 * Admin Service
 * 
 * Business logic for super admin operations including
 * user management, organization oversight, and abuse detection.
 */

const mongoose = require('mongoose');
const User = require('../models/User.model');
const Organization = require('../models/Organization.model');
const Campaign = require('../models/Campaign.model');
const Contact = require('../models/Contact.model');
const EmailLog = require('../models/EmailLog.model');
const Subscription = require('../models/Subscription.model');
const SESLog = require('../models/SESLog.model');

class AdminService {
    // ==================== USERS ====================

    /**
     * Get all users with filters
     */
    async getUsers(options = {}) {
        const {
            page = 1,
            limit = 50,
            search,
            status,
            role,
            orgId,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const query = {};

        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
            ];
        }

        if (status) query.status = status;
        if (role) query.role = role;
        if (orgId) query.orgId = new mongoose.Types.ObjectId(orgId);

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [users, total] = await Promise.all([
            User.find(query)
                .populate('orgId', 'name slug')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .select('-password -refreshTokens'),
            User.countDocuments(query),
        ]);

        return {
            users,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    /**
     * Get user by ID
     */
    async getUser(userId) {
        const user = await User.findById(userId)
            .populate('orgId', 'name slug status')
            .select('-password -refreshTokens');

        if (!user) throw new Error('User not found');

        return user;
    }

    /**
     * Update user
     */
    async updateUser(userId, updates) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const allowedUpdates = ['status', 'role', 'permissions'];
        for (const key of Object.keys(updates)) {
            if (allowedUpdates.includes(key)) {
                user[key] = updates[key];
            }
        }

        await user.save();
        return user;
    }

    /**
     * Suspend user
     */
    async suspendUser(userId, reason) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        user.status = 'suspended';
        user.suspendedAt = new Date();
        user.suspendReason = reason;

        await user.save();
        return user;
    }

    /**
     * Reactivate user
     */
    async reactivateUser(userId) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        user.status = 'active';
        user.suspendedAt = null;
        user.suspendReason = null;

        await user.save();
        return user;
    }

    // ==================== ORGANIZATIONS ====================

    /**
     * Get all organizations
     */
    async getOrganizations(options = {}) {
        const {
            page = 1,
            limit = 50,
            search,
            status,
            plan,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
            ];
        }

        if (status) query.status = status;

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        let orgs = await Organization.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();

        // Attach subscription info
        const orgIds = orgs.map(o => o._id);
        const subscriptions = await Subscription.find({
            orgId: { $in: orgIds },
        }).lean();

        const subsByOrg = subscriptions.reduce((acc, s) => {
            acc[s.orgId.toString()] = s;
            return acc;
        }, {});

        orgs = orgs.map(org => ({
            ...org,
            subscription: subsByOrg[org._id.toString()],
        }));

        if (plan) {
            orgs = orgs.filter(o => o.subscription?.plan === plan);
        }

        const total = await Organization.countDocuments(query);

        return {
            organizations: orgs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    /**
     * Get organization details
     */
    async getOrganization(orgId) {
        const org = await Organization.findById(orgId).lean();
        if (!org) throw new Error('Organization not found');

        const [subscription, users, stats] = await Promise.all([
            Subscription.findOne({ orgId }),
            User.find({ orgId }).select('email firstName lastName role status'),
            this.getOrgStats(orgId),
        ]);

        return {
            ...org,
            subscription,
            users,
            stats,
        };
    }

    /**
     * Get organization statistics
     */
    async getOrgStats(orgId) {
        const [contacts, campaigns, emailsSent, bounceRate] = await Promise.all([
            Contact.countDocuments({ orgId }),
            Campaign.countDocuments({ orgId }),
            EmailLog.countDocuments({ orgId }),
            this.calculateBounceRate(orgId),
        ]);

        return {
            contacts,
            campaigns,
            emailsSent,
            bounceRate,
        };
    }

    /**
     * Suspend organization
     */
    async suspendOrganization(orgId, reason, adminId) {
        const org = await Organization.findById(orgId);
        if (!org) throw new Error('Organization not found');

        org.status = 'suspended';
        org.suspendedAt = new Date();
        org.suspendReason = reason;
        org.suspendedBy = adminId;

        await org.save();

        // Suspend all users
        await User.updateMany({ orgId }, { status: 'suspended' });

        // Pause all campaigns
        await Campaign.updateMany(
            { orgId, status: { $in: ['scheduled', 'sending'] } },
            { status: 'paused' }
        );

        return org;
    }

    /**
     * Reactivate organization
     */
    async reactivateOrganization(orgId) {
        const org = await Organization.findById(orgId);
        if (!org) throw new Error('Organization not found');

        org.status = 'active';
        org.suspendedAt = null;
        org.suspendReason = null;

        await org.save();

        // Reactivate owner
        await User.updateMany(
            { orgId, role: 'owner' },
            { status: 'active' }
        );

        return org;
    }

    // ==================== CAMPAIGNS ====================

    /**
     * Get all campaigns (admin oversight)
     */
    async getCampaigns(options = {}) {
        const {
            page = 1,
            limit = 50,
            status,
            orgId,
            flagged,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const query = { status: { $ne: 'deleted' } };

        if (status) query.status = status;
        if (orgId) query.orgId = new mongoose.Types.ObjectId(orgId);
        if (flagged === 'true') query['abuse.flagged'] = true;

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [campaigns, total] = await Promise.all([
            Campaign.find(query)
                .populate('orgId', 'name slug')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .select('name status analytics orgId createdAt abuse'),
            Campaign.countDocuments(query),
        ]);

        return {
            campaigns,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    /**
     * Flag campaign for review
     */
    async flagCampaign(campaignId, reason, adminId) {
        const campaign = await Campaign.findById(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        campaign.abuse = campaign.abuse || {};
        campaign.abuse.flagged = true;
        campaign.abuse.flaggedAt = new Date();
        campaign.abuse.flaggedBy = adminId;
        campaign.abuse.reason = reason;

        // Pause if sending
        if (['scheduled', 'sending'].includes(campaign.status)) {
            campaign.status = 'paused';
        }

        await campaign.save();
        return campaign;
    }

    /**
     * Clear campaign flag
     */
    async clearCampaignFlag(campaignId, adminId) {
        const campaign = await Campaign.findById(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        campaign.abuse = campaign.abuse || {};
        campaign.abuse.flagged = false;
        campaign.abuse.clearedAt = new Date();
        campaign.abuse.clearedBy = adminId;

        await campaign.save();
        return campaign;
    }

    // ==================== ABUSE DETECTION ====================

    /**
     * Get abuse metrics for all orgs
     */
    async getAbuseMetrics() {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // High bounce rate orgs
        const highBounceOrgs = await this.getHighBounceOrgs();

        // High complaint orgs
        const highComplaintOrgs = await this.getHighComplaintOrgs();

        // Flagged campaigns
        const flaggedCampaigns = await Campaign.countDocuments({
            'abuse.flagged': true,
        });

        // Recent bounces/complaints
        const [recentBounces, recentComplaints] = await Promise.all([
            SESLog.countDocuments({ type: 'bounce', timestamp: { $gte: last24h } }),
            SESLog.countDocuments({ type: 'complaint', timestamp: { $gte: last24h } }),
        ]);

        // Suspended orgs
        const suspendedOrgs = await Organization.countDocuments({ status: 'suspended' });

        return {
            highBounceOrgs,
            highComplaintOrgs,
            flaggedCampaigns,
            suspendedOrgs,
            last24h: {
                bounces: recentBounces,
                complaints: recentComplaints,
            },
        };
    }

    /**
     * Get organizations with high bounce rates
     */
    async getHighBounceOrgs(threshold = 5) {
        const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const results = await EmailLog.aggregate([
            {
                $match: {
                    createdAt: { $gte: last30d },
                },
            },
            {
                $group: {
                    _id: '$orgId',
                    total: { $sum: 1 },
                    bounced: {
                        $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] },
                    },
                },
            },
            {
                $match: {
                    total: { $gte: 100 }, // Minimum emails sent
                },
            },
            {
                $addFields: {
                    bounceRate: { $multiply: [{ $divide: ['$bounced', '$total'] }, 100] },
                },
            },
            {
                $match: {
                    bounceRate: { $gte: threshold },
                },
            },
            {
                $sort: { bounceRate: -1 },
            },
            {
                $limit: 20,
            },
        ]);

        // Get org details
        const orgIds = results.map(r => r._id);
        const orgs = await Organization.find({ _id: { $in: orgIds } })
            .select('name slug')
            .lean();

        const orgsById = orgs.reduce((acc, o) => {
            acc[o._id.toString()] = o;
            return acc;
        }, {});

        return results.map(r => ({
            orgId: r._id,
            org: orgsById[r._id.toString()],
            total: r.total,
            bounced: r.bounced,
            bounceRate: Math.round(r.bounceRate * 100) / 100,
        }));
    }

    /**
     * Get organizations with high complaint rates
     */
    async getHighComplaintOrgs(threshold = 0.1) {
        const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const results = await EmailLog.aggregate([
            {
                $match: {
                    createdAt: { $gte: last30d },
                },
            },
            {
                $group: {
                    _id: '$orgId',
                    total: { $sum: 1 },
                    complained: {
                        $sum: { $cond: [{ $eq: ['$status', 'complained'] }, 1, 0] },
                    },
                },
            },
            {
                $match: {
                    total: { $gte: 100 },
                },
            },
            {
                $addFields: {
                    complaintRate: { $multiply: [{ $divide: ['$complained', '$total'] }, 100] },
                },
            },
            {
                $match: {
                    complaintRate: { $gte: threshold },
                },
            },
            {
                $sort: { complaintRate: -1 },
            },
            {
                $limit: 20,
            },
        ]);

        const orgIds = results.map(r => r._id);
        const orgs = await Organization.find({ _id: { $in: orgIds } })
            .select('name slug')
            .lean();

        const orgsById = orgs.reduce((acc, o) => {
            acc[o._id.toString()] = o;
            return acc;
        }, {});

        return results.map(r => ({
            orgId: r._id,
            org: orgsById[r._id.toString()],
            total: r.total,
            complained: r.complained,
            complaintRate: Math.round(r.complaintRate * 1000) / 1000,
        }));
    }

    /**
     * Calculate bounce rate for an org
     */
    async calculateBounceRate(orgId) {
        const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const stats = await EmailLog.aggregate([
            {
                $match: {
                    orgId: new mongoose.Types.ObjectId(orgId),
                    createdAt: { $gte: last30d },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    bounced: {
                        $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] },
                    },
                },
            },
        ]);

        if (!stats.length || stats[0].total === 0) return 0;
        return Math.round((stats[0].bounced / stats[0].total) * 10000) / 100;
    }

    // ==================== PLAN CONTROL ====================

    /**
     * Change organization plan (admin override)
     */
    async changePlan(orgId, newPlan, adminId) {
        let subscription = await Subscription.findOne({ orgId });

        if (!subscription) {
            subscription = new Subscription({
                orgId,
                plan: newPlan,
                status: 'active',
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
        } else {
            subscription.plan = newPlan;
            subscription.status = 'active';
        }

        subscription.adminOverride = {
            changedBy: adminId,
            changedAt: new Date(),
            previousPlan: subscription.plan,
        };

        await subscription.save();
        return subscription;
    }

    /**
     * Grant email credits
     */
    async grantEmailCredits(orgId, credits, reason, adminId) {
        const subscription = await Subscription.findOne({ orgId });
        if (!subscription) throw new Error('Subscription not found');

        subscription.bonusCredits = (subscription.bonusCredits || 0) + credits;
        subscription.creditHistory = subscription.creditHistory || [];
        subscription.creditHistory.push({
            amount: credits,
            reason,
            grantedBy: adminId,
            grantedAt: new Date(),
        });

        await subscription.save();
        return subscription;
    }

    // ==================== DASHBOARD ====================

    /**
     * Get admin dashboard stats
     */
    async getDashboardStats() {
        const now = new Date();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const [
            totalOrgs,
            activeOrgs,
            suspendedOrgs,
            totalUsers,
            totalContacts,
            emailsLast24h,
            emailsLast7d,
            emailsLast30d,
            planBreakdown,
        ] = await Promise.all([
            Organization.countDocuments(),
            Organization.countDocuments({ status: 'active' }),
            Organization.countDocuments({ status: 'suspended' }),
            User.countDocuments(),
            Contact.countDocuments(),
            EmailLog.countDocuments({ createdAt: { $gte: last24h } }),
            EmailLog.countDocuments({ createdAt: { $gte: last7d } }),
            EmailLog.countDocuments({ createdAt: { $gte: last30d } }),
            Subscription.aggregate([
                { $group: { _id: '$plan', count: { $sum: 1 } } },
            ]),
        ]);

        return {
            organizations: {
                total: totalOrgs,
                active: activeOrgs,
                suspended: suspendedOrgs,
            },
            users: totalUsers,
            contacts: totalContacts,
            emails: {
                last24h: emailsLast24h,
                last7d: emailsLast7d,
                last30d: emailsLast30d,
            },
            plans: planBreakdown.reduce((acc, p) => {
                acc[p._id] = p.count;
                return acc;
            }, {}),
        };
    }
}

module.exports = new AdminService();
