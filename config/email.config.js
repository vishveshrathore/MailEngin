require('dotenv').config();

module.exports = {
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    },

    // Default sender
    from: {
        name: process.env.EMAIL_FROM_NAME || 'MailEngin',
        email: process.env.EMAIL_FROM_ADDRESS || 'noreply@mailengin.com',
    },

    // App URLs for email links
    urls: {
        baseUrl: process.env.APP_URL || 'http://localhost:5173',
        verifyEmail: '/verify-email',
        resetPassword: '/reset-password',
    },
};
