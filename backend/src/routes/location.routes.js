const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const geo = require('../services/geo.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * Public location lookups used by the address picker.
 * Search/reverse proxy OpenStreetMap through the backend so the provider's
 * usage policy (rate limit, User-Agent, caching) is enforced in one place.
 */

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many location lookups. Please wait a moment.' },
});

// GET /api/locations/meta — country, regions and districts (static data)
router.get('/meta', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({
    success: true,
    data: {
      country: geo.country,
      regions: geo.regions,
      districts: geo.districts.map(({ name, region, subRegion, lat, lng }) => ({ name, region, subRegion, lat, lng })),
    },
  });
});

// GET /api/locations/search?q=ntinda
router.get('/search', lookupLimiter, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.json({ success: true, data: { results: [], online: false } });
    const data = await geo.searchPlaces(q.slice(0, 120));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/locations/reverse?lat=0.35&lng=32.61 — what is at this pin?
router.get('/reverse', lookupLimiter, async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!geo.isValidCoordinate(lat, lng)) throw new AppError('Valid lat and lng are required', 400);

    const insideUganda = geo.isInsideUgandaBounds(lat, lng);
    if (!insideUganda) {
      return res.json({ success: true, data: { insideUganda: false } });
    }
    const offline = geo.describePointOffline(lat, lng);
    const online = await geo.reverseGeocode(lat, lng);
    const districtName = (online && online.district) || offline.district;
    const district = geo.findDistrict(districtName);

    res.json({
      success: true,
      data: {
        insideUganda: online ? online.countryCode === 'UG' : true,
        verified: Boolean(online && online.countryCode === 'UG'),
        district: district ? district.name : districtName,
        region: district ? district.region : null,
        area: (online && online.area) || offline.area,
        road: online ? online.road : null,
        label: online ? online.label : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
