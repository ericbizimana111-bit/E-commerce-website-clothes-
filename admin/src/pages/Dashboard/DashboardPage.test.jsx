import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../components/feedback/Toast';

/**
 * Tests against the ACTUAL backend contract shapes:
 *  - GET /api/admin/orders          -> { success, items, pagination } (top level)
 *  - GET /api/admin/deliveries      -> { success, data: { items, pagination } }
 *    and accepts exactly ONE status per request (single-value zod enum)
 *  - GET /api/admin/catalog/products -> { success, items, pagination } (top level)
 */

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ORDERS_LIST = {
  success: true,
  items: [
    {
      id: 'ord-1',
      orderNumber: 'FB-20260919-ABC123',
      status: 'COMMITMENT_PAID',
      createdAt: '2026-09-19T09:00:00.000Z',
      customer: { fullName: 'Sarah Namubiru' },
      pricing: { totalUgx: 46000 },
    },
    {
      id: 'ord-2',
      orderNumber: 'FB-20260919-DEF456',
      status: 'PENDING_PAYMENT',
      createdAt: '2026-09-19T10:00:00.000Z',
      customer: { fullName: 'John Okello' },
      pricing: { totalUgx: 12000 },
    },
  ],
  pagination: { page: 1, limit: 8, total: 2, totalPages: 1 },
};

const ORDERS_COUNTS = { success: true, items: [], pagination: { page: 1, limit: 1, total: 41, totalPages: 41 } };
const PENDING_PAY_COUNTS = { success: true, items: [], pagination: { page: 1, limit: 1, total: 3, totalPages: 3 } };

const deliveriesPage = (total) => ({
  success: true,
  data: { items: [], pagination: { page: 1, limit: 50, total, totalPages: Math.ceil(total / 50) } },
});

const LOW_STOCK = {
  success: true,
  items: [
    { id: 'p1', slug: 'fresh-green-matooke-cluster', stockQuantity: 0, isActive: true },
    { id: 'p2', slug: 'nakati-greens', stockQuantity: 2, isActive: true },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/orders/:id" element={<div>order detail</div>} />
            <Route path="/products" element={<div>products</div>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Standard fetch stub routing by URL pattern (handlers tried in order).
 *  `body` may be an object or a (url) => object function; a fresh Response is
 *  built per call because Response bodies can only be consumed once. */
function stubFetch(handlers) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      for (const { match, body, status = 200 } of handlers) {
        if (url.includes(match)) {
          const raw = typeof body === 'function' ? body(url) : body;
          return Promise.resolve(
            new Response(JSON.stringify(raw), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, message: 'Unexpected ' + url }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

describe('DashboardPage (real backend contract)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ugamarket_admin_token', 'test-token');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests each active delivery status separately (backend takes ONE status per request)', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/admin/deliveries')) {
        const status = new URL(url, 'http://localhost').searchParams.get('status');
        // A comma list would be a contract violation — reject it like the backend does.
        if (status && status.includes(',')) return Promise.resolve(jsonRes({ success: false, message: 'Validation failed' }, 400));
        return Promise.resolve(jsonRes(deliveriesPage(2)));
      }
      if (url.includes('/admin/catalog/products')) return Promise.resolve(jsonRes(LOW_STOCK));
      if (url.includes('/admin/orders?') && url.includes('limit=1')) {
        return url.includes('PENDING_PAYMENT')
          ? Promise.resolve(jsonRes(PENDING_PAY_COUNTS))
          : Promise.resolve(jsonRes(ORDERS_COUNTS));
      }
      if (url.includes('/admin/orders')) return Promise.resolve(jsonRes(ORDERS_LIST));
      return Promise.resolve(jsonRes({ success: false }, 500));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('41')).toBeInTheDocument(); // Total Orders KPI
    });

    const deliveryCalls = [...fetchMock.mock.calls].filter(([u]) => String(u).includes('/admin/deliveries'));
    expect(deliveryCalls.length).toBe(4); // PENDING, ASSIGNED, READY, OUT_FOR_DELIVERY
    const statuses = deliveryCalls.map(([u]) => new URL(u, 'http://localhost').searchParams.get('status'));
    expect(statuses.sort()).toEqual(['ASSIGNED', 'OUT_FOR_DELIVERY', 'PENDING', 'READY']);
    expect(statuses.every((s) => !s.includes(','))).toBe(true);
  });

  it('shows an error state for the deliveries feed and still renders the rest when deliveries returns 400', async () => {
    stubFetch([
      {
        match: '/admin/deliveries',
        status: 400,
        body: { success: false, message: 'Validation failed' },
      },
      { match: '/admin/catalog/products', body: LOW_STOCK },
      {
        match: '/admin/orders',
        body: (url) => {
          const u = new URL(url, 'http://localhost');
          if (u.searchParams.get('limit') === '1') {
            return u.searchParams.get('status') ? PENDING_PAY_COUNTS : ORDERS_COUNTS;
          }
          return ORDERS_LIST;
        },
      },
    ]);

    renderPage();

    // Deliveries section shows the inline error with retry — not a crash.
    await waitFor(() => {
      expect(screen.getByText('Active delivery data could not be loaded.')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0);

    // The rest of the dashboard still renders with real values.
    expect(screen.getByText('41')).toBeInTheDocument(); // Total Orders
    expect(screen.getByText('3')).toBeInTheDocument(); // Awaiting Payment
    expect(screen.getByText('2')).toBeInTheDocument(); // Out of Stock
    expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument(); // Recent orders table
  });

  it('shows a full-page error state with retry when the order statistics fail', async () => {
    stubFetch([
      {
        match: '/admin/orders',
        status: 500,
        body: { success: false, message: 'Database unavailable' },
      },
      { match: '/admin/deliveries', body: deliveriesPage(0) },
      { match: '/admin/catalog/products', body: LOW_STOCK },
    ]);

    renderPage();

    // ErrorState renders the generic heading; the specific message arrives
    // with the thrown ApiError ("Database unavailable").
    await waitFor(() => {
      expect(screen.getByText('Database unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // No KPI numbers rendered from a failed load.
    expect(screen.queryByText('41')).not.toBeInTheDocument();
  });

  it('renders the happy path: KPIs, recent orders, and stock alerts', async () => {
    stubFetch([
      { match: '/admin/deliveries', body: deliveriesPage(2) },
      { match: '/admin/catalog/products', body: LOW_STOCK },
      {
        match: '/admin/orders',
        body: (url) => {
          const u = new URL(url, 'http://localhost');
          if (u.searchParams.get('limit') === '1') {
            return u.searchParams.get('status') ? PENDING_PAY_COUNTS : ORDERS_COUNTS;
          }
          return ORDERS_LIST;
        },
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('41')).toBeInTheDocument(); // Total Orders
    });
    expect(screen.getByText('3')).toBeInTheDocument(); // Awaiting Payment
    expect(screen.getByText('8')).toBeInTheDocument(); // Active Deliveries (4 statuses × total 2)
    expect(screen.getByText('2')).toBeInTheDocument(); // Out of Stock
    expect(screen.getByText('FB-20260919-ABC123')).toBeInTheDocument();
    expect(screen.getByText('FB-20260919-DEF456')).toBeInTheDocument();
    expect(screen.getByText('2 products out of stock')).toBeInTheDocument();
  });
});
