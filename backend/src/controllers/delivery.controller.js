const deliveryService = require('../services/delivery.service');

/**
 * Delivery controller (Phase 7).
 * Controllers handle auth context + validation + response formatting only;
 * ALL business logic lives in delivery.service / order.service.
 */

// Customer: GET /api/orders/:id/delivery — own order fulfillment, read-only
async function getMyOrderDelivery(req, res, next) {
  try {
    const delivery = await deliveryService.getDeliveryForOrder(req.user.id, req.params.id);
    res.json({ success: true, data: { delivery } });
  } catch (error) {
    next(error);
  }
}

// Admin: GET /api/admin/deliveries — paginated, filterable
async function adminListDeliveries(req, res, next) {
  try {
    const result = await deliveryService.listDeliveries(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Admin: GET /api/admin/deliveries/:id
async function adminGetDelivery(req, res, next) {
  try {
    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.json({ success: true, data: { delivery } });
  } catch (error) {
    next(error);
  }
}

// Admin: PATCH /api/admin/deliveries/:id/assign
async function adminAssignDelivery(req, res, next) {
  try {
    await deliveryService.assignDelivery({
      deliveryId: req.params.id,
      targetAdminId: req.body.assignedAdminId,
      actor: req.admin,
      ipAddress: req.ip,
      notes: req.body.notes,
    });
    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.json({ success: true, data: { delivery } });
  } catch (error) {
    next(error);
  }
}

// Admin: PATCH /api/admin/deliveries/:id/status
async function adminUpdateDeliveryStatus(req, res, next) {
  try {
    const { status, failureReason, failureMessage, notes, scheduledAt } = req.body;
    const result = await deliveryService.updateDeliveryStatus({
      deliveryId: req.params.id,
      toStatus: status,
      changedByType: 'ADMIN',
      changedById: req.admin.id,
      failureReason,
      failureMessage,
      notes,
      scheduledAt,
      ipAddress: req.ip,
    });

    // Idempotent repeat: report current state without claiming a transition
    if (result.idempotentRepeat) {
      const current = await deliveryService.getDeliveryById(req.params.id);
      return res.json({ success: true, data: { delivery: { ...current, repeated: true } } });
    }

    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.json({ success: true, data: { delivery } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyOrderDelivery,
  adminListDeliveries,
  adminGetDelivery,
  adminAssignDelivery,
  adminUpdateDeliveryStatus,
};
