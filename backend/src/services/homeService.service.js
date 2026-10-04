const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { normalizeLanguage } = require('../utils/translation');
const { normalizeUgandaPhone } = require('../utils/phone');
const { formatUGX } = require('../utils/currency');
const { uniqueSlug } = require('../utils/slug');
const { logAudit } = require('./audit.service');
const translator = require('./translator.service');
const notifications = require('./notification.service');
const { buildAddressSnapshot } = require('./address.service');
const { getActiveDeliveryConfig, coordsOf } = require('./delivery.service');
const { getRoute } = require('./routing.service');
const realtime = require('./realtime.service');

/**
 * Home services: a curated catalogue (plumbing, electrical, cleaning...),
 * technicians managed by staff, and customer bookings that go through a
 * controlled lifecycle:
 *
 *   PENDING -> CONFIRMED -> ASSIGNED -> IN_PROGRESS -> COMPLETED
 *        \________\___________\-> CANCELLED
 *
 * Payment for the job is collected by mobile money (MTN MoMo / Airtel Money)
 * once the work is done and recorded by staff with its transaction reference.
 */

const TIME_SLOTS = {
  MORNING: '8:00 – 12:00',
  AFTERNOON: '12:00 – 16:00',
  EVENING: '16:00 – 19:00',
};

const REQUEST_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'ASSIGNED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CONFIRMED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const CUSTOMER_CANCELLABLE = ['PENDING', 'CONFIRMED', 'ASSIGNED'];

const STATUS_MESSAGES = {
  CONFIRMED: ['Booking confirmed', 'Your {s} booking {n} is confirmed.'],
  ASSIGNED: ['Technician assigned', '{p} will handle your {s} booking {n}.'],
  IN_PROGRESS: ['Technician on the job', 'Work on your {s} booking {n} has started.'],
  COMPLETED: ['Service completed', 'Your {s} booking {n} is complete. Thank you for using UgaMarket Home Services!'],
  CANCELLED: ['Booking cancelled', 'Your {s} booking {n} was cancelled.'],
};

// ------------------------------------------------------------
// Catalogue
// ------------------------------------------------------------
function localize(service, lang) {
  const l = normalizeLanguage(lang);
  const t = l !== 'EN' && service.translations && service.translations[l] ? service.translations[l] : null;
  return {
    id: service.id,
    slug: service.slug,
    name: (t && t.name) || service.nameEn,
    description: (t && t.description) || service.descriptionEn || null,
    icon: service.icon || null,
    imageUrl: service.imageUrl || null,
    priceType: service.priceType,
    priceFromUgx: service.priceFromUgx,
    durationText: service.durationText || null,
    displayOrder: service.displayOrder,
  };
}

async function listPublicServices(lang = 'EN') {
  const rows = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });
  const l = normalizeLanguage(lang);
  if (translator.isEnabled() && l !== 'EN') {
    rows.filter((s) => !s.translations || !s.translations[l]).slice(0, 20).forEach((s) => translator.scheduleService(s.id));
  }
  return rows.map((s) => localize(s, lang));
}

async function getPublicService(slug, lang = 'EN') {
  const service = await prisma.service.findFirst({ where: { slug: String(slug).toLowerCase(), isActive: true } });
  if (!service) throw new AppError('Service not found', 404);
  return { ...localize(service, lang), timeSlots: TIME_SLOTS };
}

function formatAdminService(s) {
  return {
    ...localize(s, 'EN'),
    isActive: s.isActive,
    translations: s.translations || {},
    providerCount: s._count ? s._count.providers : undefined,
    requestCount: s._count ? s._count.requests : undefined,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function listAdminServices() {
  const rows = await prisma.service.findMany({
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { providers: true, requests: true } } },
  });
  return rows.map(formatAdminService);
}

