const express = require('express');
const router = express.Router();

const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const adminCustomerController = require('../controllers/adminCustomer.controller');
const { listCustomersQuerySchema, customerIdParamSchema } = require('../validators/customer.validator');

// Customer visibility is an ADMIN/SUPER_ADMIN concern; DISPATCHER manages
// deliveries, not customer accounts.
router.use(authenticateAdmin);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

router.get('/', validateRequest(listCustomersQuerySchema), adminCustomerController.listCustomers);
router.get('/:id', validateRequest(customerIdParamSchema), adminCustomerController.getCustomer);

module.exports = router;
