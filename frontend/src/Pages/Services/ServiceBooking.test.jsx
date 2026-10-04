import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ServiceBooking from './ServiceBooking';

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

let mockAuth = { isAuthenticated: true, user: { phone: '+256772000111' } };
jest.mock('../../Context/AuthContext', () => ({ useAuth: () => mockAuth }));

jest.mock('../../Context/LanguageContext', () => {
  const { translate } = require('../../i18n');
  return { useLanguage: () => ({ currentLang: 'en', t: (key, params) => translate('en', key, params) }) };
});

jest.mock('../../Components/MapPicker/MapPicker', () => ({ __esModule: true, default: () => null }));

const SERVICE = {
  id: 1,
  slug: 'plumbing',
  name: 'Plumbing',
  description: 'Leaks and pipes',
  icon: 'wrench',
  priceType: 'INSPECTION',
  priceFromUgx: 20000,
  durationText: '1–3 hours'
};
const ADDRESS = { id: 'addr-1', title: 'Home', district: 'Kampala', division: 'Ntinda', streetAddress: 'Plot 4', latitude: 0.35, longitude: 32.61, isDefault: true, contactPhone: '+256772000111' };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/services/plumbing']}>
      <Routes>
        <Route path="/services/:slug" element={<ServiceBooking />} />
        <Route path="/account/services/:id" element={<div>booking page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ServiceBooking', () => {
  let apiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isAuthenticated: true, user: { phone: '+256772000111' } };
    apiClient = require('../../api/client').default;
    apiClient.get.mockImplementation(async (url) => {
      if (url.startsWith('/services/')) return { data: { service: SERVICE } };
      if (url.startsWith('/addresses')) return { data: { addresses: [ADDRESS] } };
      return { data: {} };
    });
  });

  test('signed-out visitors are asked to sign in', async () => {
    mockAuth = { isAuthenticated: false, user: null };
    renderPage();
    expect(await screen.findByText('Sign in to book a home service.')).toBeInTheDocument();
    expect(screen.getByText('Visit from UGX 20,000')).toBeInTheDocument();
  });

  test('requires a description, then books with the chosen address, date and slot', async () => {
    apiClient.post.mockResolvedValue({ data: { request: { id: 'sr-1' } } });
    renderPage();
    await screen.findByText('Book this service');
    await screen.findByText('Plot 4, Ntinda, Kampala');

    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/What do you need done/), { target: { value: 'Kitchen sink pipe is leaking' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Afternoon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));

    await waitFor(() => expect(screen.getByText('booking page')).toBeInTheDocument());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-requests',
      expect.objectContaining({ serviceId: 1, addressId: 'addr-1', description: 'Kitchen sink pipe is leaking', preferredSlot: 'AFTERNOON' })
    );
  });
});
