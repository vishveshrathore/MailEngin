/**
 * Webhook Routes
 * 
 * Routes for handling external webhooks (AWS SES/SNS, Stripe, etc.)
 */

const express = require('express');
const router = express.Router();

const webhookController = require('../controllers/webhook.controller');

/**
 * SNS sends JSON as text/plain, need special handling
 */
const snsBodyParser = express.json({
    type: ['text/plain', 'application/json'],
    limit: '1mb',
});

/**
 * @route   POST /api/webhooks/ses
 * @desc    Handle AWS SES notifications via SNS
 * @access  Public (verified by SNS signature)
 */
router.post('/ses', snsBodyParser, webhookController.handleSESWebhook);

/**
 * @route   POST /api/webhooks/ses/bounce
 * @desc    Handle bounce notifications (alternative endpoint)
 * @access  Public
 */
router.post('/ses/bounce', snsBodyParser, webhookController.handleSESWebhook);

/**
 * @route   POST /api/webhooks/ses/complaint
 * @desc    Handle complaint notifications (alternative endpoint)
 * @access  Public
 */
router.post('/ses/complaint', snsBodyParser, webhookController.handleSESWebhook);

/**
 * @route   POST /api/webhooks/ses/delivery
 * @desc    Handle delivery notifications (alternative endpoint)
 * @access  Public
 */
router.post('/ses/delivery', snsBodyParser, webhookController.handleSESWebhook);

module.exports = router;
