import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Topbar from './Topbar';

const markRead = vi.fn();
const markAllRead = vi.fn();
const setSoundOn = vi.fn();
let realtime;

vi.mock('../../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: { fullName: 'Grace Nakato' }, role: 'ADMIN' }),
}));

vi.mock('../../context/RealtimeContext', () => ({
  useRealtime: () => realtime,
}));

const NEW_ORDER = {
  id: 'n1',
  type: 'NEW_ORDER',
  title: 'New order UM-20261004-000001',
  message: 'Sarah ordered 2 item(s) for delivery to Ntinda, Kampala — 7.5 km away.',
  linkUrl: '/orders/o1',
  isRead: false,
  createdAt: new Date().toISOString(),
};

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Topbar title="Dashboard" onMenuClick={() => {}} />} />
        <Route path="/orders/:id" element={<div>order page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Topbar notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime = {
      connected: true,
      unreadNotifications: 1,
      unreadMessages: 3,
      recent: [NEW_ORDER],
      soundOn: true,
      setSoundOn,
      desktopPermission: 'granted',
      enableDesktop: vi.fn(),
      markRead,
      markAllRead,
    };
  });

  it('shows live status and unread badges for notifications and messages', () => {
    setup();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Messages, 3 unread' })).toHaveTextContent('3');
  });

  it('lists recent notifications and opens the related order, marking it read', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByText('New order UM-20261004-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /New order/ }));
    expect(markRead).toHaveBeenCalledWith(['n1']);
    expect(screen.getByText('order page')).toBeInTheDocument();
  });

  it('mark all read and sound toggle call the realtime context', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mute alert sound' }));
    expect(setSoundOn).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    expect(markAllRead).toHaveBeenCalled();
  });
});
