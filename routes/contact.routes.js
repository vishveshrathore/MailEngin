/**
 * Contact Routes
 * 
 * All routes for contact management.
 */

const express = require('express');
const router = express.Router();

const contactController = require('../controllers/contact.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { uploadCSV, handleUploadError } = require('../middlewares/upload.middleware');
const {
    validateCreateContact,
    validateUpdateContact,
    validateObjectId,
} = require('../validators/contact.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/contacts/stats
 * @desc    Get contact statistics
 * @access  Private
 */
router.get('/stats', contactController.getStats);

/**
 * @route   GET /api/contacts/tags
 * @desc    Get all unique tags
 * @access  Private
 */
router.get('/tags', contactController.getAllTags);

/**
 * @route   GET /api/contacts/duplicates
 * @desc    Find duplicate contacts
 * @access  Private
 */
router.get('/duplicates', contactController.findDuplicates);

/**
 * @route   GET /api/contacts/export
 * @desc    Export contacts to CSV
 * @access  Private
 */
router.get('/export', contactController.exportCSV);

/**
 * @route   POST /api/contacts/import
 * @desc    Import contacts from CSV
 * @access  Private
 */
router.post(
    '/import',
    uploadCSV.single('file'),
    handleUploadError,
    contactController.importCSV
);

/**
 * @route   POST /api/contacts/merge
 * @desc    Merge duplicate contacts
 * @access  Private
 */
router.post('/merge', contactController.mergeDuplicates);

/**
 * @route   POST /api/contacts/bulk-delete
 * @desc    Bulk delete contacts
 * @access  Private
 */
router.post('/bulk-delete', contactController.bulkDelete);

/**
 * @route   POST /api/contacts/bulk-tags
 * @desc    Bulk add tags to contacts
 * @access  Private
 */
router.post('/bulk-tags', contactController.bulkAddTags);

/**
 * @route   GET /api/contacts
 * @desc    Get all contacts with filters
 * @access  Private
 */
router.get('/', contactController.getAll);

/**
 * @route   POST /api/contacts
 * @desc    Create a new contact
 * @access  Private
 */
router.post('/', validateCreateContact, contactController.create);

/**
 * @route   GET /api/contacts/:id
 * @desc    Get contact by ID
 * @access  Private
 */
router.get('/:id', validateObjectId('id'), contactController.getById);

/**
 * @route   PATCH /api/contacts/:id
 * @desc    Update contact
 * @access  Private
 */
router.patch(
    '/:id',
    validateObjectId('id'),
    validateUpdateContact,
    contactController.update
);

/**
 * @route   DELETE /api/contacts/:id
 * @desc    Delete contact
 * @access  Private
 */
router.delete('/:id', validateObjectId('id'), contactController.delete);

/**
 * @route   POST /api/contacts/:id/tags
 * @desc    Add tags to contact
 * @access  Private
 */
router.post('/:id/tags', validateObjectId('id'), contactController.addTags);

/**
 * @route   DELETE /api/contacts/:id/tags
 * @desc    Remove tags from contact
 * @access  Private
 */
router.delete('/:id/tags', validateObjectId('id'), contactController.removeTags);

/**
 * @route   POST /api/contacts/:id/lists/:listId
 * @desc    Add contact to list
 * @access  Private
 */
router.post(
    '/:id/lists/:listId',
    validateObjectId('id'),
    validateObjectId('listId'),
    contactController.addToList
);

/**
 * @route   DELETE /api/contacts/:id/lists/:listId
 * @desc    Remove contact from list
 * @access  Private
 */
router.delete(
    '/:id/lists/:listId',
    validateObjectId('id'),
    validateObjectId('listId'),
    contactController.removeFromList
);

/**
 * @route   POST /api/contacts/:id/unsubscribe
 * @desc    Unsubscribe contact
 * @access  Private
 */
router.post('/:id/unsubscribe', validateObjectId('id'), contactController.unsubscribe);

/**
 * @route   POST /api/contacts/:id/resubscribe
 * @desc    Resubscribe contact
 * @access  Private
 */
router.post('/:id/resubscribe', validateObjectId('id'), contactController.resubscribe);

module.exports = router;
