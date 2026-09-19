import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import OrderDetailPage from './OrderDetailPage';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../components/feedback/Toast';

/**
 * Integration-style tests against the ACTUAL backend contract shapes
 * (verified against backend controllers):
 *  - GET  /api/admin/orders/:id        -> { data: { order } } (order includes
 *     pricing, fulfillment, items, statusHistory, customer)
 *  - GET  /api/admin/orders/:id/payment -> { data: { pricing, payments, ... } }
 *  - PATCH /api/admin/orders/:id/status -> { data: { order } }
 */

const ORDER = {
  id: 'ord-1',
  orderNumber: 'FB-20260919-ABC123',
  status: 'COMMITMENT_PAID',
  createdAt: '2026-09-19T09:00:00.000Z',
  fulfillment: {
    method: 'HOME_DELIVERY',
    address: { title: 'Home', streetAddress: 'Plot 12 Ntinda', district: 'Kampala' },
  },
  pricing: {
    itemsSubtotalUgx: 40000,
    deliveryFeeUgx: 6000,
    totalUgx: 46000,
    commitmentUgx: 13800,
    remainingBalanceUgx: 32200,
  },
  items: [
    {
      id: 'it-1',
      productName: 'Fresh Green Matooke',
      unit: 'bunch',
      quantity: 2,
      unitPriceUgx: 20000,
      lineTotalUgx: 40000,
    },
  ],
  statusHistory: [
    { id: 'h1', fromStatus: null, toStatus: 'PENDING_PAYMENT', changedByType: 'CUSTOMER', createdAt: '2026-09-19T09:00:00.000Z' },
    { id: 'h2', fromStatus: 'PENDING_PAYMENT', toStatus: 'COMMITMENT_PAID', changedByType: 'SYSTEM', createdAt: '2026-09-19T09:10:00.000Z' },
  ],
  customer: { id: 'u1', fullName: 'Sarah Namubiru', phone: '+256770000000', email: null },
};

const PAYMENT = {
  orderId: 'ord-1',
  orderNumber: 'FB-20260919-ABC123',
  pricing: {
    totalUgx: 46000,
    commitmentUgx: 13800,
    remainingBalanceUgx: 32200,
    commitmentPaidUgx: 13800,
    balancePaidUgx: 0,
    totalPaidUgx: 13800,
  },
  payments: [
    {
      id: 'pay-1',
      purpose: 'COMMITMENT',
      provider: 'MOCK',
      transactionRef: 'PAY-abc',
      amountUgx: 13800,
      status: 'SUCCESS',
      createdAt: '2026-09-19T09:10:00.000Z',
    },
  ],
};

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/orders/ord-1']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/orders" element={<div>orders list</div>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('OrderDetailPage (real backend contract)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ugamarket_admin_token', 'test-token');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders order, customer, pricing, and payment data from the actual response shapes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/payment')) return Promise.resolve(jsonRes({ success: true, data: PAYMENT }));
        return Promise.resolve(jsonRes({ success: true, data: { order: ORDER } }));
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument());

    // Server-authoritative pricing from order.pricing (getAllByText: the
    // commitment amount also appears in the payments breakdown)
    expect(screen.getByText('UGX 46,000')).toBeInTheDocument(); // total
    expect(screen.getAllByText('UGX 13,800').length).toBeGreaterThan(0); // commitment
    expect(screen.getAllByText('UGX 32,200').length).toBeGreaterThan(0); // remaining balance

    // Customer block (never password material)
    expect(screen.getByText('Sarah Namubiru')).toBeInTheDocument();
    expect(screen.getByText('+256770000000')).toBeInTheDocument();

    // Payment attempt rendered from payment.payments ("Commitment Paid"
    // appears both as the order status badge and the history entry)
    expect(screen.getByText('PAY-abc')).toBeInTheDocument();
    expect(screen.getAllByText('Commitment Paid').length).toBeGreaterThan(0);
  });

  it('offers only valid suggested transitions for the current status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/payment')) return Promise.resolve(jsonRes({ success: true, data: PAYMENT }));
        return Promise.resolve(jsonRes({ success: true, data: { order: ORDER } }));
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument());

    // COMMITMENT_PAID suggests CONFIRMED and CANCELLED only
    expect(screen.getByRole('button', { name: 'Move to Confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Cancelled' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delivered/i })).not.toBeInTheDocument();
  });

  it('sends the status transition to the backend and refreshes state', async () => {
    const fetchMock = vi.fn((url, init) => {
      if (url.includes('/payment')) return Promise.resolve(jsonRes({ success: true, data: PAYMENT }));
      if (init?.method === 'PATCH') {
        return Promise.resolve(
          jsonRes({ success: true, data: { order: { ...ORDER, status: 'CONFIRMED' } } }),
        );
      }
      return Promise.resolve(jsonRes({ success: true, data: { order: ORDER } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Move to Confirmed' }));

    // Confirmation dialog gates the consequential transition
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(withinDialog(dialog, 'Apply transition'));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const [url, init] = patch;
      expect(url).toContain('/admin/orders/ord-1/status');
      expect(JSON.parse(init.body).status).toBe('CONFIRMED');
    });

    // Success toast uses specific (not generic) feedback
    await waitFor(() =>
      expect(screen.getByText(/Order status updated to Confirmed/)).toBeInTheDocument(),
    );
  });

  it('shows a permission/409 message when the backend rejects the transition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init) => {
        if (url.includes('/payment')) return Promise.resolve(jsonRes({ success: true, data: PAYMENT }));
        if (init?.method === 'PATCH') {
          return Promise.resolve(
            jsonRes({ success: false, message: 'Order cannot transition from COMMITMENT_PAID to DELIVERED' }, 409),
          );
        }
        return Promise.resolve(jsonRes({ success: true, data: { order: ORDER } }));
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Move to Confirmed' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(withinDialog(dialog, 'Apply transition'));

    await waitFor(() =>
      expect(screen.getByText(/backend rejected this transition/i)).toBeInTheDocument(),
    );
  });

  it('renders the error state when the order cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonRes({ success: false, message: 'Order not found' }, 404))),
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('Unable to load data')).toBeInTheDocument());
  });
});

/** Fire a click on a button inside a dialog by accessible name. */
function withinDialog(dialog, name) {
  const buttons = [...dialog.querySelectorAll('button')];
  const target = buttons.find((b) => b.textContent.includes(name));
  if (!target) throw new Error(`Button "${name}" not found in dialog`);
  fireEvent.click(target);
  return target;
}
