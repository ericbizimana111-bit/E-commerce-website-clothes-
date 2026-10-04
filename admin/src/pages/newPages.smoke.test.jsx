import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/feedback/Toast';
import NotificationsPage from './Notifications/NotificationsPage';
import MessagesPage from './Messages/MessagesPage';
import ServiceRequestsPage from './Services/ServiceRequestsPage';
import ServiceRequestDetailPage from './Services/ServiceRequestDetailPage';
import ServicesCatalogPage from './Services/ServicesCatalogPage';
import TechniciansPage from './Services/TechniciansPage';
import SettingsPage from './Settings/SettingsPage';

/**
 * Render smoke tests for the marketplace admin pages against realistic
 * backend response shapes (catches runtime crashes and contract drift).
 */
const ADDRESS = {
  title: 'Home',
  district: 'Kampala',
  division: 'Ntinda',
  region: 'CENTRAL',
  streetAddress: 'Plot 4 Kigoowa Rd',
  landmark: 'Opposite the church',
  formattedAddress: 'Plot 4 Kigoowa Rd — Ntinda, Kampala',
  isVerified: true,
  latitude: 0.3545,
  longitude: 32.6152,
};

const REQUEST = {
  id: 'sr-1',
  requestNumber: 'SR-20261004-000001',
  status: 'PENDING',
  service: { id: 1, name: 'Plumbing', slug: 'plumbing' },
  address: ADDRESS,
  description: 'Kitchen sink leaking',
  preferredDate: '2026-10-05',
  preferredSlot: 'MORNING',
  preferredSlotLabel: '8:00 – 12:00',
  contactPhone: '+256772000111',
  priceType: 'INSPECTION',
  priceFromUgx: 20000,
  quotedPriceUgx: null,
  distanceKm: 7.5,
  paymentStatus: 'UNPAID',
  provider: null,
  customer: { id: 'u1', fullName: 'Sarah Namubiru', phone: '+256772000111' },
  events: [{ id: 1, from: null, to: 'PENDING', actorType: 'CUSTOMER', note: 'Booking requested', createdAt: '2026-10-04T08:00:00Z' }],
  createdAt: '2026-10-04T08:00:00Z',
};

