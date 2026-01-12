const express = require('express');
const router = express.Router();

const webhookController = require('../controllers/webhook.controller');

const snsBodyParser = express.json({
    type: ['text/plain', 'application/json'],
    limit: '1mb',
});

router.post('/ses', snsBodyParser, webhookController.handleSESWebhook);
router.post('/ses/bounce', snsBodyParser, webhookController.handleSESWebhook);
router.post('/ses/complaint', snsBodyParser, webhookController.handleSESWebhook);
router.post('/ses/delivery', snsBodyParser, webhookController.handleSESWebhook);

module.exports = router;
