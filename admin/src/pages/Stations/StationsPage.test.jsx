import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StationsPage from './StationsPage';
import { ToastProvider } from '../../components/feedback/Toast';

/**
 * Stations admin: list, create with composed opening hours, edit, and the
 * confirm-before-deactivate flow — all against the real endpoint paths.
 */

const STATIONS = [
  {
    id: 1,
    name: 'Nakasero Market Hub',
    district: 'Kampala',
    addressText: 'Market Street, Central Division',
    contactPhone: '+256700111222',
    operatingHours: 'Mon - Sat: 7:00 AM - 7:00 PM',
    pickupFeeUgx: 0,
    orderCount: 12,
    isActive: true,
  },
  {
    id: 2,
    name: 'Old Depot',
    district: 'Mukono',
    addressText: 'Jinja Road',
    contactPhone: '+256700333444',
    operatingHours: 'Open 24 hours',
    pickupFeeUgx: 2000,
    orderCount: 0,
    isActive: false,
  },
];

const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const calls = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      calls.push({ method, url: String(url), body: options.body ? JSON.parse(options.body) : undefined });
      if (method === 'GET') return jsonRes({ success: true, items: STATIONS });
      return jsonRes({ success: true, data: {} }, method === 'POST' ? 201 : 200);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const renderPage = () =>
  render(
    <ToastProvider>
      <StationsPage />
    </ToastProvider>,
  );

describe('StationsPage', () => {
  it('lists stations with hours, orders and status', async () => {
    renderPage();
    expect(await screen.findByText('Nakasero Market Hub')).toBeInTheDocument();
    expect(screen.getByText('Old Depot')).toBeInTheDocument();
    expect(screen.queryByText(/UGX/)).not.toBeInTheDocument(); // pickup is always free: no fee column
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('creates a station and sends the composed opening hours', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nakasero Market Hub');
    await user.click(screen.getByRole('button', { name: /new station/i }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/station name/i), 'Ntinda Shopping Hub');
    await user.type(within(dialog).getByLabelText(/address/i), 'Ntinda Complex');
    await user.type(within(dialog).getByLabelText(/contact phone/i), '+256700555666');
    await user.selectOptions(within(dialog).getByLabelText('To'), 'Sun');
    await user.click(within(dialog).getByRole('button', { name: /create station/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST');
    expect(post.url).toContain('/admin/pickup-stations');
    expect(post.body).toMatchObject({
      name: 'Ntinda Shopping Hub',
      operatingHours: 'Mon - Sun: 8:00 AM - 6:00 PM',
      isActive: true,
    });
    expect(post.body).not.toHaveProperty('pickupFeeUgx');
  });

  it('blocks a closing time that is not after opening time', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nakasero Market Hub');
    await user.click(screen.getByRole('button', { name: /new station/i }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/station name/i), 'Late Hub');
    await user.type(within(dialog).getByLabelText(/address/i), 'Somewhere');
    await user.type(within(dialog).getByLabelText(/contact phone/i), '+256700555666');
    fireEvent.change(within(dialog).getByLabelText('Closes'), { target: { value: '07:00' } });
    await user.click(within(dialog).getByRole('button', { name: /create station/i }));

    expect(await within(dialog).findByText(/closing time must be after opening time/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('opens unparseable hours as custom text with a warning', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Old Depot');
    const row = screen.getByText('Old Depot').closest('tr');
    await user.click(within(row).getByRole('button', { name: /edit/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('Open 24 hours')).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot show an open now/i)).toBeInTheDocument();
  });

  it('asks for confirmation before deactivating', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nakasero Market Hub');
    const row = screen.getByText('Nakasero Market Hub').closest('tr');
    await user.click(within(row).getByRole('button', { name: /deactivate/i }));

    expect(screen.getByText('Deactivate this station?')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.url).toContain('/admin/pickup-stations/1/active');
    expect(patch.body).toEqual({ isActive: false });
  });
});
