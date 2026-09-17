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

// All admin order routes require an admin JWT.
// DISPATCHER may view orders and advance delivery statuses (their operational role);
// destructive/cancel transitions still pass through the centralized transition map.
router.use(authenticateAdmin);
router.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

router.get('/', validateRequest(listOrdersQuerySchema), orderController.adminListOrders);
router.get('/:id', validateRequest(orderIdParamsSchema), orderController.adminGetOrder);
router.patch(
  '/:id/status',
  validateRequest(adminUpdateStatusSchema),
  requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'),
  orderController.adminUpdateStatus
);

module.exports = router;
