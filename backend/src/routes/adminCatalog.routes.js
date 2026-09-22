const express = require('express');
const router = express.Router();

const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');

const categoryController = require('../controllers/category.controller');
const productController = require('../controllers/product.controller');
const inventoryController = require('../controllers/inventory.controller');
const imageController = require('../controllers/image.controller');
const { uploadProductImageMiddleware } = require('../config/upload');

const {
  idParamSchema,
  imageIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
  toggleCategoryActiveSchema,
  createProductSchema,
  updateProductSchema,
  toggleProductActiveSchema,
  setProductImagesSchema,
  restockInventorySchema,
  adjustInventorySchema,
} = require('../validators/catalog.validator');

// All admin catalog routes require valid admin authentication
router.use(authenticateAdmin);

// DISPATCHER cannot manage catalog or inventory - only ADMIN and SUPER_ADMIN are authorized
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// -------------------------------------------------------------
// Category Management
// -------------------------------------------------------------
router.get('/categories', categoryController.listAdminCategories);
router.post('/categories', validateRequest(createCategorySchema), categoryController.createCategory);
router.put('/categories/:id', validateRequest(updateCategorySchema), categoryController.updateCategory);
router.patch('/categories/:id/active', validateRequest(toggleCategoryActiveSchema), categoryController.toggleCategoryActive);

// Category image file upload/removal (multipart, same validation as product images)
router.post('/categories/:id/image', validateRequest(idParamSchema), uploadProductImageMiddleware, categoryController.uploadCategoryImage);
router.delete('/categories/:id/image', validateRequest(idParamSchema), categoryController.removeCategoryImage);

// -------------------------------------------------------------
// Product Management
// -------------------------------------------------------------
router.get('/products', productController.listAdminProducts);
router.get('/products/:id', validateRequest(idParamSchema), productController.getAdminProductById);
router.post('/products', validateRequest(createProductSchema), productController.createProduct);
router.put('/products/:id', validateRequest(updateProductSchema), productController.updateProduct);
router.patch('/products/:id/active', validateRequest(toggleProductActiveSchema), productController.toggleProductActive);
router.put('/products/:id/images', validateRequest(setProductImagesSchema), productController.setProductImages);

// Product image file upload/removal (multipart). RBAC: same ADMIN/SUPER_ADMIN
// gate applied router-wide above; no additional roles are introduced here.
router.post('/products/:id/images', uploadProductImageMiddleware, imageController.uploadProductImage);
router.delete('/products/:id/images/:imageId', validateRequest(imageIdParamSchema), imageController.deleteProductImage);

// -------------------------------------------------------------
// Inventory Management
// -------------------------------------------------------------
router.post('/products/:id/inventory/restock', validateRequest(restockInventorySchema), inventoryController.restock);
router.post('/products/:id/inventory/adjust', validateRequest(adjustInventorySchema), inventoryController.adjustStock);
router.get('/products/:id/inventory/history', inventoryController.getHistory);
router.get('/products/:id/inventory/check', inventoryController.checkStock);

module.exports = router;
