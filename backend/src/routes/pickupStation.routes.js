const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// GET /api/pickup-stations — list active pickup stations for customer selection
router.get('/', async (req, res, next) => {
  try {
    const stations = await prisma.pickupStation.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        district: true,
        addressText: true,
        contactPhone: true,
        operatingHours: true,
        pickupFeeUgx: true,
        latitude: true,
        longitude: true,
        isActive: true,
      },
    });

    res.json({
      success: true,
      data: { stations },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
