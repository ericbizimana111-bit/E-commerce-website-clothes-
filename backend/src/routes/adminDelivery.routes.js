const express = require('express');
const router = express.Router();

const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const deliveryController = require('../controllers/delivery.controller');
const {
  listDeliveriesQuerySchema,
  deliveryIdParamsSchema,
  assignDeliverySchema,
  updateDeliveryStatusSchema,
} = require('../validators/delivery.validator');

// Phase 7 admin delivery operations. DISPATCHER is the operational fulfillment
// role (matches the existing admin order routes); assignment targets are
// validated server-side (active DISPATCHER/ADMIN/SUPER_ADMIN only).
router.use(authenticateAdmin);
router.use(requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'));

router.get('/', validateRequest(listDeliveriesQuerySchema), deliveryController.adminListDeliveries);
router.get('/:id', validateRequest(deliveryIdParamsSchema), deliveryController.adminGetDelivery);
router.patch('/:id/assign', validateRequest(assignDeliverySchema), deliveryController.adminAssignDelivery);
router.patch('/:id/status', validateRequest(updateDeliveryStatusSchema), deliveryController.adminUpdateDeliveryStatus);

module.exports = router;
