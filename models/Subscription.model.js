const mongoose = require('mongoose');

/**
 * Subscription Model
 * 
 * Represents a billing subscription plan for an organization.
 * Integrates with Stripe for payment processing.
 * 
 * Relations:
 * - Has one Organization
 * - References Plan (pricing tier)
 */

const subscriptionSchema = new mongoose.Schema({
    // Organization reference
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        unique: true, // One subscription per org
        index: true,
    },

    // Plan information
    plan: {
        type: String,
        enum: ['free', 'starter', 'pro', 'enterprise', 'custom'],
        default: 'free',
        index: true,
    },

    // Plan details (denormalized for quick access)
    planDetails: {
        name: String,
        description: String,
        monthlyPrice: Number,
        yearlyPrice: Number,
    },

    // Billing cycle
    billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
    },

    // Limits
    limits: {
        emailsPerMonth: {
            type: Number,
            default: 500,  // Free tier
        },
        contacts: {
            type: Number,
            default: 500,  // Free tier
        },
        lists: {
            type: Number,
            default: 3,    // Free tier
        },
        templates: {
            type: Number,
            default: 5,    // Free tier
        },
        automations: {
            type: Number,
            default: 0,    // Free tier
        },
        teamMembers: {
            type: Number,
            default: 1,    // Free tier
        },
        // API requests per day
        apiRequestsPerDay: {
            type: Number,
            default: 0,    // Free tier
        },
        // File storage in MB
        storageInMB: {
            type: Number,
            default: 50,
        },
    },

    // Feature flags (plan-specific)
    features: {
        customDomains: { type: Boolean, default: false },
        removeBranding: { type: Boolean, default: false },
        advancedAnalytics: { type: Boolean, default: false },
        abTesting: { type: Boolean, default: false },
        automations: { type: Boolean, default: false },
        apiAccess: { type: Boolean, default: false },
        webhooks: { type: Boolean, default: false },
        prioritySupport: { type: Boolean, default: false },
        dedicatedIp: { type: Boolean, default: false },
        ssoIntegration: { type: Boolean, default: false },
        customReporting: { type: Boolean, default: false },
        sendTimeOptimization: { type: Boolean, default: false },
    },

    // Current usage
    usage: {
        emailsSentThisMonth: { type: Number, default: 0 },
        contactsCount: { type: Number, default: 0 },
        listsCount: { type: Number, default: 0 },
        templatesCount: { type: Number, default: 0 },
        automationsCount: { type: Number, default: 0 },
        teamMembersCount: { type: Number, default: 1 },
        apiRequestsToday: { type: Number, default: 0 },
        storageUsedMB: { type: Number, default: 0 },

        // Reset tracking
        lastEmailResetAt: Date,
        lastApiResetAt: Date,
    },

    // Stripe integration
    stripe: {
        customerId: {
            type: String,
            index: true,
            sparse: true,
        },
        subscriptionId: {
            type: String,
            index: true,
            sparse: true,
        },
        priceId: String,
        productId: String,

        // Payment method
        paymentMethodId: String,
        paymentMethodLast4: String,
        paymentMethodBrand: String,

        // Current period
        currentPeriodStart: Date,
        currentPeriodEnd: Date,

        // Billing info
        billingEmail: String,
        billingName: String,
        billingAddress: {
            line1: String,
            line2: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
        },

        // Tax ID
        taxId: String,
        taxIdType: String,
    },

    // Subscription status
    status: {
        type: String,
        enum: ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'],
        default: 'active',
        index: true,
    },

    // Trial info
    trial: {
        isTrialing: { type: Boolean, default: false },
        startedAt: Date,
        endsAt: Date,
        extendedDays: { type: Number, default: 0 },
    },

    // Cancellation info
    cancellation: {
        canceledAt: Date,
        cancelReason: String,
        feedback: String,
        effectiveDate: Date,  // When subscription actually ends
    },

    // Add-ons
    addOns: [{
        type: {
            type: String,
            enum: ['extra_emails', 'extra_contacts', 'dedicated_ip', 'priority_support'],
        },
        quantity: Number,
        unitPrice: Number,
        stripePriceId: String,
    }],

    // Discount/coupon
    discount: {
        couponId: String,
        couponName: String,
        percentOff: Number,
        amountOff: Number,
        validUntil: Date,
    },

    // Invoices summary
    invoices: {
        totalPaid: { type: Number, default: 0 },
        lastPaymentAt: Date,
        lastPaymentAmount: Number,
        nextPaymentAt: Date,
        nextPaymentAmount: Number,
    },

    // Metadata
    notes: String,

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Stripe lookups
subscriptionSchema.index({ 'stripe.customerId': 1 }, { sparse: true });
subscriptionSchema.index({ 'stripe.subscriptionId': 1 }, { sparse: true });

