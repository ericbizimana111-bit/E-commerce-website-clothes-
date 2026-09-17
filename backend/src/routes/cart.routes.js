const express = require('express');
const router = express.Router();

const { authenticateCustomer } = require('../middleware/auth');
const validateRequest = require('../middleware/requestValidator');
const cartController = require('../controllers/cart.controller');
const {
  addItemSchema,
  updateItemSchema,
  itemIdParamsSchema,
  cartLanguageQuerySchema,
} = require('../validators/cart.validator');

// Every cart route requires an authenticated CUSTOMER JWT.
// Admin tokens are a different auth context and are rejected here by design.
router.use(authenticateCustomer);

router.get('/', validateRequest(cartLanguageQuerySchema), cartController.getCart);
router.post('/items', validateRequest(addItemSchema), cartController.addItem);
router.patch('/items/:itemId', validateRequest(updateItemSchema), cartController.updateItem);
router.delete('/items/:itemId', validateRequest(itemIdParamsSchema), cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
