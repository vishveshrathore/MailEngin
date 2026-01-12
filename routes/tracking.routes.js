/**
 * Tracking Routes
 * 
 * Public routes for email tracking (opens, clicks, unsubscribes).
 * These routes are accessed from within email clients.
 */

const express = require('express');
const router = express.Router();

const trackingController = require('../controllers/tracking.controller');

/**
 * @route   GET /t/o/:trackingId
 * @desc    Open tracking pixel (1x1 transparent GIF)
 * @access  Public
 */
router.get('/o/:trackingId', trackingController.trackOpen.bind(trackingController));

/**
 * @route   GET /t/c/:trackingId/:linkIndex
 * @desc    Click tracking redirect
 * @access  Public
 * @query   url - Fallback URL if not found in database
 */
router.get('/c/:trackingId/:linkIndex', trackingController.trackClick.bind(trackingController));

/**
 * @route   GET /t/u/:trackingId
 * @desc    Unsubscribe tracking
 * @access  Public
 * @query   reason - Optional unsubscribe reason
 */
router.get('/u/:trackingId', trackingController.trackUnsubscribe.bind(trackingController));

/**
 * @route   GET /t/v/:trackingId
 * @desc    View in browser redirect
 * @access  Public
 */
router.get('/v/:trackingId', trackingController.viewInBrowser.bind(trackingController));

module.exports = router;
