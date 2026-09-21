/**
 * Phase 13 — Customer mobile money network selection.
 *
 * Verifies that OrderDetail shows the MTN / Airtel selector when a payment
 * action is available and that the selected method is forwarded in the
 * POST /orders/:id/payment call.
 *
 * No real payment logic is exercised — payment.service and apiClient are both
 * mocked at the module level.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import OrderDetail from './OrderDetail';

// ── Module-level mocks ────────────────────────────────────────────────────────

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('../../Context/LanguageContext', () => ({
  useLanguage: () => ({ currentLang: 'en' }),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const ORDER_PENDING = {
  id: 'order-1',
  orderNumber: 'UGM-2026-001',
  status: 'PENDING_PAYMENT',
  createdAt: '2026-01-01T10:00:00Z',
  fulfillment: {
    method: 'HOME_DELIVERY',
    address: { title: 'Home', streetAddress: '1 Kampala Road', division: 'Nakawa', district: 'Kampala' },
  },
  items: [{ id: 'item-1', productName: 'Matooke', unit: 'bunch', unitPriceUgx: 10000, quantity: 2, lineTotalUgx: 20000 }],
  pricing: {
    itemsSubtotalUgx: 20000,
    deliveryFeeUgx: 3000,
    totalUgx: 23000,
    commitmentUgx: 6900,
    remainingBalanceUgx: 16100,
  },
  statusHistory: [],
  payments: [],
};

const PAYMENT_INFO_UNPAID = {
  pricing: {
    commitmentPaidUgx: 0,
    balancePaidUgx: 0,
    remainingBalanceUgx: 16100,
    totalPaidUgx: 0,
  },
  payments: [],
  commitmentPaymentStatus: 'UNPAID',
  balancePaymentStatus: 'UNPAID',
  activePayment: null,
  isFullyPaid: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupGetMocks(apiClient, order = ORDER_PENDING, paymentInfo = PAYMENT_INFO_UNPAID) {
  apiClient.get.mockImplementation(async (url) => {
    if (url.includes('/payment')) return { data: paymentInfo };
    if (url.includes('/delivery')) throw new Error('No delivery');
    return { data: { order } };
  });
}

function renderOrderDetail(orderId = 'order-1') {
  return render(
    <MemoryRouter initialEntries={[`/account/orders/${orderId}`]}>
      <Routes>
        <Route path="/account/orders/:id" element={<OrderDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrderDetail — payment method selection', () => {
  let apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = require('../../api/client').default;
    setupGetMocks(apiClient);
  });

  test('shows MTN, Airtel, and Card buttons when commitment payment is required', async () => {
    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    expect(screen.getByText('MTN Mobile Money')).toBeInTheDocument();
    expect(screen.getByText('Airtel Money')).toBeInTheDocument();
    expect(screen.getByText('Card / Visa / MasterCard')).toBeInTheDocument();
  });

  test('pay deposit button is disabled until a network is selected', async () => {
    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    const payBtns = screen.getAllByRole('button', { name: /Pay Deposit/i });
    expect(payBtns.length).toBeGreaterThanOrEqual(1);
    payBtns.forEach((btn) => expect(btn).toBeDisabled());
  });

  test('pay deposit button becomes enabled after selecting MTN Mobile Money', async () => {
    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    fireEvent.click(screen.getByText('MTN Mobile Money'));

    const payBtns = screen.getAllByRole('button', { name: /Pay Deposit/i });
    expect(payBtns.some((btn) => !btn.disabled)).toBe(true);
  });

  test('sends method: MTN_MOBILE_MONEY when MTN is selected and pay is clicked', async () => {
    apiClient.post.mockResolvedValue({
      success: true,
      message: 'Commitment payment initiated.',
      data: {
        payment: { id: 'pay-1', transactionRef: 'PAY-abc', status: 'PENDING', purpose: 'COMMITMENT', amountUgx: 6900 },
        checkoutUrl: null,
      },
    });

    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    fireEvent.click(screen.getByText('MTN Mobile Money'));

    const payBtn = screen.getAllByRole('button', { name: /Pay Deposit/i }).find((b) => !b.disabled);
    expect(payBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(payBtn);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/orders/order-1/payment',
      expect.objectContaining({ purpose: 'COMMITMENT', method: 'MTN_MOBILE_MONEY' }),
    );
  });

  test('sends method: AIRTEL_MONEY when Airtel Money is selected', async () => {
    apiClient.post.mockResolvedValue({
      success: true,
      message: 'Commitment payment initiated.',
      data: {
        payment: { id: 'pay-2', transactionRef: 'PAY-xyz', status: 'PENDING', purpose: 'COMMITMENT', amountUgx: 6900 },
        checkoutUrl: null,
      },
    });

    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    // Click Airtel (there are 2 Airtel buttons — commitment banner; both target same state)
    const airtelBtns = screen.getAllByText('Airtel Money');
    fireEvent.click(airtelBtns[0]);

    const payBtn = screen.getAllByRole('button', { name: /Pay Deposit/i }).find((b) => !b.disabled);
    await act(async () => {
      fireEvent.click(payBtn);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/orders/order-1/payment',
      expect.objectContaining({ purpose: 'COMMITMENT', method: 'AIRTEL_MONEY' }),
    );
  });

  test('pay deposit button becomes enabled after selecting Card / Visa / MasterCard', async () => {
    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    fireEvent.click(screen.getByText('Card / Visa / MasterCard'));

    const payBtns = screen.getAllByRole('button', { name: /Pay Deposit/i });
    expect(payBtns.some((btn) => !btn.disabled)).toBe(true);
  });

  test('sends method: CARD when Card / Visa / MasterCard is selected and pay is clicked', async () => {
    apiClient.post.mockResolvedValue({
      success: true,
      message: 'Card payment initiated.',
      data: {
        payment: { id: 'pay-card', transactionRef: 'PAY-card', status: 'PENDING', purpose: 'COMMITMENT', amountUgx: 6900 },
        checkoutUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/abc',
      },
    });

    // Prevent actual navigation (jsdom doesn't support window.location.href assignment as navigation)
    delete window.location;
    window.location = { href: '' };

    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    fireEvent.click(screen.getByText('Card / Visa / MasterCard'));

    const payBtn = screen.getAllByRole('button', { name: /Pay Deposit/i }).find((b) => !b.disabled);
    await act(async () => {
      fireEvent.click(payBtn);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/orders/order-1/payment',
      expect.objectContaining({ purpose: 'COMMITMENT', method: 'CARD' }),
    );
  });

  test('network selection resets after a payment attempt completes', async () => {
    apiClient.post.mockResolvedValue({
      success: true,
      message: 'Commitment payment initiated.',
      data: {
        payment: { id: 'pay-3', transactionRef: 'PAY-zzz', status: 'PENDING', purpose: 'COMMITMENT', amountUgx: 6900 },
        checkoutUrl: null,
      },
    });

    renderOrderDetail();
    await screen.findByText(/Action Required: Pay Commitment Deposit/i);

    fireEvent.click(screen.getByText('MTN Mobile Money'));

    const payBtn = screen.getAllByRole('button', { name: /Pay Deposit/i }).find((b) => !b.disabled);
    await act(async () => {
      fireEvent.click(payBtn);
    });

    await waitFor(() => {
      // After the attempt the network buttons should be un-pressed (aria-pressed=false)
      const mtnBtn = screen.queryByText('MTN Mobile Money');
      if (mtnBtn) expect(mtnBtn.closest('button')).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
