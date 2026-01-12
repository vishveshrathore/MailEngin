/**
 * Automation Worker
 * 
 * Processes automation workflows - executes triggers, checks conditions,
 * sends emails, and handles delays.
 */

const cron = require('node-cron');
const Automation = require('../models/Automation.model');
const Contact = require('../models/Contact.model');
const Template = require('../models/Template.model');
const EmailLog = require('../models/EmailLog.model');
const { emailQueue } = require('../queues');
const trackingService = require('../services/tracking.service');
const mongoose = require('mongoose');

// Batch size for processing contacts
const BATCH_SIZE = 100;

class AutomationWorker {
    constructor() {
        this.running = false;
    }

    /**
     * Start the automation processor
     */
    start() {
        // Process automations every minute
        cron.schedule('* * * * *', async () => {
            if (!this.running) {
                this.running = true;
                try {
                    await this.processAutomations();
                } catch (error) {
                    console.error('❌ Automation worker error:', error.message);
                } finally {
                    this.running = false;
                }
            }
        });

        console.log('🤖 Automation worker started');
    }

    /**
     * Process all active automations
     */
    async processAutomations() {
        const automations = await Automation.find({
            status: 'active',
        });

        for (const automation of automations) {
            try {
                await this.processAutomation(automation);
            } catch (error) {
                console.error(`❌ Error processing automation ${automation.name}:`, error.message);
            }
        }
    }

    /**
     * Process a single automation
     */
    async processAutomation(automation) {
        // Find contacts ready for next action
        const now = new Date();

        const contacts = await Contact.find({
            orgId: automation.orgId,
            'automations': {
                $elemMatch: {
                    automationId: automation._id,
                    status: 'active',
                    nextActionAt: { $lte: now },
                },
            },
        }).limit(BATCH_SIZE);

        if (contacts.length === 0) return;

        console.log(`🤖 Processing ${contacts.length} contacts for automation: ${automation.name}`);

        for (const contact of contacts) {
            try {
                await this.processContactInAutomation(automation, contact);
            } catch (error) {
                console.error(`❌ Error processing contact ${contact.email}:`, error.message);

                // Mark contact as errored
                await this.updateContactAutomationStatus(
                    contact._id,
                    automation._id,
                    'error',
                    { error: error.message }
                );
            }
        }
    }

    /**
     * Process a contact's next step in automation
     */
    async processContactInAutomation(automation, contact) {
        // Get contact's automation state
        const autoState = contact.automations.find(
            a => a.automationId.toString() === automation._id.toString()
        );

        if (!autoState) return;

        const currentStepIndex = autoState.currentStep || 0;
        const steps = automation.steps || [];

        // Check if automation is complete
        if (currentStepIndex >= steps.length) {
            await this.completeAutomation(contact, automation);
            return;
        }

        const step = steps[currentStepIndex];

        // Check step conditions
        const conditionsMet = await this.checkConditions(step.conditions, contact, automation);
        if (!conditionsMet) {
            // Skip to next step or exit based on condition settings
            if (step.conditionAction === 'skip') {
                await this.advanceToNextStep(contact, automation, currentStepIndex);
            } else {
                await this.updateContactAutomationStatus(
                    contact._id,
                    automation._id,
                    'exited',
                    { exitReason: 'condition_not_met' }
                );
            }
            return;
        }

        // Execute the step
        await this.executeStep(step, contact, automation);

        // Advance to next step
        await this.advanceToNextStep(contact, automation, currentStepIndex);
    }

    /**
     * Execute an automation step
     */
    async executeStep(step, contact, automation) {
        console.log(`▶️ Executing step: ${step.name} (${step.type}) for ${contact.email}`);

        switch (step.type) {
            case 'email':
                await this.executeSendEmail(step, contact, automation);
                break;

            case 'delay':
                // Delay is handled in advanceToNextStep
                break;

            case 'condition':
                // Already checked in processContactInAutomation
                break;

            case 'update_contact':
                await this.executeUpdateContact(step, contact);
                break;

            case 'add_tag':
                await this.executeAddTag(step, contact);
                break;

            case 'remove_tag':
                await this.executeRemoveTag(step, contact);
                break;

            case 'add_to_list':
                await this.executeAddToList(step, contact);
                break;

            case 'remove_from_list':
                await this.executeRemoveFromList(step, contact);
                break;

            case 'webhook':
                await this.executeWebhook(step, contact, automation);
                break;

            case 'notify':
                await this.executeNotify(step, contact, automation);
                break;

            default:
                console.warn(`Unknown step type: ${step.type}`);
        }

        // Update step stats
        await Automation.updateOne(
            { _id: automation._id, 'steps._id': step._id },
            { $inc: { 'steps.$.stats.executed': 1 } }
        );
    }