// Status queries
subscriptionSchema.index({ status: 1, 'stripe.currentPeriodEnd': 1 });

// Trial expiry queries
subscriptionSchema.index({ 'trial.isTrialing': 1, 'trial.endsAt': 1 });

// ============ VIRTUALS ============

subscriptionSchema.virtual('isActive').get(function () {
    return ['active', 'trialing'].includes(this.status);
});

subscriptionSchema.virtual('isPaid').get(function () {
    return this.plan !== 'free' && this.status === 'active';
});

subscriptionSchema.virtual('emailsRemaining').get(function () {
    return Math.max(0, this.limits.emailsPerMonth - this.usage.emailsSentThisMonth);
});

subscriptionSchema.virtual('emailUsagePercent').get(function () {
    return Math.round((this.usage.emailsSentThisMonth / this.limits.emailsPerMonth) * 100);
});

subscriptionSchema.virtual('contactsRemaining').get(function () {
    return Math.max(0, this.limits.contacts - this.usage.contactsCount);
});

subscriptionSchema.virtual('trialDaysRemaining').get(function () {
    if (!this.trial.isTrialing || !this.trial.endsAt) return 0;
    const diff = this.trial.endsAt - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

subscriptionSchema.virtual('daysUntilRenewal').get(function () {
    if (!this.stripe.currentPeriodEnd) return null;
    const diff = this.stripe.currentPeriodEnd - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// ============ METHODS ============

// Check if has quota for emails
subscriptionSchema.methods.canSendEmails = function (count = 1) {
    return (this.usage.emailsSentThisMonth + count) <= this.limits.emailsPerMonth;
};

// Check if has quota for contacts
subscriptionSchema.methods.canAddContacts = function (count = 1) {
    return (this.usage.contactsCount + count) <= this.limits.contacts;
};

// Check if has quota for lists
subscriptionSchema.methods.canAddList = function () {
    return this.usage.listsCount < this.limits.lists;
};

// Check if has feature
subscriptionSchema.methods.hasFeature = function (feature) {
    return this.features[feature] === true;
};

// Increment email usage
subscriptionSchema.methods.incrementEmailUsage = function (count = 1) {
    this.usage.emailsSentThisMonth += count;
    return this.save();
};

// Increment contact count
subscriptionSchema.methods.incrementContactCount = function (count = 1) {
    this.usage.contactsCount += count;
    return this.save();
};

// Reset monthly usage
subscriptionSchema.methods.resetMonthlyUsage = function () {
    this.usage.emailsSentThisMonth = 0;
    this.usage.lastEmailResetAt = new Date();
    return this.save();
};

// Reset daily API usage
subscriptionSchema.methods.resetDailyApiUsage = function () {
    this.usage.apiRequestsToday = 0;
    this.usage.lastApiResetAt = new Date();
    return this.save();
};

// Upgrade to a new plan
subscriptionSchema.methods.upgradePlan = function (newPlan, newLimits, newFeatures) {
    this.plan = newPlan;

    if (newLimits) {
        Object.assign(this.limits, newLimits);
    }

    if (newFeatures) {
        Object.assign(this.features, newFeatures);
    }

    return this.save();
};

// Cancel subscription
subscriptionSchema.methods.cancel = function (reason, feedback, effectiveDate) {
    this.status = 'canceled';
    this.cancellation = {
        canceledAt: new Date(),
        cancelReason: reason,
        feedback,
        effectiveDate: effectiveDate || this.stripe.currentPeriodEnd,
    };

    return this.save();
};

// ============ STATICS ============

// Plan configurations
subscriptionSchema.statics.PLANS = {
    free: {
        name: 'Free',
        description: 'Get started with email marketing',
        monthlyPrice: 0,
        yearlyPrice: 0,
        limits: {
            emailsPerMonth: 500,
            contacts: 500,
            lists: 3,
            templates: 5,
            automations: 0,
            teamMembers: 1,
            apiRequestsPerDay: 0,
            storageInMB: 50,
        },
        features: {
            customDomains: false,
            removeBranding: false,
            advancedAnalytics: false,
            abTesting: false,
            automations: false,
            apiAccess: false,
            webhooks: false,
            prioritySupport: false,
            dedicatedIp: false,
            ssoIntegration: false,
            customReporting: false,
            sendTimeOptimization: false,
        },
    },
    starter: {
        name: 'Starter',
        description: 'Perfect for small businesses',
        monthlyPrice: 29,
        yearlyPrice: 290,
        limits: {
            emailsPerMonth: 10000,
            contacts: 2500,
            lists: 10,
            templates: 25,
            automations: 3,
            teamMembers: 3,
            apiRequestsPerDay: 1000,
            storageInMB: 200,
        },
        features: {
            customDomains: false,
            removeBranding: true,
            advancedAnalytics: false,
            abTesting: true,
            automations: true,
            apiAccess: true,
            webhooks: true,
            prioritySupport: false,
            dedicatedIp: false,
            ssoIntegration: false,
            customReporting: false,
            sendTimeOptimization: false,
        },
    },
    pro: {
        name: 'Pro',
        description: 'For growing marketing teams',
        monthlyPrice: 79,
        yearlyPrice: 790,
        limits: {
            emailsPerMonth: 50000,
            contacts: 10000,
            lists: 50,
            templates: 100,
            automations: 20,
            teamMembers: 10,
            apiRequestsPerDay: 10000,
            storageInMB: 1000,
        },
        features: {
            customDomains: true,
            removeBranding: true,
            advancedAnalytics: true,
            abTesting: true,
            automations: true,
            apiAccess: true,
            webhooks: true,
            prioritySupport: true,
            dedicatedIp: false,
            ssoIntegration: false,
            customReporting: true,
            sendTimeOptimization: true,
        },
    },
    enterprise: {
        name: 'Enterprise',
        description: 'For large organizations',
        monthlyPrice: 299,
        yearlyPrice: 2990,
        limits: {
            emailsPerMonth: 500000,
            contacts: 100000,
            lists: -1,  // Unlimited
            templates: -1,
            automations: -1,
            teamMembers: -1,
            apiRequestsPerDay: -1,
            storageInMB: 10000,
        },
        features: {
            customDomains: true,
            removeBranding: true,
            advancedAnalytics: true,
            abTesting: true,
            automations: true,
            apiAccess: true,
            webhooks: true,
            prioritySupport: true,
            dedicatedIp: true,
            ssoIntegration: true,
            customReporting: true,
            sendTimeOptimization: true,
        },
    },
};

// Get plan configuration
subscriptionSchema.statics.getPlanConfig = function (planName) {
    return this.PLANS[planName] || this.PLANS.free;
};

// Find subscriptions needing usage reset
subscriptionSchema.statics.findNeedingMonthlyReset = function () {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    return this.find({
        $or: [
            { 'usage.lastEmailResetAt': { $lt: oneMonthAgo } },
            { 'usage.lastEmailResetAt': { $exists: false } },
        ],
    });
};

// Find expiring trials
subscriptionSchema.statics.findExpiringTrials = function (daysFromNow = 3) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysFromNow);

    return this.find({
        'trial.isTrialing': true,
        'trial.endsAt': { $lte: futureDate, $gt: new Date() },
    });
};

// Find past due subscriptions
subscriptionSchema.statics.findPastDue = function () {
    return this.find({ status: 'past_due' });
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
