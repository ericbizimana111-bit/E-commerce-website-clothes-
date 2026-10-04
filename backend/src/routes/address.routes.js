const express = require('express');
const router = express.Router();
const { authenticateCustomer } = require('../middleware/auth');
const validateRequest = require('../middleware/requestValidator');
const addressService = require('../services/address.service');
const { createAddressSchema, updateAddressSchema, addressIdSchema } = require('../validators/address.validator');

router.use(authenticateCustomer);

// GET /api/addresses — customer's saved, validated delivery addresses
router.get('/', async (req, res, next) => {
  try {
    const addresses = await addressService.listAddresses(req.user.id);
    res.json({ success: true, data: { addresses } });
  } catch (error) {
    next(error);
  }
});

// POST /api/addresses — validated against Uganda districts + map pin
router.post('/', validateRequest(createAddressSchema), async (req, res, next) => {
  try {
    const address = await addressService.createAddress(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Address saved', data: { address } });
  } catch (error) {
    next(error);
  }
});

// PUT /api/addresses/:id — full re-validation on edit
router.put('/:id', validateRequest(updateAddressSchema), async (req, res, next) => {
  try {
    const address = await addressService.updateAddress(req.user.id, req.params.id, req.body);
    res.json({ success: true, message: 'Address updated', data: { address } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/addresses/:id/default
router.patch('/:id/default', validateRequest(addressIdSchema), async (req, res, next) => {
  try {
    const addresses = await addressService.setDefaultAddress(req.user.id, req.params.id);
    res.json({ success: true, data: { addresses } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/addresses/:id — delete own address (orders keep their snapshot)
router.delete('/:id', validateRequest(addressIdSchema), async (req, res, next) => {
  try {
    await addressService.deleteAddress(req.user.id, req.params.id);
    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