async function createService(data, adminId, ipAddress) {
  const slug = data.slug || (await uniqueSlug(data.name, async (s) => Boolean(await prisma.service.findUnique({ where: { slug: s } })), 120));
  const clash = await prisma.service.findUnique({ where: { slug } });
  if (clash) throw new AppError(`A service with slug '${slug}' already exists`, 409);

  const created = await prisma.service.create({
    data: {
      slug,
      nameEn: data.name,
      descriptionEn: data.description || null,
      icon: data.icon || null,
      imageUrl: data.imageUrl || null,
      priceType: data.priceType || 'INSPECTION',
      priceFromUgx: data.priceFromUgx || 0,
      durationText: data.durationText || null,
      displayOrder: data.displayOrder || 0,
      isActive: data.isActive !== false,
    },
  });
  await logAudit({ adminId, action: 'SERVICE_CREATE', entityName: 'Service', entityId: created.id, details: { slug }, ipAddress });
  translator.scheduleService(created.id, { force: true });
  return formatAdminService(created);
}

async function updateService(id, data, adminId, ipAddress) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw new AppError('Service not found', 404);
  if (data.slug && data.slug !== existing.slug) {
    const clash = await prisma.service.findUnique({ where: { slug: data.slug } });
    if (clash) throw new AppError(`A service with slug '${data.slug}' already exists`, 409);
  }
  const englishChanged =
    (data.name !== undefined && data.name !== existing.nameEn) ||
    (data.description !== undefined && (data.description || null) !== (existing.descriptionEn || null));

  const updated = await prisma.service.update({
    where: { id },
    data: {
      slug: data.slug,
      nameEn: data.name,
      descriptionEn: data.description !== undefined ? data.description || null : undefined,
      icon: data.icon !== undefined ? data.icon || null : undefined,
      imageUrl: data.imageUrl !== undefined ? data.imageUrl || null : undefined,
      priceType: data.priceType,
      priceFromUgx: data.priceFromUgx,
      durationText: data.durationText !== undefined ? data.durationText || null : undefined,
      displayOrder: data.displayOrder,
      isActive: data.isActive,
      ...(englishChanged ? { translations: {} } : {}),
    },
  });
  await logAudit({ adminId, action: 'SERVICE_UPDATE', entityName: 'Service', entityId: id, details: data, ipAddress });
  if (englishChanged) translator.scheduleService(id, { force: true });
  return formatAdminService(updated);
}

// ------------------------------------------------------------
// Technicians
// ------------------------------------------------------------
function formatProvider(p) {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    coverage: p.coverage || null,
    notes: p.notes || null,
    isActive: p.isActive,
    services: (p.skills || []).map((s) => ({ id: s.service.id, name: s.service.nameEn })),
    activeJobs: p._count ? p._count.requests : undefined,
    createdAt: p.createdAt,
  };
}

const PROVIDER_INCLUDE = {
  skills: { include: { service: { select: { id: true, nameEn: true } } } },
  _count: { select: { requests: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } } } },
};

async function listProviders({ serviceId = null, activeOnly = false } = {}) {
  const where = {};
  if (activeOnly) where.isActive = true;
  if (serviceId) where.skills = { some: { serviceId } };
  const rows = await prisma.serviceProvider.findMany({ where, orderBy: { fullName: 'asc' }, include: PROVIDER_INCLUDE });
  return rows.map(formatProvider);
}

function normalizeProviderPhone(phone) {
  const p = normalizeUgandaPhone(String(phone || ''));
  if (!p.isValid) throw new AppError('Enter a valid Ugandan phone number for the technician', 422);
  return p.normalized;
}

async function saveProviderSkills(tx, providerId, serviceIds) {
  if (!Array.isArray(serviceIds)) return;
  const valid = await tx.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true } });
  await tx.serviceProviderSkill.deleteMany({ where: { providerId } });
  if (valid.length) {
    await tx.serviceProviderSkill.createMany({ data: valid.map((s) => ({ providerId, serviceId: s.id })) });
  }
}

async function createProvider(data, adminId, ipAddress) {
  const phone = normalizeProviderPhone(data.phone);
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.serviceProvider.create({
      data: { fullName: data.fullName, phone, coverage: data.coverage || null, notes: data.notes || null, isActive: data.isActive !== false },
    });
    await saveProviderSkills(tx, p.id, data.serviceIds || []);
    return tx.serviceProvider.findUnique({ where: { id: p.id }, include: PROVIDER_INCLUDE });
  });
  await logAudit({ adminId, action: 'SERVICE_PROVIDER_CREATE', entityName: 'ServiceProvider', entityId: created.id, details: { fullName: created.fullName }, ipAddress });
  return formatProvider(created);
}

