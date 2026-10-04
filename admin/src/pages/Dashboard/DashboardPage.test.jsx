import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../components/feedback/Toast';

/**
 * Tests against the actual backend contract shapes:
 *  - GET /api/admin/dashboard/summary          -> { success, data: { today, queues, trend } }
 *  - GET /api/admin/orders                     -> { success, items, pagination } (top level)
 *  - GET /api/admin/services/requests          -> { success, data: { items, ... } }
 */

const SUMMARY = {
  success: true,
  data: {
    today: { orders: 12, orderValueUgx: 845000, paymentsCollectedUgx: 254000, newCustomers: 3 },
    queues: {
      ordersNeedingAction: 4,
      ordersAwaitingPayment: 2,
      activeOrders: 9,
      activeDeliveries: 5,
      openServiceRequests: 6,
      newServiceRequests: 2,
      unreadMessages: 7,
      lowStockProducts: 1,
      unreadNotifications: 3,
    },
    customersTotal: 120,
    trend: [
      { date: '2026-09-28', orders: 3, revenueUgx: 90000 },
      { date: '2026-09-29', orders: 5, revenueUgx: 150000 },
      { date: '2026-09-30', orders: 0, revenueUgx: 0 },
      { date: '2026-10-01', orders: 8, revenueUgx: 400000 },
      { date: '2026-10-02', orders: 6, revenueUgx: 210000 },
      { date: '2026-10-03', orders: 9, revenueUgx: 330000 },
      { date: '2026-10-04', orders: 12, revenueUgx: 845000 },
    ],
  },
};

const ORDERS_LIST = {
  success: true,
  items: [
    {
      id: 'ord-1',
      orderNumber: 'UM-20261004-123456',
      status: 'COMMITMENT_PAID',
      createdAt: '2026-10-04T09:00:00.000Z',
      customer: { fullName: 'Sarah Namubiru' },
      fulfillment: { method: 'HOME_DELIVERY', address: { division: 'Ntinda', district: 'Kampala' } },
      pricing: { totalUgx: 46000 },
    },
  ],
  pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
};

const BOOKINGS = {
  success: true,
  data: {
    items: [
      {
        id: 'sr-1',
        requestNumber: 'SR-20261004-000001',
        status: 'PENDING',
        createdAt: '2026-10-04T08:00:00.000Z',
        service: { name: 'Plumbing' },
        customer: { fullName: 'John Okello' },
        address: { district: 'Wakiso' },
      },
    ],
  },
};

function stubFetch(routes) {
  const fn = vi.fn((url) => {
    const hit = routes.find((r) => String(url).includes(r.match));
    const status = hit ? hit.status || 200 : 500;
    const body = hit ? hit.body : { success: false, message: `Unexpected ${url}` };
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('DashboardPage (summary contract)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ugamarket_admin_token', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders KPIs, the 7-day trend, recent orders, attention items and bookings', async () => {
    stubFetch([
      { match: '/admin/dashboard/summary', body: SUMMARY },
      { match: '/admin/services/requests', body: BOOKINGS },
      { match: '/admin/orders', body: ORDERS_LIST },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('UM-20261004-123456')).toBeInTheDocument());
    expect(screen.getByText("Today's orders")).toBeInTheDocument();
    expect(screen.getByText('UGX 254,000')).toBeInTheDocument(); // collected today
    expect(screen.getByText('4 paid order(s) waiting to be confirmed')).toBeInTheDocument();
    expect(screen.getByText('7 unread customer message(s)')).toBeInTheDocument();
    expect(screen.getByText('2 new service booking(s) to confirm')).toBeInTheDocument();
    expect(screen.getByText('Ntinda, Kampala')).toBeInTheDocument();
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    // KPI cards link to their queues
    expect(screen.getByRole('link', { name: /Unread messages/i })).toHaveAttribute('href', '/messages');
  });

  it('shows the error state with retry when the summary fails', async () => {
    stubFetch([
      { match: '/admin/dashboard/summary', status: 500, body: { success: false, message: 'Database unavailable' } },
      { match: '/admin/orders', body: ORDERS_LIST },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Database unavailable')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('degrades gracefully when the bookings feed fails', async () => {
    stubFetch([
      { match: '/admin/dashboard/summary', body: SUMMARY },
      { match: '/admin/services/requests', status: 500, body: { success: false } },
      { match: '/admin/orders', body: ORDERS_LIST },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('UM-20261004-123456')).toBeInTheDocument());
    expect(screen.getByText('No home-service bookings yet.')).toBeInTheDocument();
  });
});
