const express = require('express');
const router = express.Router();

const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const orderController = require('../controllers/order.controller');
const {
  listOrdersQuerySchema,
  orderIdParamsSchema,
  adminUpdateStatusSchema,
} = require('../validators/order.validator');
const { adminPaymentParamsSchema } = require('../validators/payment.validator');
const paymentController = require('../controllers/payment.controller');

// All admin order routes require an admin JWT.
// DISPATCHER may view orders and advance delivery statuses (their operational role);
// destructive/cancel transitions still pass through the centralized transition map.
router.use(authenticateAdmin);
router.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

router.get('/', validateRequest(listOrdersQuerySchema), orderController.adminListOrders);
router.get('/:id', validateRequest(orderIdParamsSchema), orderController.adminGetOrder);

// Phase 6: read-only payment visibility for an order (no financial mutation
// endpoint exists for admins; DISPATCHER already allowed for viewing here —
// financial administration remains out of scope this phase).
router.get(
  '/:id/payment',
  validateRequest(orderIdParamsSchema),
  validateRequest(adminPaymentParamsSchema),
  paymentController.adminGetOrderPayment
);
router.patch(
  '/:id/status',
  validateRequest(adminUpdateStatusSchema),
  requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'),
  orderController.adminUpdateStatus
);

module.exports = router;
