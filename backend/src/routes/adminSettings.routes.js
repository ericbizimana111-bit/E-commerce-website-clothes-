const express = require('express');
const { z } = require('zod');
const prisma = require('../config/db');
const { authenticateAdmin, requireRole } = require('../middleware/adminAuth');
const validateRequest = require('../middleware/requestValidator');
const { logAudit } = require('../services/audit.service');
const geo = require('../services/geo.service');
const { AppError } = require('../middleware/errorHandler');
const { calculateDeliveryFee } = require('../services/delivery.service');

/**
 * Store settings the owner controls from the console:
 *  - dispatch point (map location + name), delivery tariff, max distance
 *  - commitment (deposit) rule
 * Reads: every staff role. Writes: ADMIN / SUPER_ADMIN.
 */
const router = express.Router();
router.use(authenticateAdmin);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function formatDelivery(c) {
  if (!c) return null;
  return {
    warehouseName: c.warehouseName || '',
    warehouseLat: Number(c.warehouseLat),
    warehouseLng: Number(c.warehouseLng),
    baseFeeUgx: c.baseFeeUgx,
    freeRadiusKm: Number(c.freeRadiusKm),
    perKmRateUgx: c.perKmRateUgx,
    minimumFeeUgx: c.minimumFeeUgx,
    maxDeliveryKm: c.maxDeliveryKm !== null ? Number(c.maxDeliveryKm) : null,
    updatedAt: c.updatedAt,
  };
}

function formatCommitment(c) {
  if (!c) return null;
  return {
    ruleType: c.ruleType,
    percentageValue: Number(c.percentageValue),
    flatValueUgx: c.flatValueUgx,
    minCommitment: c.minCommitment,
    updatedAt: c.updatedAt,
  };
}

async function activeDelivery() {
  return prisma.deliveryPricingConfig.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
}
async function activeCommitment() {
  return prisma.commitmentRuleConfig.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
}

router.get('/', requireRole('DISPATCHER', 'ADMIN', 'SUPER_ADMIN'), wrap(async (req, res) => {
  const [delivery, commitment] = await Promise.all([activeDelivery(), activeCommitment()]);
  const d = formatDelivery(delivery);
  // Worked examples so staff can sanity-check the tariff.
  const examples = delivery ? [2, 5, 10, 20, 40].map((km) => ({ km, feeUgx: calculateDeliveryFee(delivery, km) })) : [];
  res.json({ success: true, data: { delivery: d, commitment: formatCommitment(commitment), examples } });
}));

router.put(
  '/delivery',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateRequest({
    body: z.object({
      warehouseName: z.string().trim().max(200).optional(),
      warehouseLat: z.coerce.number(),
      warehouseLng: z.coerce.number(),
      baseFeeUgx: z.coerce.number().int().min(0).max(1000000),
      freeRadiusKm: z.coerce.number().min(0).max(500),
      perKmRateUgx: z.coerce.number().int().min(0).max(100000),
      minimumFeeUgx: z.coerce.number().int().min(0).max(1000000),
      maxDeliveryKm: z.coerce.number().min(1).max(1000).nullable().optional(),
    }),
  }),
  wrap(async (req, res) => {
    const b = req.body;
    if (!geo.isValidCoordinate(b.warehouseLat, b.warehouseLng) || !geo.isInsideUgandaBounds(b.warehouseLat, b.warehouseLng)) {
      throw new AppError('The dispatch location must be inside Uganda', 422);
    }
    const current = await activeDelivery();
    const data = {
      warehouseName: b.warehouseName || null,
      warehouseLat: b.warehouseLat,
      warehouseLng: b.warehouseLng,
      baseFeeUgx: b.baseFeeUgx,
      freeRadiusKm: b.freeRadiusKm,
      perKmRateUgx: b.perKmRateUgx,
      minimumFeeUgx: b.minimumFeeUgx,
      maxDeliveryKm: b.maxDeliveryKm ?? null,
      isActive: true,
    };
    const saved = current
      ? await prisma.deliveryPricingConfig.update({ where: { id: current.id }, data })
      : await prisma.deliveryPricingConfig.create({ data });
    await logAudit({ adminId: req.admin.id, action: 'DELIVERY_SETTINGS_UPDATE', entityName: 'DeliveryPricingConfig', entityId: String(saved.id), details: b, ipAddress: req.ip });
    res.json({ success: true, message: 'Delivery settings saved', data: { delivery: formatDelivery(saved) } });
  })
);

router.put(
  '/commitment',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateRequest({
    body: z.object({
      ruleType: z.enum(['PERCENTAGE', 'FLAT']),
      percentageValue: z.coerce.number().min(0).max(100),
      flatValueUgx: z.coerce.number().int().min(0).max(100000000),
      minCommitment: z.coerce.number().int().min(0).max(100000000),
    }),
  }),
  wrap(async (req, res) => {
    const current = await activeCommitment();
    const data = { ...req.body, isActive: true };
    const saved = current
      ? await prisma.commitmentRuleConfig.update({ where: { id: current.id }, data })
      : await prisma.commitmentRuleConfig.create({ data });
    await logAudit({ adminId: req.admin.id, action: 'COMMITMENT_SETTINGS_UPDATE', entityName: 'CommitmentRuleConfig', entityId: String(saved.id), details: req.body, ipAddress: req.ip });
    res.json({ success: true, message: 'Deposit rule saved', data: { commitment: formatCommitment(saved) } });
  })
);

module.exports = router;
