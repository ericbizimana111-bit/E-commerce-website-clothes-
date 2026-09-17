const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/**
 * Delivery fee abstraction (Phase 5 minimal implementation).
 *
 * Implements the blueprint formula for HOME_DELIVERY using the existing
 * delivery_pricing_config + Haversine distance fallback:
 *
 *   fee = base_fee + max(0, distance_km - free_radius_km) * per_km_rate
 *   fee = max(fee, minimum_fee)
 *
 * Pickup orders carry no delivery fee (station pickupFeeUgx is NOT charged to
 * the order until the business rules define it — total = subtotal for pickup).
 *
 * Live distance services (Google Maps etc.) belong to the delivery phase;
 * this stays a swappable internal abstraction.
 */

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function getActiveDeliveryConfig() {
  return prisma.deliveryPricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Calculate the home-delivery fee in integer UGX from trusted server data.
 * Returns 0 when the address lies within the free radius.
 */
function calculateDeliveryFee(config, distanceKm) {
  if (!config) return null; // no active configuration -> fee cannot be computed
  const distance = Math.max(0, Number(distanceKm) || 0);
  const freeRadius = Number(config.freeRadiusKm) || 0;
  const chargeableKm = Math.max(0, distance - freeRadius);

  const rawFee =
    config.baseFeeUgx + Math.round(chargeableKm * (config.perKmRateUgx || 0));

  return Math.max(rawFee, config.minimumFeeUgx || 0);
}

/**
 * Resolve the delivery fee for an order's fulfillment choice.
 * Returns integer UGX (0 for pickup).
 */
async function resolveDeliveryFee({ fulfillmentMethod, address }) {
  if (fulfillmentMethod === 'PICKUP_STATION') {
    return 0; // pickup: no delivery fee
  }

  // HOME_DELIVERY
  const config = await getActiveDeliveryConfig();
  if (!config) {
    throw new AppError('Delivery pricing is not configured. Home delivery is temporarily unavailable.', 400);
  }

  const warehouseLat = Number(config.warehouseLat);
  const warehouseLng = Number(config.warehouseLng);
  const addressLat = address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null;
  const addressLng = address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null;

  if (addressLat === null || addressLng === null) {
    // Address without coordinates: charge the minimum fee (safe fallback)
    return Math.max(config.minimumFeeUgx || 0, config.baseFeeUgx || 0);
  }

  const distanceKm = haversineKm(warehouseLat, warehouseLng, addressLat, addressLng);
  return calculateDeliveryFee(config, distanceKm);
}

module.exports = {
  haversineKm,
  calculateDeliveryFee,
  resolveDeliveryFee,
  getActiveDeliveryConfig,
};
