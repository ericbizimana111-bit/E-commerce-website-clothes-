/**
 * Phase 12 Step 2 verification — payment controller method-hint routing.
 *
 * The initiation endpoint accepts an OPTIONAL, NON-authoritative payment
 * `method` (MTN_MOBILE_MONEY | AIRTEL_MONEY | CARD) as a rail hint. The
 * validator preserves it; this suite pins the controller wiring so the hint
 * actually reaches payment.service (a regression here silently breaks
 * provider rail selection for providers that require an explicit network,
 * e.g. Flutterwave UG mobile money).
 *
 * Pure unit test: payment.service and order.service are mocked — no DB.
 */

jest.mock('../src/services/payment.service', () => ({
  initiatePayment: jest.fn(),
  formatPayment: jest.fn(() => ({ id: 'payment-1' })),
}));

jest.mock('../src/services/order.service', () => ({
  formatOrder: jest.fn(() => ({ id: 'order-1' })),
}));

const paymentService = require('../src/services/payment.service');
const orderService = require('../src/services/order.service');
const paymentController = require('../src/controllers/payment.controller');

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('payment controller — method hint passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentService.initiatePayment.mockResolvedValue({
      payment: { id: 'payment-1', purpose: 'COMMITMENT', status: 'PENDING' },
      order: { id: 'order-1' },
      reused: false,
      initiation: { checkoutUrl: 'https://checkout.example/confirm/144:abc123' },
    });
  });

  test('forwards the client method hint to payment.service.initiatePayment', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { id: 'order-1' },
      body: { purpose: 'COMMITMENT', method: 'MTN_MOBILE_MONEY' },
    };
    const res = makeRes();
    await paymentController.initiatePayment(req, res, () => {});

    expect(paymentService.initiatePayment).toHaveBeenCalledTimes(1);
    expect(paymentService.initiatePayment).toHaveBeenCalledWith('user-1', 'order-1', {
      purpose: 'COMMITMENT',
      method: 'MTN_MOBILE_MONEY',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.checkoutUrl).toBe('https://checkout.example/confirm/144:abc123');
  });

  test('forwards AIRTEL_MONEY hint', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { id: 'order-1' },
      body: { purpose: 'COMMITMENT', method: 'AIRTEL_MONEY' },
    };
    const res = makeRes();
    await paymentController.initiatePayment(req, res, () => {});

    expect(paymentService.initiatePayment).toHaveBeenCalledWith('user-1', 'order-1', {
      purpose: 'COMMITMENT',
      method: 'AIRTEL_MONEY',
    });
  });

  test('passes method undefined when the client omits it', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { id: 'order-1' },
      body: { purpose: 'COMMITMENT' },
    };
    const res = makeRes();
    await paymentController.initiatePayment(req, res, () => {});

    expect(paymentService.initiatePayment).toHaveBeenCalledWith('user-1', 'order-1', {
      purpose: 'COMMITMENT',
      method: undefined,
    });
  });

  test('forwards errors to next() without exposing internals', async () => {
    paymentService.initiatePayment.mockRejectedValue(new Error('Payment initiation failed: provider refused'));
    const req = {
      user: { id: 'user-1' },
      params: { id: 'order-1' },
      body: { purpose: 'COMMITMENT', method: 'CARD' },
    };
    const next = jest.fn();
    await paymentController.initiatePayment(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('provider refused');
  });

  test('order.service.formatOrder is used for the order projection (wiring intact)', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { id: 'order-1' },
      body: { purpose: 'COMMITMENT', method: 'MTN_MOBILE_MONEY' },
    };
    await paymentController.initiatePayment(req, makeRes(), () => {});
    expect(orderService.formatOrder).toHaveBeenCalled();
  });
});
