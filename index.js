const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./utils/db.js');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/contact.routes');
const templateRoutes = require('./routes/template.routes');
const campaignRoutes = require('./routes/campaign.routes');
const queueRoutes = require('./routes/queue.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 MailEngin API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/admin/queues', queueRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server Running at http://localhost:${PORT}`);
    console.log(`📧 Auth API: http://localhost:${PORT}/api/auth`);
  });
}).catch((err) => {
  console.error('❌ Failed to connect to database:', err.message);
  process.exit(1);
});

module.exports = app;
