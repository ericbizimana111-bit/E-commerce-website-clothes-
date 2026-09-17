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
const deliveryController = require('../controllers/delivery.controller');
const { deliveryForOrderParamsSchema } = require('../validators/delivery.validator');

// Phase 7: customer delivery visibility for THEIR order (IDOR-safe:
// ownership resolved from the authenticated customer, never from the body)

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

// Phase 7: read-only fulfillment info for the customer's own order
router.get('/:id/delivery', validateRequest(deliveryForOrderParamsSchema), deliveryController.getMyOrderDelivery);

module.exports = router;
