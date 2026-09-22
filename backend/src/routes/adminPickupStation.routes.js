const express = require('express');
const router = express.Router();

const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const controller = require('../controllers/adminPickupStation.controller');
const {
  createStationSchema,
  updateStationSchema,
  toggleStationActiveSchema,
} = require('../validators/pickupStation.validator');

// Stations decide where customers collect orders: ADMIN / SUPER_ADMIN only.
router.use(authenticateAdmin);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

router.get('/', controller.list);
router.post('/', validateRequest(createStationSchema), controller.create);
router.put('/:id', validateRequest(updateStationSchema), controller.update);
router.patch('/:id/active', validateRequest(toggleStationActiveSchema), controller.toggleActive);

module.exports = router;
