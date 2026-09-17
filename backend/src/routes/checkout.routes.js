const express = require('express');
const router = express.Router();

const { authenticateCustomer } = require('../middleware/auth');
const validateRequest = require('../middleware/requestValidator');
const checkoutController = require('../controllers/checkout.controller');
const { checkoutPreviewSchema } = require('../validators/checkout.validator');

// Read-only checkout preparation. Requires customer JWT.
router.use(authenticateCustomer);

router.post('/preview', validateRequest(checkoutPreviewSchema), checkoutController.preview);

module.exports = router;
