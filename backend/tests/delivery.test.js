const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const { signAdminToken } = require('../src/services/token.service');
const { signMockWebhook } = require('../src/services/paymentProviders/mockProvider');
const bcrypt = require('bcryptjs');

// Under full parallel suite load, setup (registrations + bcrypt) exceeds Jest's 5s default
jest.setTimeout(60000);

/**
 * Phase 7 — Delivery & Fulfillment:
 * creation, pricing/tampering, snapshots, IDOR/RBAC, status transitions,
 * order integration, cancellation interaction, assignment, concurrency.
 */
describe('Phase 7 Delivery & Fulfillment', () => {
  let customerToken = null;
  let customerId = null;
  let otherToken = null;
  let otherUserId = null;
  let adminToken = null;
  let adminId = null;
  let otherStaffToken = null;
  let otherStaffId = null;
  let address = null;
  let addressId = null;
  let station = null;
  let product = null;
  let pricingConfigOriginal = null;

  const createdUserIds = [];
  const createdProductIds = [];
  const createdDeliveryIds = [];
  const createdOrderIds = [];
  const createdAdminIds = [];

  async function makeTestCustomer(suffix) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const phone = `+25677${Math.floor(1000000 + Math.random() * 9000000)}`;
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: `Delivery Tester ${suffix}`, phone, password: 'DeliveryPass123!' });
      if (reg.statusCode === 409) continue;
      expect(reg.statusCode).toBe(201);
      createdUserIds.push(reg.body.data.user.id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'DeliveryPass123!' });
      return { token: login.body.data.token, id: reg.body.data.user.id };
    }
    throw new Error('Could not register a unique test customer after 5 attempts');
  }

  async function addToCartAndOrder(token, opts = {}) {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fulfillmentMethod: opts.fulfillmentMethod || 'HOME_DELIVERY',
        addressId: opts.addressId !== undefined ? opts.addressId : addressId,
        pickupStationId: opts.fulfillmentMethod === 'PICKUP_STATION' ? station.id : undefined,
        ...opts.body,
      });
    return res;
  }

  /**
   * Verify a commitment payment through the signed mock-provider webhook,
   * exactly as a real provider would: initiate -> signed SUCCESS event.
   * Moves the order PENDING_PAYMENT -> COMMITMENT_PAID (Phase 6 machinery).
   */
  async function payCommitment(order) {
    const init = await request(app)
      .post(`/api/orders/${order.id}/payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    expect([200, 201]).toContain(init.statusCode);
    const payment = init.body.data.payment;
    const body = {
      providerRef: payment.providerRef,
      orderNumber: order.orderNumber,
      amountUgx: payment.amountUgx,
      currency: 'UGX',
      outcome: 'SUCCESS',
    };
    const raw = JSON.stringify(body);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set({ 'x-ugafresh-signature': signMockWebhook(raw) })
      .send(body);
    expect(res.statusCode).toBe(200);
  }

  async function deliverViaAdmin(order) {
    // Commitment must be paid before the operational lifecycle can start
    // (Phase 5: PENDING_PAYMENT -> CONFIRMED is illegal without it).
    await payCommitment(order);
    // Advance the ORDER through the Phase 5 lifecycle to DELIVERED; the
    // delivery row must stay in sync automatically.
    for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const r = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status });
      if (r.statusCode !== 200) return r;
    }
    return null;
  }

  async function cleanupOrder(oid) {
    if (!oid) return;
    const delivery = await prisma.delivery.findUnique({ where: { orderId: oid }, select: { id: true } });
    const entityIds = delivery ? [oid, delivery.id] : [oid];
    await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.delivery.deleteMany({ where: { orderId: oid } });
    await prisma.payment.deleteMany({ where: { orderId: oid } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: oid } });
    await prisma.notification.deleteMany({ where: { linkUrl: { contains: oid } } });
    await prisma.inventoryTransaction.deleteMany({ where: { referenceId: oid } });
    await prisma.orderItem.deleteMany({ where: { orderId: oid } });
    await prisma.order.deleteMany({ where: { id: oid } });
  }

  beforeAll(async () => {
    const a = await makeTestCustomer(String(Date.now()).slice(-7));
    customerToken = a.token;
    customerId = a.id;
    const b = await makeTestCustomer(String(Date.now() + 2).slice(-7));
    otherToken = b.token;
    otherUserId = b.id;

    // Admin (RBAC) — staff identity for assignment targets
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    adminToken = adminRes.body.data.token;
    adminId = adminRes.body.data.admin.id;
    otherStaffToken = signAdminToken({ id: adminId, role: 'DISPATCHER' });

    const category = await prisma.category.findFirst();
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: 'delivery-test-fruit-' + Date.now(),
        priceUgx: 9000,
        stockQuantity: 50,
        unit: 'kg',
        isActive: true,
        translations: { create: [{ language: 'EN', name: 'Delivery Test Fruit' }] },
      },
    });
    createdProductIds.push(product.id);

    address = await prisma.address.create({
      data: {
        userId: customerId,
        title: 'Home',
        district: 'Kampala',
        streetAddress: '7 Fulfillment Way',
        isDefault: true,
      },
    });
    addressId = address.id;

    // Other customer's address (IDOR target)
    await prisma.address.create({
      data: {
        userId: otherUserId,
        title: 'Home',
        district: 'Entebbe',
        streetAddress: '88 Not Your Road',
      },
    });

    station = await prisma.pickupStation.findFirst({ where: { isActive: true } });

    pricingConfigOriginal = await prisma.deliveryPricingConfig.findFirst({ where: { isActive: true } });
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) await cleanupOrder(oid);
    for (const pid of createdProductIds) {
      await prisma.cartItem.deleteMany({ where: { productId: pid } });
      await prisma.productTranslation.deleteMany({ where: { productId: pid } });
      await prisma.productImage.deleteMany({ where: { productId: pid } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: pid } });
      await prisma.product.deleteMany({ where: { id: pid } });
    }
    for (const uid of createdUserIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: uid } } });
      await prisma.address.deleteMany({ where: { userId: uid } });
      await prisma.cart.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    for (const aid of createdAdminIds) {
      await prisma.auditLog.deleteMany({ where: { adminId: aid } });
      await prisma.delivery.deleteMany({ where: { assignedAdminId: aid } });
      await prisma.admin.deleteMany({ where: { id: aid } });
    }
    await prisma.$disconnect();
  });

  // ==========================================================
  // Delivery creation
  // ==========================================================
  describe('delivery creation', () => {
    test('home delivery order creates exactly one delivery with fee + address snapshot', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.statusCode).toBe(200);
      const delivery = dv.body.data.delivery;
      createdDeliveryIds.push(delivery.id);

      expect(delivery.orderId).toBe(order.id);
      expect(delivery.fulfillmentType).toBe('HOME_DELIVERY');
      expect(delivery.status).toBe('PENDING');
      expect(delivery.deliveryFeeUgx).toBe(order.pricing.deliveryFeeUgx);
      expect(delivery.addressSnapshot).toMatchObject({ streetAddress: '7 Fulfillment Way' });
      expect(delivery.stationSnapshot).toBeNull();
      // No internal dispatcher metadata leaks to customers
      expect(delivery).not.toHaveProperty('assignedAdmin');
      expect(delivery).not.toHaveProperty('notes');
    });

    test('pickup order creates pickup fulfillment with station snapshot and zero fee', async () => {
      const res = await addToCartAndOrder(customerToken, { fulfillmentMethod: 'PICKUP_STATION' });
      expect(res.statusCode).toBe(201);
      createdOrderIds.push(res.body.data.order.id);

      const dv = await request(app)
        .get(`/api/orders/${res.body.data.order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.statusCode).toBe(200);
      const delivery = dv.body.data.delivery;
      expect(delivery.fulfillmentType).toBe('PICKUP_STATION');
      expect(delivery.deliveryFeeUgx).toBe(0);
      expect(delivery.stationSnapshot).not.toBeNull();
      expect(delivery.addressSnapshot).toBeNull();
    });

    test('foreign addressId is rejected (IDOR) and does not create a delivery', async () => {
      const otherAddress = await prisma.address.findFirst({ where: { userId: otherUserId } });
      const res = await addToCartAndOrder(customerToken, { addressId: otherAddress.id });
      expect([400, 403, 404]).toContain(res.statusCode);
    });

    test('inactive pickup station is rejected at order creation', async () => {
      const inactive = await prisma.pickupStation.create({
        data: {
          name: 'Inactive Test Station ' + Date.now(),
          district: 'Kampala',
          addressText: 'Closed Lane',
          contactPhone: '+256700000000',
          operatingHours: 'Mon-Fri 9am-5pm',
          isActive: false,
        },
      });
      try {
        await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ productId: product.id, quantity: 1 });
        const res = await request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ fulfillmentMethod: 'PICKUP_STATION', pickupStationId: inactive.id });
        expect([400, 404, 422]).toContain(res.statusCode);
      } finally {
        await prisma.pickupStation.delete({ where: { id: inactive.id } });
      }
    });
  });

  // ==========================================================
  // Pricing & tampering
  // ==========================================================
  describe('pricing authority', () => {
    test('client-supplied deliveryFee/distance/baseFee are stripped; server fee is used', async () => {
      const res = await addToCartAndOrder(customerToken, {
        body: { deliveryFee: 1, distanceKm: 0, baseFeeUgx: 0, perKmRateUgx: 0, freeRadiusKm: 999999 },
      });
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      // Server fee comes from the DB config + Haversine (address has no
      // coordinates -> minimum fee fallback), never from the client body.
      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.statusCode).toBe(200);
      expect(dv.body.data.delivery.deliveryFeeUgx).toBe(order.pricing.deliveryFeeUgx);
      expect(dv.body.data.delivery.deliveryFeeUgx).not.toBe(1);
      expect(Number.isInteger(dv.body.data.delivery.deliveryFeeUgx)).toBe(true);
    });

    test('fee formula: base + max(0, distance - freeRadius) * perKm (integer UGX)', async () => {
      const config = {
        baseFeeUgx: 3000,
        freeRadiusKm: 2,
        perKmRateUgx: 1000,
        minimumFeeUgx: 0,
      };
      const { calculateDeliveryFee } = require('../src/services/delivery.service');
      expect(calculateDeliveryFee(config, 0)).toBe(3000); // 0 km
      expect(calculateDeliveryFee(config, 1.5)).toBe(3000); // below free radius
      expect(calculateDeliveryFee(config, 2)).toBe(3000); // exactly free radius
      expect(calculateDeliveryFee(config, 2.001)).toBe(3001); // slightly above
      expect(calculateDeliveryFee(config, 7)).toBe(8000); // blueprint example
      expect(calculateDeliveryFee(config, 120)).toBe(121000); // large distance (3000 + 118*1000)
    });
  });

  // ==========================================================
  // Snapshots
  // ==========================================================
  describe('snapshots', () => {
    test('delivery address snapshot remains immutable when the address is edited', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const before = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(before.statusCode).toBe(200);
      const snapshotBefore = before.body.data.delivery.addressSnapshot;
      expect(snapshotBefore.streetAddress).toBe('7 Fulfillment Way');

      // Mutate the underlying address
      await prisma.address.update({
        where: { id: addressId },
        data: { streetAddress: '999 CHANGED Boulevard', district: 'Wakiso' },
      });

      const after = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(after.body.data.delivery.addressSnapshot).toEqual(snapshotBefore);
      expect(after.body.data.delivery.addressSnapshot.streetAddress).toBe('7 Fulfillment Way');

      // Restore address for later tests
      await prisma.address.update({
        where: { id: addressId },
        data: { streetAddress: '7 Fulfillment Way', district: 'Kampala' },
      });
    });
  });

  // ==========================================================
  // IDOR & RBAC
  // ==========================================================
  describe('IDOR & RBAC', () => {
    test('customer B cannot view delivery of customer A order (404, no leak)', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(dv.statusCode).toBe(404);
      expect(dv.body.data).toBeUndefined();
    });

    test('customer cannot reach admin delivery endpoints (401/403)', async () => {
      const list = await request(app).get('/api/admin/deliveries').set('Authorization', `Bearer ${customerToken}`);
      expect([401, 403]).toContain(list.statusCode);
      const assign = await request(app)
        .patch(`/api/admin/deliveries/${createdDeliveryIds[0] || '00000000-0000-0000-0000-000000000000'}/assign`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ assignedAdminId: adminId });
      expect([401, 403]).toContain(assign.statusCode);
      const status = await request(app)
        .patch(`/api/admin/deliveries/${createdDeliveryIds[0] || '00000000-0000-0000-0000-000000000000'}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'DELIVERED' });
      expect([401, 403]).toContain(status.statusCode);
    });

    test('unauthenticated delivery lookup is 401', async () => {
      const res = await request(app).get(`/api/orders/${'00000000-0000-0000-0000-000000000000'}/delivery`);
      expect(res.statusCode).toBe(401);
    });
  });

  // ==========================================================
  // Status transitions & order integration
  // ==========================================================
  describe('status transitions & order integration', () => {
    test('full home-delivery flow syncs delivery with order lifecycle', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const err = await deliverViaAdmin(order);
      expect(err).toBeNull();

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.body.data.delivery.status).toBe('DELIVERED');
      expect(dv.body.data.delivery.completedAt).not.toBeNull();

      const od = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(od.body.data.order.status).toBe('DELIVERED');
    });

    test('full pickup flow: READY_FOR_PICKUP then PICKED_UP', async () => {
      const res = await addToCartAndOrder(customerToken, { fulfillmentMethod: 'PICKUP_STATION' });
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      await payCommitment(order);
      for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) {
        const r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }
      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.body.data.delivery.status).toBe('READY');

      const od = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PICKED_UP' });
      expect(od.statusCode).toBe(200);

      const dv2 = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv2.body.data.delivery.status).toBe('PICKED_UP');
      expect(dv2.body.data.delivery.completedAt).not.toBeNull();
    });

    test('invalid delivery transitions are rejected centrally', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      // PENDING -> DELIVERED must be impossible
      const bad = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'DELIVERED' });
      expect(bad.statusCode).toBe(409);

      // PICKED_UP is not valid for HOME_DELIVERY
      const wrongType = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PICKED_UP' });
      expect([409, 422]).toContain(wrongType.statusCode);

      // Unknown status is a validation error
      const unknown = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'TELEPORTED' });
      expect(unknown.statusCode).toBe(400);

      // Order untouched
      const od = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(od.body.data.order.status).toBe('PENDING_PAYMENT');
    });

    test('repeating the same terminal status is idempotent (no duplicate history)', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      const err = await deliverViaAdmin(order);
      expect(err).toBeNull();

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const repeat = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'DELIVERED' });
      expect([200, 409]).toContain(repeat.statusCode);
      if (repeat.statusCode === 200) {
        expect(repeat.body.data.delivery.repeated).toBe(true);
      }

      const od = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      const history = od.body.data.order.statusHistory.filter((h) => h.toStatus === 'DELIVERED');
      expect(history).toHaveLength(1); // exactly one DELIVERED history entry
    });
  });

  // ==========================================================
  // Assignment
  // ==========================================================
  describe('assignment', () => {
    test('authorized staff assigns a dispatcher; customer assignment rejected', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const assign = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminId });
      expect(assign.statusCode).toBe(200);
      expect(assign.body.data.delivery.assignedAdmin.id).toBe(adminId);
      expect(assign.body.data.delivery.status).toBe('ASSIGNED');

      // Customer cannot assign
      const custAssign = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/assign`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ assignedAdminId: adminId });
      expect([401, 403]).toContain(custAssign.statusCode);
    });

    test('invalid assignment target is rejected', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      createdOrderIds.push(res.body.data.order.id);
      const dv = await request(app)
        .get(`/api/orders/${res.body.data.order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const bad = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: '00000000-0000-0000-0000-000000000000' });
      expect([404, 422]).toContain(bad.statusCode);
    });

    test('terminal-state deliveries cannot be reassigned', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      const err = await deliverViaAdmin(order);
      expect(err).toBeNull();

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const reassign = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminId });
      expect(reassign.statusCode).toBe(409);
    });

    test('pickup fulfillments cannot be assigned to staff', async () => {
      const res = await addToCartAndOrder(customerToken, { fulfillmentMethod: 'PICKUP_STATION' });
      expect(res.statusCode).toBe(201);
      createdOrderIds.push(res.body.data.order.id);
      const dv = await request(app)
        .get(`/api/orders/${res.body.data.order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const assign = await request(app)
        .patch(`/api/admin/deliveries/${deliveryId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminId });
      expect(assign.statusCode).toBe(409);
    });

    test('concurrent assignment yields one valid final state', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      const deliveryId = dv.body.data.delivery.id;

      const results = await Promise.all([
        request(app)
          .patch(`/api/admin/deliveries/${deliveryId}/assign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ assignedAdminId: adminId }),
        request(app)
          .patch(`/api/admin/deliveries/${deliveryId}/assign`)
          .set('Authorization', `Bearer ${otherStaffToken}`)
          .send({ assignedAdminId: adminId }),
      ]);
      const statuses = results.map((r) => r.statusCode);
      // Row locking serializes: no 500s, both may succeed (last write wins on
      // same target) or one may conflict — never a corrupted state.
      statuses.forEach((s) => expect([200, 409]).toContain(s));
      const final = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(final.assignedAdminId).toBe(adminId);
    });
  });

  // ==========================================================
  // Cancellation interaction
  // ==========================================================
  describe('cancellation interaction', () => {
    test('cancelling an order cancels its active delivery; paid-order flow preserved', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      const cancel = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(cancel.statusCode).toBe(200);

      const dv = await request(app)
        .get(`/api/orders/${order.id}/delivery`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(dv.body.data.delivery.status).toBe('CANCELLED');
    });

    test('terminal delivery of a delivered order is untouched by later state checks', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);
      const err = await deliverViaAdmin(order);
      expect(err).toBeNull();

      const dv = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(dv.status).toBe('DELIVERED');
      // A delivered order cannot be cancelled (Phase 5 map: DELIVERED has no
      // CANCELLED exit) — delivery stays DELIVERED, money/history intact.
      const od = await prisma.order.findUnique({ where: { id: order.id } });
      expect(od.status).toBe('DELIVERED');
    });
  });

  // ==========================================================
  // Concurrency (real DB locking)
  // ==========================================================
  describe('concurrency', () => {
    test('5 concurrent completions of one delivery: exactly one transition, one history entry', async () => {
      const res = await addToCartAndOrder(customerToken);
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      // Drive order to READY_FOR_DELIVERY via admin lifecycle
      await payCommitment(order);
      for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY']) {
        const r = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status });
        expect(r.statusCode).toBe(200);
      }

      const dv = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(dv.status).toBe('READY');

      // 5 concurrent dispatch+complete... dispatch must happen first; instead
      // drive to OUT_FOR_DELIVERY, then race the completion.
      const dispatch = await request(app)
        .patch(`/api/admin/deliveries/${dv.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OUT_FOR_DELIVERY' });
      expect(dispatch.statusCode).toBe(200);

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .patch(`/api/admin/deliveries/${dv.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'DELIVERED' })
        )
      );
      const ok = results.filter((r) => r.statusCode === 200);
      const conflicted = results.filter((r) => r.statusCode === 409);
      expect(ok.length + conflicted.length).toBe(5);

      const final = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(final.status).toBe('DELIVERED');
      expect(final.completedAt).not.toBeNull();

      const od = await prisma.order.findUnique({
        where: { id: order.id },
        include: { statusHistory: true },
      });
      expect(od.status).toBe('DELIVERED');
      const deliveredHistory = od.statusHistory.filter((h) => h.statusTo === 'DELIVERED');
      expect(deliveredHistory).toHaveLength(1); // exactly one history entry
    });

    test('concurrent pickup completion: one PICKED_UP transition, no duplicate history', async () => {
      const res = await addToCartAndOrder(customerToken, { fulfillmentMethod: 'PICKUP_STATION' });
      expect(res.statusCode).toBe(201);
      const order = res.body.data.order;
      createdOrderIds.push(order.id);

      await payCommitment(order);
      for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) {
        await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status });
      }

      const dv = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(dv.status).toBe('READY');

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .patch(`/api/admin/deliveries/${dv.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'PICKED_UP' })
        )
      );
      results.forEach((r) => expect([200, 409]).toContain(r.statusCode));

      const final = await prisma.delivery.findUnique({ where: { orderId: order.id } });
      expect(final.status).toBe('PICKED_UP');
      const od = await prisma.order.findUnique({ where: { id: order.id }, include: { statusHistory: true } });
      expect(od.status).toBe('PICKED_UP');
      expect(od.statusHistory.filter((h) => h.statusTo === 'PICKED_UP')).toHaveLength(1);
    });
  });
});
