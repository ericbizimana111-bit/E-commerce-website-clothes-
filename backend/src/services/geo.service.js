const env = require('../config/env');
const logger = require('../utils/logger');
const { fetchJson, createCache, createThrottle } = require('../utils/http');
const uganda = require('../data/uganda');

/**
 * Geography service: distance maths, Uganda boundary checks, district
 * consistency checks, place search and reverse geocoding.
 *
 * Online lookups (OpenStreetMap Nominatim) improve accuracy but are never a
 * hard dependency: when the provider is off or unreachable, searches fall
 * back to the bundled Uganda dataset and validation uses offline rules.
 */

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function isInsideUgandaBounds(lat, lng) {
  const b = uganda.BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Districts sorted by centroid distance from the point. */
function nearestDistricts(lat, lng, limit = 5) {
  return uganda.DISTRICTS.map((d) => ({ ...d, distanceKm: haversineKm(lat, lng, d.lat, d.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/**
 * Is (lat,lng) plausibly inside `districtName`?
 * The chosen district must be within its own tolerance radius AND be among
 * the districts whose centroids are about as close as the nearest one (this
 * catches "pin in Gulu, district says Kampala" while allowing border areas).
 */
function checkDistrictConsistency(lat, lng, districtName) {
  const district = uganda.findDistrict(districtName);
  if (!district) return { ok: false, reason: 'UNKNOWN_DISTRICT' };

  const distanceKm = haversineKm(lat, lng, district.lat, district.lng);
  const nearest = nearestDistricts(lat, lng, 6);
  const closest = nearest[0];
  const plausible = nearest.filter((d) => d.distanceKm <= closest.distanceKm + 25).map((d) => d.name);

  if (distanceKm <= district.radiusKm && (plausible.includes(district.name) || distanceKm <= 12)) {
    return { ok: true, district, distanceKm };
  }
  return { ok: false, reason: 'DISTRICT_MISMATCH', district, distanceKm, suggestedDistrict: closest.name };
}

// ------------------------------------------------------------
// Offline place search over the bundled dataset
// ------------------------------------------------------------
function searchOffline(query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const score = (name) => {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return 99;
  };
  const places = uganda.PLACES.map((p) => ({ p, s: score(p.name) }))
    .filter((x) => x.s < 99)
    .map(({ p, s }) => {
      const d = uganda.findDistrict(p.district);
      return {
        s,
        label: `${p.name}, ${p.district}`,
        name: p.name,
        district: p.district,
        region: d ? d.region : null,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        source: 'DATASET',
      };
    });
  const districts = uganda.DISTRICTS.map((d) => ({ d, s: score(d.name) }))
    .filter((x) => x.s < 99)
    .map(({ d, s }) => ({
      s: s + 0.5,
      label: `${d.name} District`,
      name: d.name,
      district: d.name,
      region: d.region,
      type: 'DISTRICT',
      lat: d.lat,
      lng: d.lng,
      source: 'DATASET',
    }));
  return [...places, ...districts]
    .sort((a, b) => a.s - b.s || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ s, ...rest }) => rest);
}

// ------------------------------------------------------------
// Nominatim (OpenStreetMap)
// ------------------------------------------------------------
const nominatimThrottle = createThrottle(1100);
const searchCache = createCache({ max: 1000, ttlMs: 7 * 24 * 3600 * 1000 });
const reverseCache = createCache({ max: 2000, ttlMs: 7 * 24 * 3600 * 1000 });

function nominatimEnabled() {
  return env.GEOCODER_PROVIDER === 'NOMINATIM';
}

function nominatimHeaders() {
  return {
    'User-Agent': `UgaMarket/1.0 (${env.GEO_CONTACT_EMAIL})`,
    'Accept-Language': 'en',
  };
}

/** Map an OSM address block to the closest known district, if any. */
function districtFromOsmAddress(address = {}, lat, lng) {
  const candidates = [address.county, address.state_district, address.city, address.town, address.municipality, address.city_district];
  for (const c of candidates) {
    const d = c && uganda.findDistrict(String(c).replace(/\s+(District|Municipality|Division)$/i, ''));
    if (d) return d.name;
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) return nearestDistricts(lat, lng, 1)[0].name;
  return null;
}

function formatOsmLabel(address = {}, fallback = '') {
  const parts = [
    address.road,
    address.neighbourhood || address.suburb || address.quarter,
    address.village || address.town || address.city || address.municipality,
    address.county,
  ].filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : fallback;
}

async function searchOnline(query, limit = 6) {
  const key = `${query.toLowerCase()}|${limit}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'ug',
    limit: String(limit),
    viewbox: `${uganda.BOUNDS.minLng},${uganda.BOUNDS.maxLat},${uganda.BOUNDS.maxLng},${uganda.BOUNDS.minLat}`,
    bounded: '1',
  });
  const rows = await nominatimThrottle(() =>
    fetchJson(`${env.NOMINATIM_URL}/search?${params}`, { headers: nominatimHeaders(), timeoutMs: 6000 })
  );
  const results = (Array.isArray(rows) ? rows : [])
    .filter((r) => (r.address?.country_code || '').toLowerCase() === 'ug')
    .map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      const district = districtFromOsmAddress(r.address, lat, lng);
      const d = district ? uganda.findDistrict(district) : null;
      return {
        label: formatOsmLabel(r.address, r.display_name),
        name: r.name || r.address?.suburb || r.address?.city || query,
        district,
        region: d ? d.region : null,
        type: String(r.addresstype || r.type || 'PLACE').toUpperCase(),
        lat,
        lng,
        source: 'OSM',
      };
    });
  searchCache.set(key, results);
  return results;
}

/**
 * Search places in Uganda. Combines the curated dataset (instant, offline)
 * with OpenStreetMap results (streets, buildings, villages) when available.
 */
async function searchPlaces(query, { limit = 8 } = {}) {
  const q = String(query || '').trim().slice(0, 120);
  if (q.length < 2) return { results: [], online: false };
  const offline = searchOffline(q, limit);
  if (!nominatimEnabled()) return { results: offline, online: false };

  try {
    const online = await searchOnline(q, 6);
    const merged = [...offline.slice(0, 3)];
    for (const r of online) {
      const dup = merged.some((m) => haversineKm(m.lat, m.lng, r.lat, r.lng) < 0.3);
      if (!dup) merged.push(r);
    }
    for (const r of offline.slice(3)) merged.push(r);
    return { results: merged.slice(0, limit), online: true };
  } catch (error) {
    logger.warn('[geo] online search unavailable:', error.message);
    return { results: offline, online: false };
  }
}

/**
 * Reverse geocode a point. Returns null when the provider is disabled or
 * unreachable (callers then rely on offline validation).
 */
async function reverseGeocode(lat, lng) {
  if (!nominatimEnabled()) return null;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
    });
    const r = await nominatimThrottle(() =>
      fetchJson(`${env.NOMINATIM_URL}/reverse?${params}`, { headers: nominatimHeaders(), timeoutMs: 6000 })
    );
    if (!r || r.error) {
      const result = { countryCode: null, label: null, district: null, area: null };
      reverseCache.set(key, result);
      return result;
    }
    const address = r.address || {};
    const result = {
      countryCode: (address.country_code || '').toUpperCase() || null,
      label: formatOsmLabel(address, r.display_name),
      district: districtFromOsmAddress(address, lat, lng),
      area: address.neighbourhood || address.suburb || address.village || address.town || address.city || null,
      road: address.road || null,
    };
    reverseCache.set(key, result);
    return result;
  } catch (error) {
    logger.warn('[geo] reverse geocoding unavailable:', error.message);
    return null;
  }
}

/** Offline best-effort description of a point (nearest named place). */
function describePointOffline(lat, lng) {
  let best = null;
  for (const p of uganda.PLACES) {
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (!best || d < best.d) best = { p, d };
  }
  const district = nearestDistricts(lat, lng, 1)[0];
  if (best && best.d <= 3) return { area: best.p.name, district: best.p.district };
  return { area: null, district: district.name };
}

module.exports = {
  haversineKm,
  isValidCoordinate,
  isInsideUgandaBounds,
  nearestDistricts,
  checkDistrictConsistency,
  searchPlaces,
  searchOffline,
  reverseGeocode,
  describePointOffline,
  country: uganda.COUNTRY,
  regions: uganda.REGIONS,
  districts: uganda.DISTRICTS,
  findDistrict: uganda.findDistrict,
  findRegion: uganda.findRegion,
};