    /**
     * Execute send email step
     */
    async executeSendEmail(step, contact, automation) {
        const template = await Template.findById(step.config.templateId);
        if (!template) {
            throw new Error('Template not found');
        }

        // Generate tracking ID
        const trackingId = EmailLog.generateTrackingId();

        // Render email content
        const contactData = {
            contact: {
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                email: contact.email,
                company: contact.company || '',
                ...Object.fromEntries(contact.customFields || new Map()),
            },
            unsubscribe_link: `{{unsubscribe_link}}`,
            current_year: new Date().getFullYear().toString(),
        };

        let html = template.htmlContent;
        let subject = step.config.subject || template.subject;

        // Replace variables
        html = this.replaceVariables(html, contactData);
        subject = this.replaceVariables(subject, contactData);

        // Process for tracking
        const processed = trackingService.processEmailContent(html, {
            trackingId,
            enableOpenTracking: automation.settings?.trackOpens !== false,
            enableClickTracking: automation.settings?.trackClicks !== false,
        });

        // Create email log
        await EmailLog.create({
            orgId: automation.orgId,
            contactId: contact._id,
            email: contact.email,
            trackingId,
            type: 'automation',
            automationId: automation._id,
            status: 'queued',
            trackedLinks: processed.trackedLinks,
        });

        // Queue the email
        await emailQueue.add('send-email', {
            orgId: automation.orgId.toString(),
            contactId: contact._id.toString(),
            email: contact.email,
            subject,
            html: processed.html,
            text: template.textContent,
            from: step.config.fromEmail || process.env.EMAIL_FROM_ADDRESS,
            fromName: step.config.fromName || process.env.EMAIL_FROM_NAME,
            replyTo: step.config.replyTo,
            trackingId,
            automationId: automation._id.toString(),
        }, {
            priority: 2,
        });

        // Update automation stats
        await Automation.updateOne(
            { _id: automation._id },
            { $inc: { 'stats.emailsSent': 1 } }
        );

        console.log(`📧 Queued automation email to ${contact.email}`);
    }

    /**
     * Execute update contact step
     */
    async executeUpdateContact(step, contact) {
        const updates = step.config.updates || {};
        await Contact.updateOne({ _id: contact._id }, updates);
    }

    /**
     * Execute add tag step
     */
    async executeAddTag(step, contact) {
        const tags = step.config.tags || [];
        await Contact.updateOne(
            { _id: contact._id },
            { $addToSet: { tags: { $each: tags } } }
        );
    }

    /**
     * Execute remove tag step
     */
    async executeRemoveTag(step, contact) {
        const tags = step.config.tags || [];
        await Contact.updateOne(
            { _id: contact._id },
            { $pull: { tags: { $in: tags } } }
        );
    }

    /**
     * Execute add to list step
     */
    async executeAddToList(step, contact) {
        const listId = step.config.listId;
        await Contact.updateOne(
            { _id: contact._id },
            {
                $addToSet: {
                    lists: {
                        listId,
                        status: 'active',
                        addedAt: new Date(),
                    },
                },
            }
        );
    }

    /**
     * Execute remove from list step
     */
    async executeRemoveFromList(step, contact) {
        const listId = step.config.listId;
        await Contact.updateOne(
            { _id: contact._id },
            { $pull: { lists: { listId } } }
        );
    }

