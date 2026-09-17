const express = require('express');
const router = express.Router();

const { authenticateCustomer } = require('../middleware/auth');
const validateRequest = require('../middleware/requestValidator');
const orderController = require('../controllers/order.controller');
const {
  createOrderSchema,
  orderLanguageQuerySchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  cancelOrderSchema,
} = require('../validators/order.validator');
const {
  initiatePaymentSchema,
  paymentParamsSchema,
} = require('../validators/payment.validator');
const paymentController = require('../controllers/payment.controller');

// All customer order routes require a customer JWT
router.use(authenticateCustomer);

router.post('/', validateRequest(createOrderSchema), orderController.createOrder);
router.get('/', validateRequest(listOrdersQuerySchema), orderController.listOrders);
router.get('/:id', validateRequest(orderIdParamsSchema), validateRequest(orderLanguageQuerySchema), orderController.getOrder);
router.post('/:id/cancel', validateRequest(cancelOrderSchema), orderController.cancelOrder);

// Phase 6: commitment payment for this order (server-authoritative amount;
// only signed provider webhooks can complete verification)
router.post('/:id/payment', validateRequest(initiatePaymentSchema), paymentController.initiatePayment);
router.get('/:id/payment', validateRequest(paymentParamsSchema), paymentController.getOrderPayment);

module.exports = router;
