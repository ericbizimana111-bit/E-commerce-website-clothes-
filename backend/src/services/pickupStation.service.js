const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { logAudit } = require('./audit.service');

/**
 * Admin management of pickup stations. Stations are never hard-deleted:
 * orders reference them, so removal from the storefront is a soft
 * deactivation (isActive=false), which the public list already honours.
 */

const withOrderCount = { _count: { select: { orders: true } } };

const toResponse = (station) => ({
  id: station.id,
  name: station.name,
  district: station.district,
  addressText: station.addressText,
  contactPhone: station.contactPhone,
  operatingHours: station.operatingHours,
  pickupFeeUgx: station.pickupFeeUgx,
  latitude: station.latitude === null || station.latitude === undefined ? null : Number(station.latitude),
  longitude: station.longitude === null || station.longitude === undefined ? null : Number(station.longitude),
  isActive: station.isActive,
  orderCount: station._count?.orders ?? 0,
  createdAt: station.createdAt,
  updatedAt: station.updatedAt,
});

async function listStations({ search } = {}) {
  const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const stations = await prisma.pickupStation.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { district: { contains: term, mode: 'insensitive' } },
            { addressText: { contains: term, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: withOrderCount,
  });
  return stations.map(toResponse);
}

async function assertNoDuplicate({ name, district }, excludeId = null) {
  const duplicate = await prisma.pickupStation.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      district: { equals: district, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (duplicate) {
    throw new AppError(`A pickup station named "${name}" already exists in ${district}`, 409);
  }
}

async function createStation(data, adminId = null, ipAddress = null) {
  await assertNoDuplicate(data);
  const station = await prisma.pickupStation.create({ data, include: withOrderCount });
  await logAudit({
    adminId,
    action: 'PICKUP_STATION_CREATE',
    entityName: 'PickupStation',
    entityId: station.id,
    details: data,
    ipAddress,
  });
  return toResponse(station);
}

async function updateStation(id, data, adminId = null, ipAddress = null) {
  const stationId = parseInt(id, 10);
  const existing = await prisma.pickupStation.findUnique({ where: { id: stationId } });
  if (!existing) throw new AppError(`Pickup station with ID ${id} not found`, 404);

  if (data.name !== undefined || data.district !== undefined) {
    await assertNoDuplicate(
      { name: data.name ?? existing.name, district: data.district ?? existing.district },
      stationId
    );
  }

  const station = await prisma.pickupStation.update({ where: { id: stationId }, data, include: withOrderCount });
  await logAudit({
    adminId,
    action: 'PICKUP_STATION_UPDATE',
    entityName: 'PickupStation',
    entityId: stationId,
    details: data,
    ipAddress,
  });
  return toResponse(station);
}

async function toggleStationActive(id, isActive, adminId = null, ipAddress = null) {
  const stationId = parseInt(id, 10);
  const existing = await prisma.pickupStation.findUnique({ where: { id: stationId } });
  if (!existing) throw new AppError(`Pickup station with ID ${id} not found`, 404);

  const station = await prisma.pickupStation.update({
    where: { id: stationId },
    data: { isActive },
    include: withOrderCount,
  });
  await logAudit({
    adminId,
    action: isActive ? 'PICKUP_STATION_ACTIVATE' : 'PICKUP_STATION_DEACTIVATE',
    entityName: 'PickupStation',
    entityId: stationId,
    details: { isActive },
    ipAddress,
  });
  return toResponse(station);
}

module.exports = { listStations, createStation, updateStation, toggleStationActive };