    /**
     * Execute webhook step
     */
    async executeWebhook(step, contact, automation) {
        const { webhookQueue } = require('../queues');

        await webhookQueue.add('send-webhook', {
            url: step.config.url,
            method: step.config.method || 'POST',
            headers: step.config.headers || {},
            payload: {
                contact: {
                    id: contact._id,
                    email: contact.email,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                },
                automation: {
                    id: automation._id,
                    name: automation.name,
                },
                step: step.name,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Execute notify step (internal notification)
     */
    async executeNotify(step, contact, automation) {
        // This would integrate with notification system
        console.log(`📢 Notification: ${step.config.message} for ${contact.email}`);
    }

    /**
     * Advance contact to next step
     */
    async advanceToNextStep(contact, automation, currentStepIndex) {
        const steps = automation.steps || [];
        const nextStepIndex = currentStepIndex + 1;

        // Check if automation is complete
        if (nextStepIndex >= steps.length) {
            await this.completeAutomation(contact, automation);
            return;
        }

        const nextStep = steps[nextStepIndex];

        // Calculate next action time
        let nextActionAt = new Date();

        if (nextStep.type === 'delay') {
            nextActionAt = this.calculateDelay(nextStep.config);
        }

        // Update contact's automation state
        await Contact.updateOne(
            {
                _id: contact._id,
                'automations.automationId': automation._id,
            },
            {
                $set: {
                    'automations.$.currentStep': nextStepIndex,
                    'automations.$.nextActionAt': nextActionAt,
                    'automations.$.lastActionAt': new Date(),
                },
            }
        );
    }

    /**
     * Calculate delay based on config
     */
    calculateDelay(config) {
        const now = new Date();
        const { value, unit } = config;

        switch (unit) {
            case 'minutes':
                return new Date(now.getTime() + value * 60 * 1000);
            case 'hours':
                return new Date(now.getTime() + value * 60 * 60 * 1000);
            case 'days':
                return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
            case 'weeks':
                return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() + value * 60 * 1000); // Default to minutes
        }
    }

    /**
     * Complete automation for contact
     */
    async completeAutomation(contact, automation) {
        await this.updateContactAutomationStatus(
            contact._id,
            automation._id,
            'completed',
            { completedAt: new Date() }
        );

        // Update automation stats
        await Automation.updateOne(
            { _id: automation._id },
            {
                $inc: {
                    'stats.currentlyActive': -1,
                    'stats.totalCompleted': 1,
                },
            }
        );

        console.log(`✅ Automation completed for ${contact.email}`);
    }

    /**
     * Update contact's automation status
     */
    async updateContactAutomationStatus(contactId, automationId, status, extra = {}) {
        await Contact.updateOne(
            {
                _id: contactId,
                'automations.automationId': automationId,
            },
            {
                $set: {
                    'automations.$.status': status,
                    ...Object.fromEntries(
                        Object.entries(extra).map(([k, v]) => [`automations.$.${k}`, v])
                    ),
                },
            }
        );
    }

    /**
     * Check step conditions
     */
    async checkConditions(conditions, contact, automation) {
        if (!conditions || conditions.length === 0) {
            return true;
        }

        for (const condition of conditions) {
            const result = await this.evaluateCondition(condition, contact);
            if (!result) {
                return false; // AND logic - all conditions must pass
            }
        }

        return true;
    }

    /**
     * Evaluate a single condition
     */
    async evaluateCondition(condition, contact) {
        const { field, operator, value } = condition;

        // Get field value from contact
        let fieldValue = this.getNestedValue(contact, field);

        switch (operator) {
            case 'equals':
                return fieldValue === value;
            case 'not_equals':
                return fieldValue !== value;
            case 'contains':
                return String(fieldValue).includes(value);
            case 'not_contains':
                return !String(fieldValue).includes(value);
            case 'greater_than':
                return Number(fieldValue) > Number(value);
            case 'less_than':
                return Number(fieldValue) < Number(value);
            case 'is_set':
                return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
            case 'is_not_set':
                return fieldValue === undefined || fieldValue === null || fieldValue === '';
            case 'in_list':
                return Array.isArray(value) && value.includes(fieldValue);
            case 'has_tag':
                return contact.tags?.includes(value);
            case 'opened_email':
                return contact.engagement?.emailsOpened > 0;
            case 'clicked_email':
                return contact.engagement?.emailsClicked > 0;
            default:
                return true;
        }
    }

    /**
     * Get nested value from object
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    /**
     * Replace variables in content
     */
    replaceVariables(content, data) {
        return content.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = this.getNestedValue(data, path.trim());
            return value !== undefined ? value : match;
        });
    }
}

// Export singleton instance
const automationWorker = new AutomationWorker();
module.exports = automationWorker;
