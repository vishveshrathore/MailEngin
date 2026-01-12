const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    // Organization reference
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization is required'],
        index: true,
    },

    // Basic Info
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false, // Don't include in queries by default
    },

    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters'],
    },

    // Profile
    avatar: String, // S3 URL
    phone: String,
    jobTitle: String,

    // Role & Permissions
    role: {
        type: String,
        enum: ['owner', 'admin', 'editor', 'viewer'],
        default: 'editor',
        index: true,
    },

    // Granular permissions (override role defaults)
    permissions: {
        campaigns: {
            create: { type: Boolean, default: true },
            edit: { type: Boolean, default: true },
            delete: { type: Boolean, default: false },
            send: { type: Boolean, default: true },
        },
        contacts: {
            create: { type: Boolean, default: true },
            edit: { type: Boolean, default: true },
            delete: { type: Boolean, default: false },
            import: { type: Boolean, default: true },
            export: { type: Boolean, default: false },
        },
        templates: {
            create: { type: Boolean, default: true },
            edit: { type: Boolean, default: true },
            delete: { type: Boolean, default: false },
        },
        automations: {
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
        },
        billing: {
            view: { type: Boolean, default: false },
            manage: { type: Boolean, default: false },
        },
        settings: {
            view: { type: Boolean, default: true },
            manage: { type: Boolean, default: false },
        },
        team: {
            view: { type: Boolean, default: true },
            manage: { type: Boolean, default: false },
        },
    },

    // Authentication
    emailVerified: {
        type: Boolean,
        default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,

    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,

    // Two-factor authentication
    twoFactorEnabled: {
        type: Boolean,
        default: false,
    },
    twoFactorSecret: {
        type: String,
        select: false,
    },
    twoFactorBackupCodes: {
        type: [String],
        select: false,
    },

    // Session management
    refreshTokens: [{
        token: String,
        device: String,
        ip: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
    }],

    // Activity tracking
    lastLoginAt: Date,
    lastActiveAt: Date,
    loginCount: {
        type: Number,
        default: 0,
    },

    // Preferences
    preferences: {
        timezone: String,
        language: {
            type: String,
            default: 'en',
        },
        emailNotifications: {
            campaignCompleted: { type: Boolean, default: true },
            weeklyReport: { type: Boolean, default: true },
            productUpdates: { type: Boolean, default: false },
        },
        dashboardLayout: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'pending'],
        default: 'pending',
        index: true,
    },

    // Invite tracking
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    inviteToken: String,
    inviteExpires: Date,

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============ INDEXES ============

// Unique email per organization (allows same email in different orgs)
userSchema.index({ orgId: 1, email: 1 }, { unique: true });

// Login queries
userSchema.index({ email: 1, status: 1 });

// Organization member listing
userSchema.index({ orgId: 1, status: 1, role: 1 });

// Password reset token lookup
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// Email verification token lookup
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });

// Invite token lookup
userSchema.index({ inviteToken: 1 }, { sparse: true });

// ============ VIRTUALS ============

userSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('initials').get(function () {
    return `${this.firstName[0]}${this.lastName[0]}`.toUpperCase();
});

// ============ METHODS ============

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return jwtTimestamp < changedTimestamp;
    }
    return false;
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
};

// Check if user has specific permission
userSchema.methods.hasPermission = function (resource, action) {
    // Owners have all permissions
    if (this.role === 'owner') return true;

    // Admins have all permissions except billing management
    if (this.role === 'admin') {
        if (resource === 'billing' && action === 'manage') return false;
        return true;
    }

    // Check specific permissions
    return this.permissions?.[resource]?.[action] ?? false;
};

// ============ MIDDLEWARE ============

// Hash password before saving
userSchema.pre('save', async function (next) {
    // Only hash if password is modified
    if (!this.isModified('password')) return next();

    // Hash password with cost factor of 12
    this.password = await bcrypt.hash(this.password, 12);

    // Update passwordChangedAt (skip on new documents)
    if (!this.isNew) {
        this.passwordChangedAt = Date.now() - 1000; // Subtract 1s to ensure JWT is valid
    }

    next();
});

// Clean up expired refresh tokens before saving
userSchema.pre('save', function (next) {
    if (this.refreshTokens && this.refreshTokens.length > 0) {
        this.refreshTokens = this.refreshTokens.filter(
            token => token.expiresAt > new Date()
        );
    }
    next();
});

module.exports = mongoose.model('User', userSchema);
