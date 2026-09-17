const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/category.controller');
const validateRequest = require('../middleware/requestValidator');
const {
  publicCategoryQuerySchema,
  idParamSchema,
  slugParamSchema,
} = require('../validators/catalog.validator');

// Public category listing with optional language query: ?lang=lg
router.get('/', validateRequest(publicCategoryQuerySchema), categoryController.listPublicCategories);

// Public category by slug
router.get('/slug/:slug', validateRequest(slugParamSchema), validateRequest(publicCategoryQuerySchema), categoryController.getPublicCategoryBySlug);

// Public category by ID
router.get('/:id', validateRequest(idParamSchema), validateRequest(publicCategoryQuerySchema), categoryController.getPublicCategoryById);

module.exports = router;
