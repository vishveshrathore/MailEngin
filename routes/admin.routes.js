/**
 * Admin Routes
 * 
 * Routes for super admin operations.
 */

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin.controller');
const { authenticate, requireSuperAdmin } = require('../middlewares/auth.middleware');
const { validateObjectId } = require('../validators/contact.validator');

// All routes require authentication and super admin role
router.use(authenticate);
router.use(requireSuperAdmin);

// ==================== DASHBOARD ====================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard stats
 */
router.get('/dashboard', adminController.getDashboard);

// ==================== USERS ====================

/**
 * @route   GET /api/admin/users
 * @desc    Get all users
 */
router.get('/users', adminController.getUsers);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get user by ID
 */
router.get('/users/:id', validateObjectId('id'), adminController.getUser);

/**
 * @route   PATCH /api/admin/users/:id
 * @desc    Update user
 */
router.patch('/users/:id', validateObjectId('id'), adminController.updateUser);

/**
 * @route   POST /api/admin/users/:id/suspend
 * @desc    Suspend user
 */
router.post('/users/:id/suspend', validateObjectId('id'), adminController.suspendUser);

/**
 * @route   POST /api/admin/users/:id/reactivate
 * @desc    Reactivate user
 */
router.post('/users/:id/reactivate', validateObjectId('id'), adminController.reactivateUser);

// ==================== ORGANIZATIONS ====================

/**
 * @route   GET /api/admin/organizations
 * @desc    Get all organizations
 */
router.get('/organizations', adminController.getOrganizations);

/**
 * @route   GET /api/admin/organizations/:id
 * @desc    Get organization by ID
 */
router.get('/organizations/:id', validateObjectId('id'), adminController.getOrganization);

/**
 * @route   POST /api/admin/organizations/:id/suspend
 * @desc    Suspend organization
 */
router.post('/organizations/:id/suspend', validateObjectId('id'), adminController.suspendOrganization);

/**
 * @route   POST /api/admin/organizations/:id/reactivate
 * @desc    Reactivate organization
 */
router.post('/organizations/:id/reactivate', validateObjectId('id'), adminController.reactivateOrganization);

/**
 * @route   POST /api/admin/organizations/:id/change-plan
 * @desc    Change organization plan
 */
router.post('/organizations/:id/change-plan', validateObjectId('id'), adminController.changePlan);

/**
 * @route   POST /api/admin/organizations/:id/grant-credits
 * @desc    Grant email credits
 */
router.post('/organizations/:id/grant-credits', validateObjectId('id'), adminController.grantCredits);

// ==================== CAMPAIGNS ====================

/**
 * @route   GET /api/admin/campaigns
 * @desc    Get all campaigns
 */
router.get('/campaigns', adminController.getCampaigns);

/**
 * @route   POST /api/admin/campaigns/:id/flag
 * @desc    Flag campaign for review
 */
router.post('/campaigns/:id/flag', validateObjectId('id'), adminController.flagCampaign);

/**
 * @route   POST /api/admin/campaigns/:id/clear-flag
 * @desc    Clear campaign flag
 */
router.post('/campaigns/:id/clear-flag', validateObjectId('id'), adminController.clearCampaignFlag);

// ==================== ABUSE DETECTION ====================

/**
 * @route   GET /api/admin/abuse
 * @desc    Get abuse metrics overview
 */
router.get('/abuse', adminController.getAbuseMetrics);

/**
 * @route   GET /api/admin/abuse/high-bounce
 * @desc    Get orgs with high bounce rates
 */
router.get('/abuse/high-bounce', adminController.getHighBounceOrgs);

/**
 * @route   GET /api/admin/abuse/high-complaints
 * @desc    Get orgs with high complaint rates
 */
router.get('/abuse/high-complaints', adminController.getHighComplaintOrgs);

module.exports = router;
