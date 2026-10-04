const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { normalizeUgandaPhone } = require('../utils/phone');
const geo = require('./geo.service');

/**
 * Customer delivery addresses (Uganda).
 *
 * Every saved address is a real, deliverable location:
 *  - district must be one of Uganda's districts (region derived from it);
 *  - a map pin is mandatory and must lie inside Uganda;
 *  - the pin must lie in (or right at the border of) the chosen district;
 *  - when the online geocoder is reachable the pin is reverse-geocoded and
 *    must resolve to Uganda -> address is marked isVerified=true;
 *  - a reachable Ugandan contact phone is required for the rider.
 */

const ADDRESS_SELECT = {
  id: true,
  title: true,
  region: true,
  district: true,
  division: true,
  streetAddress: true,
  landmark: true,
  contactPhone: true,
  formattedAddress: true,
  isVerified: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
};

function formatAddress(address) {
  if (!address) return null;
  return {
    ...address,
    latitude: address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null,
    longitude: address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null,
  };
}

/**
 * Validate + normalize address input. Returns the Prisma data payload.
 * Throws 422 AppError with a customer-readable message on any problem.
 */
async function validateAddressInput(input) {
  const district = geo.findDistrict(input.district);
  if (!district) {
    throw new AppError('Please choose a valid Ugandan district from the list.', 422);
  }
  if (input.region) {
    const region = geo.findRegion(input.region);
    if (!region || region.code !== district.region) {
      throw new AppError(`${district.name} is in the ${district.region.toLowerCase()} region. Please check the region.`, 422);
    }
  }

  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  if (!geo.isValidCoordinate(lat, lng)) {
    throw new AppError('Please pin your exact delivery location on the map.', 422);
  }
  if (!geo.isInsideUgandaBounds(lat, lng)) {
    throw new AppError('The pinned location is outside Uganda. We only deliver within Uganda.', 422);
  }

  const consistency = geo.checkDistrictConsistency(lat, lng, district.name);
  if (!consistency.ok) {
    throw new AppError(
      `The map pin appears to be in ${consistency.suggestedDistrict} district, not ${district.name}. ` +
        `Move the pin to your exact location or select ${consistency.suggestedDistrict}.`,
      422
    );
  }

  const phone = normalizeUgandaPhone(String(input.contactPhone || ''));
  if (!phone.isValid) {
    throw new AppError('Enter a valid Ugandan phone number the rider can call (e.g. 0772 123456).', 422);
  }

  // Online confirmation (best effort): a reachable geocoder must agree the
  // point is in Uganda; an unreachable one leaves the address unverified.
  const reverse = await geo.reverseGeocode(lat, lng);
  if (reverse && reverse.countryCode && reverse.countryCode !== 'UG') {
    throw new AppError('The pinned location is outside Uganda. We only deliver within Uganda.', 422);
  }
  if (reverse && !reverse.countryCode) {
    throw new AppError('We could not recognise the pinned location. Please move the pin onto a road or building.', 422);
  }

  const offline = geo.describePointOffline(lat, lng);
  const area = (input.division && String(input.division).trim()) || (reverse && reverse.area) || offline.area || null;
  const street = String(input.streetAddress).trim();
  const formattedParts = [street, area, `${district.name} District`, 'Uganda'].filter(Boolean);

  return {
    title: input.title ? String(input.title).trim().slice(0, 50) : 'Home',
    region: district.region,
    district: district.name,
    division: area ? String(area).slice(0, 100) : null,
    streetAddress: street.slice(0, 300),
    landmark: input.landmark ? String(input.landmark).trim().slice(0, 300) : null,
    contactPhone: phone.normalized,
    formattedAddress: (reverse && reverse.label ? `${street} — ${reverse.label}` : formattedParts.join(', ')).slice(0, 500),
    isVerified: Boolean(reverse && reverse.countryCode === 'UG'),
    latitude: Math.round(lat * 1e7) / 1e7,
    longitude: Math.round(lng * 1e7) / 1e7,
  };
}

async function listAddresses(userId) {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: ADDRESS_SELECT,
  });
  return rows.map(formatAddress);
}

async function createAddress(userId, input) {
  const data = await validateAddressInput(input);
  const existingCount = await prisma.address.count({ where: { userId } });
  if (existingCount >= 20) {
    throw new AppError('You can save up to 20 addresses. Remove one to add another.', 409);
  }
  const makeDefault = Boolean(input.isDefault) || existingCount === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, userId, isDefault: makeDefault }, select: ADDRESS_SELECT });
  });
  return formatAddress(created);
}

async function updateAddress(userId, addressId, input) {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new AppError('Address not found', 404);

  const data = await validateAddressInput(input);
  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({
      where: { id: addressId },
      data: { ...data, ...(input.isDefault ? { isDefault: true } : {}) },
      select: ADDRESS_SELECT,
    });
  });
  return formatAddress(updated);
}

async function setDefaultAddress(userId, addressId) {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new AppError('Address not found', 404);
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
  return listAddresses(userId);
}

async function deleteAddress(userId, addressId) {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new AppError('Address not found or does not belong to you', 404);
  await prisma.address.delete({ where: { id: addressId } });
  // Keep exactly one default when addresses remain.
  if (existing.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

/**
 * Immutable snapshot stored on orders/service bookings: everything a rider
 * or technician needs, even if the customer later edits/deletes the address.
 */
function buildAddressSnapshot(address, user = null) {
  return {
    title: address.title,
    recipientName: user ? user.fullName : null,
    contactPhone: address.contactPhone || (user ? user.phone : null),
    region: address.region || null,
    district: address.district,
    division: address.division || null,
    streetAddress: address.streetAddress,
    landmark: address.landmark || null,
    formattedAddress: address.formattedAddress || null,
    isVerified: Boolean(address.isVerified),
    latitude: address.latitude !== null && address.latitude !== undefined ? Number(address.latitude) : null,
    longitude: address.longitude !== null && address.longitude !== undefined ? Number(address.longitude) : null,
  };
}

module.exports = {
  ADDRESS_SELECT,
  formatAddress,
  validateAddressInput,
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  buildAddressSnapshot,
};
