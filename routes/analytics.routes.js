/**
 * Analytics Routes
 * 
 * Routes for analytics and reporting endpoints.
 */

const express = require('express');
const router = express.Router();

const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validateObjectId } = require('../validators/contact.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard summary
 * @access  Private
 * @query   period - Number of days (default: 30)
 */
router.get('/dashboard', analyticsController.getDashboard);

/**
 * @route   GET /api/analytics/trends
 * @desc    Get daily trend data
 * @access  Private
 * @query   days - Number of days (default: 30)
 */
router.get('/trends', analyticsController.getDailyTrend);

/**
 * @route   GET /api/analytics/lists
 * @desc    Get list health metrics
 * @access  Private
 */
router.get('/lists', analyticsController.getListHealth);

/**
 * @route   POST /api/analytics/compare
 * @desc    Compare multiple campaigns
 * @access  Private
 * @body    campaignIds - Array of campaign IDs
 */
router.post('/compare', analyticsController.compareCampaigns);

/**
 * @route   GET /api/analytics/campaigns/:id
 * @desc    Get detailed campaign analytics
 * @access  Private
 */
router.get(
    '/campaigns/:id',
    validateObjectId('id'),
    analyticsController.getCampaignAnalytics
);

/**
 * @route   GET /api/analytics/campaigns/:id/hourly
 * @desc    Get hourly breakdown for campaign
 * @access  Private
 */
router.get(
    '/campaigns/:id/hourly',
    validateObjectId('id'),
    analyticsController.getHourlyBreakdown
);

/**
 * @route   GET /api/analytics/campaigns/:id/devices
 * @desc    Get device breakdown for campaign
 * @access  Private
 */
router.get(
    '/campaigns/:id/devices',
    validateObjectId('id'),
    analyticsController.getDeviceBreakdown
);

/**
 * @route   GET /api/analytics/campaigns/:id/ab-test
 * @desc    Get A/B test results
 * @access  Private
 */
router.get(
    '/campaigns/:id/ab-test',
    validateObjectId('id'),
    analyticsController.getABTestResults
);

/**
 * @route   GET /api/analytics/campaigns/:id/export
 * @desc    Export campaign analytics
 * @access  Private
 * @query   format - 'json' or 'csv'
 */
router.get(
    '/campaigns/:id/export',
    validateObjectId('id'),
    analyticsController.exportAnalytics
);

/**
 * @route   GET /api/analytics/contacts/:id/activity
 * @desc    Get contact email activity
 * @access  Private
 */
router.get(
    '/contacts/:id/activity',
    validateObjectId('id'),
    analyticsController.getContactActivity
);

module.exports = router;
