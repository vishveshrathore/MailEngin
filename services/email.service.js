/**
 * Email Service
 * 
 * Handles sending all transactional emails.
 */

const nodemailer = require('nodemailer');
const emailConfig = require('../config/email.config');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport(emailConfig.smtp);
    }

    /**
     * Send an email
     * @param {Object} options - Email options
     */
    async send({ to, subject, html, text }) {
        const mailOptions = {
            from: `"${emailConfig.from.name}" <${emailConfig.from.email}>`,
            to,
            subject,
            html,
            text: text || this.stripHtml(html),
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${to}: ${result.messageId}`);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send email to ${to}:`, error.message);
            throw error;
        }
    }

    /**
     * Send email verification email
     */
    async sendVerificationEmail(user, token) {
        const verifyUrl = `${emailConfig.urls.baseUrl}${emailConfig.urls.verifyEmail}?token=${token}`;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to MailEngin! 🚀</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Thank you for signing up! Please verify your email address to get started.</p>
            <p style="text-align: center;">
              <a href="${verifyUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${verifyUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MailEngin. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        return this.send({
            to: user.email,
            subject: 'Verify your email address - MailEngin',
            html,
        });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(user, token) {
        const resetUrl = `${emailConfig.urls.baseUrl}${emailConfig.urls.resetPassword}?token=${token}`;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #f5576c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request 🔐</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>We received a request to reset your password for your MailEngin account.</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy this link into your browser:</p>
            <p style="word-break: break-all; color: #f5576c;">${resetUrl}</p>
            <div class="warning">
              ⚠️ This link will expire in 10 minutes for security reasons.
            </div>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MailEngin. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        return this.send({
            to: user.email,
            subject: 'Reset your password - MailEngin',
            html,
        });
    }

    /**
     * Send welcome email after verification
     */
    async sendWelcomeEmail(user) {
        const loginUrl = `${emailConfig.urls.baseUrl}/login`;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #11998e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .features { background: white; padding: 20px; border-radius: 6px; margin: 15px 0; }
          .feature { padding: 10px 0; border-bottom: 1px solid #eee; }
          .feature:last-child { border-bottom: none; }
          .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're All Set! 🎉</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your email has been verified and your account is now active!</p>
            <div class="features">
              <h3>Here's what you can do next:</h3>
              <div class="feature">📧 Create your first email campaign</div>
              <div class="feature">👥 Import your subscriber list</div>
              <div class="feature">🎨 Design beautiful email templates</div>
              <div class="feature">📊 Track your email performance</div>
            </div>
            <p style="text-align: center;">
              <a href="${loginUrl}" class="button">Go to Dashboard</a>
            </p>
            <p>If you have any questions, feel free to reach out to our support team.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MailEngin. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        return this.send({
            to: user.email,
            subject: 'Welcome to MailEngin! 🎉',
            html,
        });
    }

    /**
     * Strip HTML tags for plain text version
     */
    stripHtml(html) {
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

module.exports = new EmailService();
