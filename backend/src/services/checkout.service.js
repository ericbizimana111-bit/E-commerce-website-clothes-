const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const cartService = require('./cart.service');
const { resolveDeliveryFee } = require('./delivery.service');

/**
 * Checkout PREPARATION service — READ-ONLY.
 * Never creates orders, payments, reservations, or mutates stock.
 * The future Phase 5 checkout/order flow will reuse
 * cartService.validateCartForCheckout + inventory row locks in a single transaction.
 */

async function buildCheckoutPreview(userId, { fulfillmentMethod, addressId, pickupStationId }) {
  // 1. Validate + recalculate the cart (authoritative prices, stock, activity)
  const { items, issues, subtotalUgx } = await cartService.validateCartForCheckout(userId);

  // 2. Fulfillment validation + real delivery fee (shared with order creation)
  let deliveryFeeUgx = null;

  if (fulfillmentMethod === 'HOME_DELIVERY') {
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId }, // ownership enforced here — IDOR-safe
    });
    if (!address) {
      throw new AppError('Delivery address not found or does not belong to you', 404);
    }
    deliveryFeeUgx = await resolveDeliveryFee({ fulfillmentMethod, address });
  }

  if (fulfillmentMethod === 'PICKUP_STATION') {
    const station = await prisma.pickupStation.findFirst({
      where: { id: pickupStationId, isActive: true },
    });
    if (!station) {
      throw new AppError('Pickup station not found or is inactive', 404);
    }
  }

  // 3. Commitment preview from existing server configuration (commitment_rule_config)
  const rule = await prisma.commitmentRuleConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  const totalUgx = subtotalUgx + (deliveryFeeUgx || 0);
  let commitmentUgx = null;
  let remainingBalanceUgx = null;

  if (rule) {
    const { calculateCommitment } = require('../utils/currency');
    const computed = calculateCommitment(totalUgx, {
      ruleType: rule.ruleType,
      percentageValue: Number(rule.percentageValue),
      flatValueUgx: rule.flatValueUgx,
      minCommitment: rule.minCommitment,
    });
    commitmentUgx = computed.commitmentAmount;
    remainingBalanceUgx = computed.remainingBalance;
  }

  return {
    checkout: {
      ready: issues.length === 0,
      issues,
      fulfillment: {
        fulfillmentMethod,
        ...(fulfillmentMethod === 'HOME_DELIVERY' ? { addressId } : { pickupStationId }),
        deliveryFeeUgx,
      },
      pricing: {
        currency: 'UGX',
        subtotalUgx,
        totalUgx,
        commitmentUgx,
        remainingBalanceUgx,
        commitmentNote: rule
          ? 'Commitment calculated from current platform commitment rules'
          : 'Commitment rules are not configured; amounts unavailable',
      },
      items,
    },
  };
}

module.exports = {
  buildCheckoutPreview,
};
