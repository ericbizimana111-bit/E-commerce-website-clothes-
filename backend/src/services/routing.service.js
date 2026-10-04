const env = require('../config/env');
const logger = require('../utils/logger');
const { fetchJson, createCache } = require('../utils/http');
const { haversineKm } = require('./geo.service');

/**
 * Road routing between the dispatch point and a customer.
 *
 * ROUTED    = real road network distance/time from OSRM (+ route geometry).
 * ESTIMATED = straight line x ROAD_DISTANCE_FACTOR at an urban average speed,
 *             used when routing is disabled or the router is unreachable.
 * Both carry the straight-line distance so staff can compare.
 */

const AVERAGE_SPEED_KMH = 28; // Kampala-area boda/van average incl. traffic
const routeCache = createCache({ max: 2000, ttlMs: 6 * 3600 * 1000 });

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

function estimateRoute(from, to) {
  const straightLineKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = straightLineKm * env.ROAD_DISTANCE_FACTOR;
  return {
    source: 'ESTIMATED',
    distanceKm: round(distanceKm),
    straightLineKm: round(straightLineKm),
    durationMinutes: Math.max(5, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60)),
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
  };
}

/**
 * @param from {lat,lng}
 * @param to   {lat,lng}
 * @param opts.geometry include the route polyline ([lat,lng] pairs)
 */
async function getRoute(from, to, { geometry = false } = {}) {
  const straightLineKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (env.ROUTING_PROVIDER !== 'OSRM') return estimateRoute(from, to);

  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => Number(n).toFixed(5)).join(',') + (geometry ? ':g' : '');
  const cached = routeCache.get(key);
  if (cached) return cached;

  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const params = new URLSearchParams({
      overview: geometry ? 'full' : 'false',
      geometries: 'geojson',
      alternatives: 'false',
      steps: 'false',
    });
    const data = await fetchJson(`${env.OSRM_URL}/route/v1/driving/${coords}?${params}`, { timeoutMs: 7000 });
    const route = data && data.code === 'Ok' && Array.isArray(data.routes) ? data.routes[0] : null;
    if (!route) throw new Error(`router returned ${data && data.code}`);

    const result = {
      source: 'ROUTED',
      distanceKm: round(route.distance / 1000),
      straightLineKm: round(straightLineKm),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      geometry: geometry && route.geometry?.coordinates
        ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        : null,
    };
    routeCache.set(key, result);
    return result;
  } catch (error) {
    logger.warn('[routing] falling back to estimate:', error.message);
    return estimateRoute(from, to);
  }
}

module.exports = { getRoute, estimateRoute, AVERAGE_SPEED_KMH };
