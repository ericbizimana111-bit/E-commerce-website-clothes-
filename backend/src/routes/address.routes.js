const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticateCustomer } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticateCustomer);

// GET /api/addresses — list customer's saved addresses
router.get('/', async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        district: true,
        division: true,
        streetAddress: true,
        latitude: true,
        longitude: true,
        isDefault: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: { addresses },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/addresses — add a new address for the customer
router.post('/', async (req, res, next) => {
  try {
    const { title, district, division, streetAddress, latitude, longitude, isDefault } = req.body;

    if (!district || !streetAddress) {
      throw new AppError('District and street address are required', 400);
    }

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        title: title ? String(title).trim() : 'Home',
        district: String(district).trim(),
        division: division ? String(division).trim() : null,
        streetAddress: String(streetAddress).trim(),
        latitude: latitude !== undefined && latitude !== null ? Number(latitude) : null,
        longitude: longitude !== undefined && longitude !== null ? Number(longitude) : null,
        isDefault: !!isDefault,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: { address },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/addresses/:id — delete own address
router.delete('/:id', async (req, res, next) => {
  try {
    const address = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!address) {
      throw new AppError('Address not found or does not belong to you', 404);
    }

    await prisma.address.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
