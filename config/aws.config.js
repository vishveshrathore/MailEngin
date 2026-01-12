/**
 * AWS Configuration
 * 
 * AWS SDK configuration for SES, S3, and other services.
 */

require('dotenv').config();

const awsConfig = {
    // AWS Credentials
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },

    // SES Configuration
    ses: {
        // Sending rate (emails per second)
        sendingRate: parseInt(process.env.SES_SENDING_RATE) || 14,

        // Configuration set for tracking
        configurationSet: process.env.SES_CONFIGURATION_SET || 'mailengin-tracking',

        // Default from address (must be verified in SES)
        defaultFromEmail: process.env.SES_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS,
        defaultFromName: process.env.SES_FROM_NAME || process.env.EMAIL_FROM_NAME || 'MailEngin',

        // Sandbox mode (limited to verified emails only)
        sandboxMode: process.env.SES_SANDBOX_MODE === 'true',
    },

    // SNS Configuration (for bounce/complaint webhooks)
    sns: {
        // Topic ARNs for SES notifications
        bounceTopicArn: process.env.SNS_BOUNCE_TOPIC_ARN,
        complaintTopicArn: process.env.SNS_COMPLAINT_TOPIC_ARN,
        deliveryTopicArn: process.env.SNS_DELIVERY_TOPIC_ARN,
    },
};

module.exports = awsConfig;
