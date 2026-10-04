const express = require('express');
const router = express.Router();

const productController = require('../controllers/product.controller');
const validateRequest = require('../middleware/requestValidator');
const {
  publicProductQuerySchema,
  idParamSchema,
  slugParamSchema,
} = require('../validators/catalog.validator');

// Public product listing with search, filters, pagination, and language
router.get('/', validateRequest(publicProductQuerySchema), productController.listPublicProducts);

// Sidebar filter facets (brands, price range), optionally per category
router.get('/facets', productController.getPublicFacets);

// Public product by slug
router.get('/slug/:slug', validateRequest(slugParamSchema), validateRequest(publicProductQuerySchema), productController.getPublicProductBySlug);

// Public product by ID
router.get('/:id', validateRequest(idParamSchema), validateRequest(publicProductQuerySchema), productController.getPublicProductById);

module.exports = router;