async function updateProvider(id, data, adminId, ipAddress) {
  const existing = await prisma.serviceProvider.findUnique({ where: { id } });
  if (!existing) throw new AppError('Technician not found', 404);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceProvider.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone !== undefined ? normalizeProviderPhone(data.phone) : undefined,
        coverage: data.coverage !== undefined ? data.coverage || null : undefined,
        notes: data.notes !== undefined ? data.notes || null : undefined,
        isActive: data.isActive,
      },
    });
    await saveProviderSkills(tx, id, data.serviceIds);
    return tx.serviceProvider.findUnique({ where: { id }, include: PROVIDER_INCLUDE });
  });
  await logAudit({ adminId, action: 'SERVICE_PROVIDER_UPDATE', entityName: 'ServiceProvider', entityId: id, details: data, ipAddress });
  return formatProvider(updated);
}

// ------------------------------------------------------------
// Bookings
// ------------------------------------------------------------
function generateRequestNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `SR-${ymd}-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
}

function formatRequest(r, { forAdmin = false, lang = 'EN' } = {}) {
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    status: r.status,
    service: r.service ? localize(r.service, lang) : null,
    address: r.addressSnapshot,
    description: r.description,
    preferredDate: r.preferredDate ? r.preferredDate.toISOString().slice(0, 10) : null,
    preferredSlot: r.preferredSlot,
    preferredSlotLabel: TIME_SLOTS[r.preferredSlot] || r.preferredSlot,
    contactPhone: r.contactPhone,
    priceType: r.priceType,
    priceFromUgx: r.priceFromUgx,
    quotedPriceUgx: r.quotedPriceUgx,
    distanceKm: r.distanceKm !== null && r.distanceKm !== undefined ? Number(r.distanceKm) : null,
    etaMinutes: r.etaMinutes,
    distanceSource: r.distanceSource,
    scheduledAt: r.scheduledAt,
    completedAt: r.completedAt,
    paymentStatus: r.paymentStatus,
    paymentMethod: r.paymentMethod,
    paymentRef: forAdmin ? r.paymentRef : undefined,
    cancelReason: r.cancelReason,
    // Customers see who is coming (name + phone) once a technician is assigned.
    provider: r.provider ? { id: forAdmin ? r.provider.id : undefined, fullName: r.provider.fullName, phone: r.provider.phone } : null,
    customer: forAdmin && r.user ? { id: r.user.id, fullName: r.user.fullName, phone: r.user.phone, email: r.user.email || null } : undefined,
    events: (r.events || []).map((e) => ({
      id: e.id,
      from: e.statusFrom,
      to: e.statusTo,
      actorType: e.actorType,
      note: e.note,
      adminName: forAdmin && e.admin ? e.admin.fullName : undefined,
      createdAt: e.createdAt,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const REQUEST_DETAIL_INCLUDE = {
  service: true,
  provider: true,
  user: { select: { id: true, fullName: true, phone: true, email: true } },
  events: { orderBy: { createdAt: 'asc' }, include: { admin: { select: { fullName: true } } } },
};

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function createRequest(userId, input) {
  const service = await prisma.service.findFirst({
    where: input.serviceId ? { id: input.serviceId, isActive: true } : { slug: String(input.serviceSlug || '').toLowerCase(), isActive: true },
  });
  if (!service) throw new AppError('This service is not available', 404);

  const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
  if (!address) throw new AppError('Address not found or does not belong to you', 404);
  const to = coordsOf(address);
  if (!to) throw new AppError('This address has no map location. Please edit it and pin your exact location on the map.', 422);

  // Preferred date: today (Kampala time) up to 60 days ahead.
  const date = parseDateOnly(input.preferredDate);
  if (!date) throw new AppError('Choose a valid preferred date', 422);
  const todayKampala = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const today = parseDateOnly(todayKampala);
  if (date < today) throw new AppError('The preferred date cannot be in the past', 422);
  if (date.getTime() - today.getTime() > 60 * 24 * 3600 * 1000) throw new AppError('Bookings can be made up to 60 days ahead', 422);
  if (!TIME_SLOTS[input.preferredSlot]) throw new AppError('Choose a valid time slot', 422);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, phone: true } });
  const phoneSource = input.contactPhone || address.contactPhone || user.phone;
  const phone = normalizeUgandaPhone(String(phoneSource || ''));
  if (!phone.isValid) throw new AppError('Enter a valid Ugandan phone number the technician can call', 422);

  // Distance from the dispatch point (best effort; never blocks a booking).
  let route = null;
  try {
    const config = await getActiveDeliveryConfig();
    if (config) route = await getRoute({ lat: Number(config.warehouseLat), lng: Number(config.warehouseLng) }, to);
  } catch {
    route = null;
  }

  let requestNumber = generateRequestNumber();
  for (let i = 0; i < 5 && (await prisma.serviceRequest.findUnique({ where: { requestNumber } })); i += 1) {
    requestNumber = generateRequestNumber();
  }

  const created = await prisma.serviceRequest.create({
    data: {
      requestNumber,
      userId,
      serviceId: service.id,
      addressId: address.id,
      addressSnapshot: buildAddressSnapshot(address, user),
      description: String(input.description).trim().slice(0, 2000),
      preferredDate: date,
      preferredSlot: input.preferredSlot,
      contactPhone: phone.normalized,
      priceType: service.priceType,
      priceFromUgx: service.priceFromUgx,
      distanceKm: route ? route.distanceKm : null,
      etaMinutes: route ? route.durationMinutes : null,
      distanceSource: route ? route.source : null,
      events: { create: [{ statusTo: 'PENDING', actorType: 'CUSTOMER', note: 'Booking requested' }] },
    },
    include: REQUEST_DETAIL_INCLUDE,
  });

  const place = [created.addressSnapshot.division, created.addressSnapshot.district].filter(Boolean).join(', ');
  await notifications.notifyAdmins({
    type: notifications.ADMIN_NOTIFICATION_TYPES.NEW_SERVICE_REQUEST,
    title: `New ${service.nameEn} booking ${requestNumber}`,
    message:
      `${user.fullName} (${phone.normalized}) needs ${service.nameEn} in ${place || 'their area'} on ${input.preferredDate} (${TIME_SLOTS[input.preferredSlot]})` +
      (route ? ` — ${route.distanceKm.toFixed(1)} km away.` : '.') +
      ` "${created.description.slice(0, 140)}"`,
    linkUrl: `/service-requests/${created.id}`,
    metadata: { requestNumber, serviceId: service.id, district: created.addressSnapshot.district },
  });
  await notifications.notifyCustomer(userId, {
    type: 'SERVICE_UPDATE',
    title: 'Booking received',
    message: `We received your ${service.nameEn} booking ${requestNumber}. We will confirm it shortly.`,
    linkUrl: `/account/services/${created.id}`,
  });
  return formatRequest(created);
}

async function listMyRequests(userId, lang) {
  const rows = await prisma.serviceRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { service: true, provider: true },
  });
  return rows.map((r) => formatRequest(r, { lang }));
}

async function getMyRequest(userId, id, lang) {
  const r = await prisma.serviceRequest.findFirst({ where: { id, userId }, include: REQUEST_DETAIL_INCLUDE });
  if (!r) throw new AppError('Booking not found', 404);
  return formatRequest(r, { lang });
}

async function cancelMyRequest(userId, id, reason) {
  const r = await prisma.serviceRequest.findFirst({ where: { id, userId }, include: { service: true } });
  if (!r) throw new AppError('Booking not found', 404);
  if (!CUSTOMER_CANCELLABLE.includes(r.status)) {
    throw new AppError('This booking can no longer be cancelled. Please message us for help.', 409);
  }
  const note = reason ? String(reason).slice(0, 500) : 'Cancelled by customer';
  const updated = await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelReason: note,
      events: { create: [{ statusFrom: r.status, statusTo: 'CANCELLED', actorType: 'CUSTOMER', note }] },
    },
    include: REQUEST_DETAIL_INCLUDE,
  });
  await notifications.notifyAdmins({
    type: notifications.ADMIN_NOTIFICATION_TYPES.SERVICE_REQUEST_CANCELLED,
    title: `Booking ${r.requestNumber} cancelled`,
    message: `The customer cancelled their ${r.service.nameEn} booking. ${reason ? `Reason: ${note}` : ''}`.trim(),
    linkUrl: `/service-requests/${id}`,
  });
  return formatRequest(updated);
}

// ---------------- staff ----------------
async function listAdminRequests({ page = 1, limit = 20, status = null, serviceId = null, search = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const where = {};
  if (status && REQUEST_TRANSITIONS[status]) where.status = status;
  if (serviceId) where.serviceId = parseInt(serviceId, 10);
  if (search && String(search).trim()) {
    const q = String(search).trim().slice(0, 100);
    where.OR = [
      { requestNumber: { contains: q, mode: 'insensitive' } },
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
      { user: { phone: { contains: q } } },
      { contactPhone: { contains: q } },
    ];
  }
  const [total, rows, counts] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { service: true, provider: true, user: { select: { id: true, fullName: true, phone: true, email: true } } },
    }),
    prisma.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  return {
    items: rows.map((r) => formatRequest(r, { forAdmin: true })),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

async function getAdminRequest(id) {
  const r = await prisma.serviceRequest.findUnique({ where: { id }, include: REQUEST_DETAIL_INCLUDE });
  if (!r) throw new AppError('Booking not found', 404);
  return formatRequest(r, { forAdmin: true });
}

/**
 * Staff update: status transition, technician assignment, quote, schedule.
 * Assigning a technician to a PENDING/CONFIRMED booking moves it to ASSIGNED.
 */
async function adminUpdateRequest(id, input, admin, ipAddress) {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id, status FROM service_requests WHERE id = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) throw new AppError('Booking not found', 404);
    const current = rows[0].status;
    const data = {};
    let toStatus = input.status || null;

    if (input.providerId !== undefined) {
      if (input.providerId === null) {
        data.providerId = null;
        if (current === 'ASSIGNED' && !toStatus) toStatus = 'CONFIRMED';
      } else {
        const provider = await tx.serviceProvider.findFirst({ where: { id: input.providerId, isActive: true } });
        if (!provider) throw new AppError('Technician not found or inactive', 422);
        data.providerId = provider.id;
        if (['PENDING', 'CONFIRMED'].includes(current) && !toStatus) toStatus = 'ASSIGNED';
      }
    }
    if (input.quotedPriceUgx !== undefined) data.quotedPriceUgx = input.quotedPriceUgx;
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt;

    if (toStatus && toStatus !== current) {
      if (!(REQUEST_TRANSITIONS[current] || []).includes(toStatus)) {
        throw new AppError(`Invalid booking transition: ${current} → ${toStatus}`, 409);
      }
      if (toStatus === 'ASSIGNED' && !data.providerId) {
        const existing = await tx.serviceRequest.findUnique({ where: { id }, select: { providerId: true } });
        if (!existing.providerId) throw new AppError('Assign a technician first', 422);
      }
      if (toStatus === 'IN_PROGRESS' || toStatus === 'COMPLETED') {
        const existing = await tx.serviceRequest.findUnique({ where: { id }, select: { providerId: true } });
        if (!existing.providerId && !data.providerId) throw new AppError('Assign a technician first', 422);
      }
      data.status = toStatus;
      if (toStatus === 'COMPLETED') data.completedAt = new Date();
      if (toStatus === 'CANCELLED') data.cancelReason = input.note ? String(input.note).slice(0, 500) : 'Cancelled by UgaMarket';
      data.events = {
        create: [{ statusFrom: current, statusTo: toStatus, actorType: 'ADMIN', adminId: admin.id, note: input.note || null }],
      };
    } else if (input.note) {
      data.events = { create: [{ statusFrom: current, statusTo: current, actorType: 'ADMIN', adminId: admin.id, note: input.note }] };
    }

    const updated = await tx.serviceRequest.update({ where: { id }, data, include: REQUEST_DETAIL_INCLUDE });
    return { updated, previous: current, changedStatus: data.status && data.status !== current ? data.status : null };
  });

  await logAudit({
    adminId: admin.id,
    action: 'SERVICE_REQUEST_UPDATE',
    entityName: 'ServiceRequest',
    entityId: id,
    details: { ...input, from: result.previous, to: result.changedStatus },
    ipAddress,
  });

  const r = result.updated;
  const template = result.changedStatus && STATUS_MESSAGES[result.changedStatus];
  if (template) {
    await notifications.notifyCustomer(r.userId, {
      type: 'SERVICE_UPDATE',
      title: template[0],
      message: template[1]
        .replace('{s}', r.service.nameEn)
        .replace('{n}', r.requestNumber)
        .replace('{p}', r.provider ? `${r.provider.fullName} (${r.provider.phone})` : 'A technician'),
      linkUrl: `/account/services/${r.id}`,
    });
  } else if (input.quotedPriceUgx !== undefined && input.quotedPriceUgx !== null) {
    await notifications.notifyCustomer(r.userId, {
      type: 'SERVICE_UPDATE',
      title: 'Price confirmed',
      message: `The price for your ${r.service.nameEn} booking ${r.requestNumber} is ${formatUGX(input.quotedPriceUgx)}.`,
      linkUrl: `/account/services/${r.id}`,
    });
  }
  realtime.publish(`user:${r.userId}`, 'service:update', { id: r.id, status: r.status });
  return formatRequest(r, { forAdmin: true });
}

async function recordPayment(id, { method, reference, amountUgx }, admin, ipAddress) {
  const r = await prisma.serviceRequest.findUnique({ where: { id }, include: { service: true } });
  if (!r) throw new AppError('Booking not found', 404);
  if (r.status === 'CANCELLED') throw new AppError('Cannot record payment for a cancelled booking', 409);
  if (r.paymentStatus === 'PAID') throw new AppError('Payment is already recorded for this booking', 409);

  const updated = await prisma.serviceRequest.update({
    where: { id },
    data: {
      paymentStatus: 'PAID',
      paymentMethod: method,
      paymentRef: reference,
      quotedPriceUgx: amountUgx !== undefined && amountUgx !== null ? amountUgx : r.quotedPriceUgx,
      events: {
        create: [{
          statusFrom: r.status,
          statusTo: r.status,
          actorType: 'ADMIN',
          adminId: admin.id,
          note: `Payment recorded: ${method === 'AIRTEL_MONEY' ? 'Airtel Money' : 'MTN MoMo'} ref ${reference}`,
        }],
      },
    },
    include: REQUEST_DETAIL_INCLUDE,
  });
  await logAudit({ adminId: admin.id, action: 'SERVICE_PAYMENT_RECORDED', entityName: 'ServiceRequest', entityId: id, details: { method, reference, amountUgx }, ipAddress });
  await notifications.notifyCustomer(r.userId, {
    type: 'SERVICE_UPDATE',
    title: 'Payment received',
    message: `We recorded your payment for ${r.service.nameEn} booking ${r.requestNumber}. Thank you!`,
    linkUrl: `/account/services/${id}`,
  });
  return formatRequest(updated, { forAdmin: true });
}

async function getRequestRoute(id) {
  const r = await prisma.serviceRequest.findUnique({ where: { id }, select: { addressSnapshot: true, requestNumber: true } });
  if (!r) throw new AppError('Booking not found', 404);
  const to = coordsOf(r.addressSnapshot);
  if (!to) throw new AppError('This booking address has no map location', 409);
  const config = await getActiveDeliveryConfig();
  if (!config) throw new AppError('Dispatch location is not configured', 400);
  const from = { lat: Number(config.warehouseLat), lng: Number(config.warehouseLng) };
  const route = await getRoute(from, to, { geometry: true });
  return {
    origin: { ...from, name: config.warehouseName || 'UgaMarket dispatch' },
    destination: { ...to, label: r.addressSnapshot.formattedAddress || r.addressSnapshot.streetAddress },
    distanceKm: route.distanceKm,
    straightLineKm: route.straightLineKm,
    etaMinutes: route.durationMinutes,
    distanceSource: route.source,
    geometry: route.geometry,
  };
}

module.exports = {
  TIME_SLOTS,
  REQUEST_TRANSITIONS,
  listPublicServices,
  getPublicService,
  listAdminServices,
  createService,
  updateService,
  listProviders,
  createProvider,
  updateProvider,
  createRequest,
  listMyRequests,
  getMyRequest,
  cancelMyRequest,
  listAdminRequests,
  getAdminRequest,
  adminUpdateRequest,
  recordPayment,
  getRequestRoute,
};
