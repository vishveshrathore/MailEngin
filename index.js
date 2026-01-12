const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./utils/db.js');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const logger = require('./utils/logger');
require('dotenv').config();

// Security middleware
const {
  globalLimiter,
  authLimiter,
  checkBlockedIP,
  securityHeaders,
  sanitizeRequest,
} = require('./middlewares/security.middleware');
const { auditLogger } = require('./middlewares/audit.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/contact.routes');
const templateRoutes = require('./routes/template.routes');
const campaignRoutes = require('./routes/campaign.routes');
const queueRoutes = require('./routes/queue.routes');
const webhookRoutes = require('./routes/webhook.routes');
const trackingRoutes = require('./routes/tracking.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const automationRoutes = require('./routes/automation.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware (apply first)
app.use(checkBlockedIP);
app.use(securityHeaders);
app.use(globalLimiter);

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

// Middleware
app.use(morgan('combined', { stream: logger.stream }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request sanitization
app.use(sanitizeRequest);

// Audit logging for API routes
app.use('/api', auditLogger());

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 MailEngin API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Tracking routes (public, no auth required)
app.use('/t', trackingRoutes);

// API Routes - Auth with stricter rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/queues', queueRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`✅ Server Running at http://localhost:${PORT}`);
    logger.info(`📧 Auth API: http://localhost:${PORT}/api/auth`);
  });
}).catch((err) => {
  logger.error('❌ Failed to connect to database:', err);
  process.exit(1);
});

module.exports = app;
