/**
 * Template Routes
 * 
 * All routes for template management.
 */

const express = require('express');
const router = express.Router();

const templateController = require('../controllers/template.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const {
    validateCreateTemplate,
    validateUpdateTemplate,
    validateVariant,
} = require('../validators/template.validator');
const { validateObjectId } = require('../validators/contact.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/templates/stats
 * @desc    Get template statistics
 * @access  Private
 */
router.get('/stats', templateController.getStats);

/**
 * @route   GET /api/templates/categories
 * @desc    Get all categories
 * @access  Private
 */
router.get('/categories', templateController.getCategories);

/**
 * @route   GET /api/templates/tags
 * @desc    Get all unique tags
 * @access  Private
 */
router.get('/tags', templateController.getTags);

/**
 * @route   POST /api/templates/validate
 * @desc    Validate HTML content
 * @access  Private
 */
router.post('/validate', templateController.validateHtml);

/**
 * @route   POST /api/templates/preview-html
 * @desc    Preview raw HTML with sample data (without saving)
 * @access  Private
 */
router.post('/preview-html', templateController.previewHtml);

/**
 * @route   GET /api/templates
 * @desc    Get all templates with filters
 * @access  Private
 */
router.get('/', templateController.getAll);

/**
 * @route   POST /api/templates
 * @desc    Create a new template
 * @access  Private
 */
router.post('/', validateCreateTemplate, templateController.create);

/**
 * @route   GET /api/templates/:id
 * @desc    Get template by ID
 * @access  Private
 */
router.get('/:id', validateObjectId('id'), templateController.getById);

/**
 * @route   PATCH /api/templates/:id
 * @desc    Update template
 * @access  Private
 */
router.patch(
    '/:id',
    validateObjectId('id'),
    validateUpdateTemplate,
    templateController.update
);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete template
 * @access  Private
 */
router.delete('/:id', validateObjectId('id'), templateController.delete);

/**
 * @route   POST /api/templates/:id/duplicate
 * @desc    Duplicate template
 * @access  Private
 */
router.post('/:id/duplicate', validateObjectId('id'), templateController.duplicate);

/**
 * @route   PATCH /api/templates/:id/status
 * @desc    Update template status
 * @access  Private
 */
router.patch('/:id/status', validateObjectId('id'), templateController.updateStatus);

/**
 * @route   GET /api/templates/:id/versions
 * @desc    Get template versions
 * @access  Private
 */
router.get('/:id/versions', validateObjectId('id'), templateController.getVersions);

/**
 * @route   POST /api/templates/:id/versions/:version/restore
 * @desc    Restore a specific version
 * @access  Private
 */
router.post(
    '/:id/versions/:version/restore',
    validateObjectId('id'),
    templateController.restoreVersion
);

/**
 * @route   GET /api/templates/:id/variables
 * @desc    Extract variables from template
 * @access  Private
 */
router.get('/:id/variables', validateObjectId('id'), templateController.getVariables);

/**
 * @route   POST /api/templates/:id/preview
 * @desc    Preview template with sample data
 * @access  Private
 */
router.post('/:id/preview', validateObjectId('id'), templateController.preview);

/**
 * @route   POST /api/templates/:id/variants
 * @desc    Add A/B variant
 * @access  Private
 */
router.post(
    '/:id/variants',
    validateObjectId('id'),
    validateVariant,
    templateController.addVariant
);

/**
 * @route   DELETE /api/templates/:id/variants/:index
 * @desc    Remove A/B variant
 * @access  Private
 */
router.delete(
    '/:id/variants/:index',
    validateObjectId('id'),
    templateController.removeVariant
);

module.exports = router;
