/**
 * Campaign Routes
 * 
 * All routes for campaign management.
 */

const express = require('express');
const router = express.Router();

const campaignController = require('../controllers/campaign.controller');
const { authenticate, requirePermission } = require('../middlewares/auth.middleware');
const {
    validateCreateCampaign,
    validateUpdateCampaign,
    validateRecipients,
    validateSchedule,
} = require('../validators/campaign.validator');
const { validateObjectId } = require('../validators/contact.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/campaigns/stats
 * @desc    Get campaign statistics
 * @access  Private
 */
router.get('/stats', campaignController.getStats);

/**
 * @route   GET /api/campaigns
 * @desc    Get all campaigns with filters
 * @access  Private
 */
router.get('/', campaignController.getAll);

/**
 * @route   POST /api/campaigns
 * @desc    Create a new campaign
 * @access  Private
 */
router.post(
    '/',
    requirePermission('campaigns', 'create'),
    validateCreateCampaign,
    campaignController.create
);

/**
 * @route   GET /api/campaigns/:id
 * @desc    Get campaign by ID
 * @access  Private
 */
router.get('/:id', validateObjectId('id'), campaignController.getById);

/**
 * @route   PATCH /api/campaigns/:id
 * @desc    Update campaign
 * @access  Private
 */
router.patch(
    '/:id',
    validateObjectId('id'),
    requirePermission('campaigns', 'edit'),
    validateUpdateCampaign,
    campaignController.update
);

/**
 * @route   DELETE /api/campaigns/:id
 * @desc    Delete campaign
 * @access  Private
 */
router.delete(
    '/:id',
    validateObjectId('id'),
    requirePermission('campaigns', 'delete'),
    campaignController.delete
);

/**
 * @route   POST /api/campaigns/:id/duplicate
 * @desc    Duplicate campaign
 * @access  Private
 */
router.post(
    '/:id/duplicate',
    validateObjectId('id'),
    requirePermission('campaigns', 'create'),
    campaignController.duplicate
);

/**
 * @route   PUT /api/campaigns/:id/recipients
 * @desc    Set campaign recipients
 * @access  Private
 */
router.put(
    '/:id/recipients',
    validateObjectId('id'),
    requirePermission('campaigns', 'edit'),
    validateRecipients,
    campaignController.setRecipients
);

/**
 * @route   GET /api/campaigns/:id/recipients
 * @desc    Get recipient preview
 * @access  Private
 */
router.get(
    '/:id/recipients',
    validateObjectId('id'),
    campaignController.getRecipientPreview
);

/**
 * @route   POST /api/campaigns/:id/calculate-recipients
 * @desc    Calculate estimated recipients
 * @access  Private
 */
router.post(
    '/:id/calculate-recipients',
    validateObjectId('id'),
    campaignController.calculateRecipients
);

/**
 * @route   POST /api/campaigns/:id/validate
 * @desc    Validate campaign is ready for sending
 * @access  Private
 */
router.post(
    '/:id/validate',
    validateObjectId('id'),
    campaignController.validate
);

/**
 * @route   POST /api/campaigns/:id/schedule
 * @desc    Schedule campaign
 * @access  Private
 */
router.post(
    '/:id/schedule',
    validateObjectId('id'),
    requirePermission('campaigns', 'send'),
    validateSchedule,
    campaignController.schedule
);

/**
 * @route   POST /api/campaigns/:id/send
 * @desc    Send campaign immediately
 * @access  Private
 */
router.post(
    '/:id/send',
    validateObjectId('id'),
    requirePermission('campaigns', 'send'),
    campaignController.sendNow
);

/**
 * @route   POST /api/campaigns/:id/pause
 * @desc    Pause campaign
 * @access  Private
 */
router.post(
    '/:id/pause',
    validateObjectId('id'),
    requirePermission('campaigns', 'send'),
    campaignController.pause
);

/**
 * @route   POST /api/campaigns/:id/resume
 * @desc    Resume campaign
 * @access  Private
 */
router.post(
    '/:id/resume',
    validateObjectId('id'),
    requirePermission('campaigns', 'send'),
    campaignController.resume
);

/**
 * @route   POST /api/campaigns/:id/cancel
 * @desc    Cancel campaign
 * @access  Private
 */
router.post(
    '/:id/cancel',
    validateObjectId('id'),
    requirePermission('campaigns', 'send'),
    campaignController.cancel
);

/**
 * @route   GET /api/campaigns/:id/analytics
 * @desc    Get campaign analytics
 * @access  Private
 */
router.get(
    '/:id/analytics',
    validateObjectId('id'),
    campaignController.getAnalytics
);

/**
 * @route   GET /api/campaigns/:id/activity
 * @desc    Get campaign activity/events
 * @access  Private
 */
router.get(
    '/:id/activity',
    validateObjectId('id'),
    campaignController.getActivity
);

module.exports = router;
