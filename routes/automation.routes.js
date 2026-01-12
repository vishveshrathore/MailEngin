/**
 * Automation Routes
 * 
 * Routes for automation (workflow) management.
 */

const express = require('express');
const router = express.Router();

const automationController = require('../controllers/automation.controller');
const { authenticate, requirePermission } = require('../middlewares/auth.middleware');
const { validateObjectId } = require('../validators/contact.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/automations/stats
 * @desc    Get automation statistics
 * @access  Private
 */
router.get('/stats', automationController.getStats);

/**
 * @route   GET /api/automations
 * @desc    Get all automations
 * @access  Private
 */
router.get('/', automationController.getAll);

/**
 * @route   POST /api/automations
 * @desc    Create a new automation
 * @access  Private
 */
router.post(
    '/',
    requirePermission('automations', 'create'),
    automationController.create
);

/**
 * @route   GET /api/automations/:id
 * @desc    Get automation by ID
 * @access  Private
 */
router.get('/:id', validateObjectId('id'), automationController.getById);

/**
 * @route   PATCH /api/automations/:id
 * @desc    Update automation
 * @access  Private
 */
router.patch(
    '/:id',
    validateObjectId('id'),
    requirePermission('automations', 'edit'),
    automationController.update
);

/**
 * @route   DELETE /api/automations/:id
 * @desc    Delete automation
 * @access  Private
 */
router.delete(
    '/:id',
    validateObjectId('id'),
    requirePermission('automations', 'delete'),
    automationController.delete
);

/**
 * @route   POST /api/automations/:id/activate
 * @desc    Activate automation
 * @access  Private
 */
router.post(
    '/:id/activate',
    validateObjectId('id'),
    requirePermission('automations', 'edit'),
    automationController.activate
);

/**
 * @route   POST /api/automations/:id/pause
 * @desc    Pause automation
 * @access  Private
 */
router.post(
    '/:id/pause',
    validateObjectId('id'),
    requirePermission('automations', 'edit'),
    automationController.pause
);

/**
 * @route   POST /api/automations/:id/duplicate
 * @desc    Duplicate automation
 * @access  Private
 */
router.post(
    '/:id/duplicate',
    validateObjectId('id'),
    requirePermission('automations', 'create'),
    automationController.duplicate
);

/**
 * @route   GET /api/automations/:id/contacts
 * @desc    Get enrolled contacts
 * @access  Private
 */
router.get(
    '/:id/contacts',
    validateObjectId('id'),
    automationController.getEnrolledContacts
);

/**
 * @route   POST /api/automations/:id/contacts
 * @desc    Manually enroll contact
 * @access  Private
 */
router.post(
    '/:id/contacts',
    validateObjectId('id'),
    requirePermission('automations', 'edit'),
    automationController.enrollContact
);

/**
 * @route   DELETE /api/automations/:id/contacts/:contactId
 * @desc    Remove contact from automation
 * @access  Private
 */
router.delete(
    '/:id/contacts/:contactId',
    validateObjectId('id'),
    requirePermission('automations', 'edit'),
    automationController.removeContact
);

module.exports = router;