const ROUTES = [
  ['/admin/notifications', { success: true, data: { items: [{ id: 'n1', type: 'NEW_ORDER', title: 'New order UM-1', message: 'Sarah ordered', isRead: false, createdAt: '2026-10-04T08:00:00Z', metadata: { district: 'Kampala', area: 'Ntinda', distanceKm: 7.5, customerPhone: '+256772000111', totalUgx: 46000 } }], unread: 1, pagination: { page: 1, totalPages: 1, total: 1 } } }],
  ['/admin/chat/conversations/c1', { success: true, data: { conversation: { id: 'c1', customer: { id: 'u1', fullName: 'Sarah Namubiru', phone: '+256772000111' } }, messages: [{ id: 'm1', senderType: 'CUSTOMER', body: 'When will it arrive?', createdAt: '2026-10-04T08:00:00Z', order: { id: 'o1', orderNumber: 'UM-1' } }], hasMore: false, context: { recentOrders: [{ id: 'o1', orderNumber: 'UM-1', status: 'CONFIRMED', totalAmount: 46000 }], recentBookings: [] } } }],
  ['/admin/chat/conversations', { success: true, data: { items: [{ id: 'c1', lastMessage: 'When will it arrive?', lastMessageAt: '2026-10-04T08:00:00Z', adminUnread: 1, customer: { id: 'u1', fullName: 'Sarah Namubiru', phone: '+256772000111' } }], unreadTotal: 1 } }],
  ['/admin/services/requests/sr-1/route', { success: true, data: { route: { origin: { lat: 0.3136, lng: 32.5811, name: 'Nakasero' }, destination: { lat: 0.3545, lng: 32.6152 }, distanceKm: 7.5, straightLineKm: 5.9, etaMinutes: 14, distanceSource: 'ROUTED', geometry: [[0.3136, 32.5811], [0.33, 32.6], [0.3545, 32.6152]] } } }],
  ['/admin/services/requests/sr-1', { success: true, data: { request: REQUEST } }],
  ['/admin/services/requests', { success: true, data: { items: [REQUEST], statusCounts: { PENDING: 1 }, pagination: { page: 1, totalPages: 1, total: 1 } } }],
  ['/admin/services/providers', { success: true, data: { providers: [{ id: 'p1', fullName: 'Okello James', phone: '+256701222333', isActive: true, services: [{ id: 1, name: 'Plumbing' }], activeJobs: 0 }] } }],
  ['/admin/services/catalog', { success: true, data: { services: [{ id: 1, slug: 'plumbing', name: 'Plumbing', icon: 'wrench', priceType: 'INSPECTION', priceFromUgx: 20000, durationText: '1–3 hours', isActive: true, translations: { LG: { name: 'Payipu' } }, providerCount: 1, requestCount: 3 }] } }],
  ['/admin/settings', { success: true, data: { delivery: { warehouseName: 'Nakasero', warehouseLat: 0.3136, warehouseLng: 32.5811, baseFeeUgx: 3000, freeRadiusKm: 3, perKmRateUgx: 1200, minimumFeeUgx: 3000, maxDeliveryKm: null }, commitment: { ruleType: 'PERCENTAGE', percentageValue: 30, flatValueUgx: 10000, minCommitment: 5000 } } }],
  ['/admin/auth/me', { success: true, data: { admin: { id: 'a1', fullName: 'Grace Nakato', role: 'SUPER_ADMIN' } } }],
];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const hit = ROUTES.find(([m]) => String(url).includes(m));
      const body = hit ? hit[1] : { success: true, data: {} };
      return Promise.resolve(new Response(JSON.stringify(opts.method && opts.method !== 'GET' ? { success: true, data: {} } : body), { status: 200, headers: { 'content-type': 'application/json' } }));
    }),
  );
}

function renderAt(path, pattern, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path={pattern} element={element} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('marketplace admin pages render real response shapes', () => {
  beforeEach(() => {
    localStorage.setItem('ugamarket_admin_token', 'test-token');
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('notifications feed with delivery facts', async () => {
    renderAt('/notifications', '/notifications', <NotificationsPage />);
    expect(await screen.findByText('New order UM-1')).toBeInTheDocument();
    expect(screen.getByText(/Ntinda, Kampala · 7.5 km/)).toBeInTheDocument();
  });

  it('messages inbox opens a thread with order context', async () => {
    renderAt('/messages?c=c1', '/messages', <MessagesPage />);
    expect(await screen.findAllByText('When will it arrive?')).not.toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText('UM-1').length).toBeGreaterThan(0));
  });

  it('bookings queue', async () => {
    renderAt('/service-requests', '/service-requests', <ServiceRequestsPage />);
    expect(await screen.findByText('SR-20261004-000001')).toBeInTheDocument();
  });

  it('booking detail with route, actions and technician select', async () => {
    renderAt('/service-requests/sr-1', '/service-requests/:id', <ServiceRequestDetailPage />);
    expect(await screen.findByRole('button', { name: 'Confirm booking' })).toBeInTheDocument();
    expect(screen.getByText(/7.5 km by road/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Okello James/ })).toBeInTheDocument();
  });

  it('service catalogue and technicians', async () => {
    renderAt('/services', '/services', <ServicesCatalogPage />);
    expect(await screen.findByText('Plumbing')).toBeInTheDocument();
    renderAt('/technicians', '/technicians', <TechniciansPage />);
    expect(await screen.findByText('Okello James')).toBeInTheDocument();
  });

  it('store settings with fee calculator', async () => {
    renderAt('/settings', '/settings', <SettingsPage />);
    expect(await screen.findByText('Delivery tariff')).toBeInTheDocument();
    // 8 km default: 3000 + (8-3)*1200 = 9000
    expect(screen.getByText('UGX 9,000')).toBeInTheDocument();
  });
});
