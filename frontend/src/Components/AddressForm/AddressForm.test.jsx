import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddressForm, { EMPTY_ADDRESS } from './AddressForm';

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('../../Context/LanguageContext', () => {
  const { translate } = require('../../i18n');
  return { useLanguage: () => ({ t: (key, params) => translate('en', key, params) }) };
});

// The real Leaflet map is replaced by a button that drops a pin in Ntinda.
jest.mock('../MapPicker/MapPicker', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: 0.3545, lng: 32.6152 })}>
      drop pin
    </button>
  )
}));

const META = {
  data: {
    regions: [],
    districts: [
      { name: 'Kampala', region: 'CENTRAL' },
      { name: 'Gulu', region: 'NORTHERN' }
    ]
  }
};

function Harness({ onSubmit }) {
  const [value, setValue] = useState(EMPTY_ADDRESS);
  return <AddressForm value={value} onChange={setValue} onSubmit={onSubmit} defaultPhone="0772123456" />;
}

describe('AddressForm', () => {
  let apiClient;
  beforeEach(() => {
    apiClient = require('../../api/client').default;
    apiClient.get.mockImplementation(async (url) => {
      if (url.startsWith('/locations/meta')) return META;
      if (url.startsWith('/locations/reverse')) {
        return { data: { insideUganda: true, verified: true, district: 'Kampala', region: 'CENTRAL', area: 'Ntinda', label: 'Ntinda, Kampala' } };
      }
      return { data: { results: [] } };
    });
  });

  test('refuses to submit without a map pin, district and street details', async () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    await screen.findByRole('option', { name: 'Kampala' });

    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Please pin your exact location on the map.').length).toBeGreaterThan(0);
    expect(screen.getByText('Choose your district.')).toBeInTheDocument();
    expect(screen.getByText('Enter the street, building or house details.')).toBeInTheDocument();
  });

  test('a pinned location fills district and area, then submits a clean payload', async () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    await screen.findByRole('option', { name: 'Kampala' });

    fireEvent.click(screen.getByText('drop pin'));
    await waitFor(() => expect(screen.getByText('Ntinda, Kampala')).toBeInTheDocument());
    expect(screen.getByLabelText(/District/)).toHaveValue('Kampala');
    expect(screen.getByLabelText(/Area \/ neighbourhood/)).toHaveValue('Ntinda');

    fireEvent.change(screen.getByLabelText(/Street, building/), { target: { value: 'Plot 4 Kigoowa Road' } });
    fireEvent.change(screen.getByLabelText(/Nearest landmark/), { target: { value: 'Opposite the church' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        district: 'Kampala',
        region: 'CENTRAL',
        division: 'Ntinda',
        streetAddress: 'Plot 4 Kigoowa Road',
        landmark: 'Opposite the church',
        contactPhone: '0772123456',
        latitude: 0.3545,
        longitude: 32.6152
      })
    );
  });

  test('warns when the pin is outside Uganda', async () => {
    apiClient.get.mockImplementation(async (url) => {
      if (url.startsWith('/locations/meta')) return META;
      if (url.startsWith('/locations/reverse')) return { data: { insideUganda: false } };
      return { data: { results: [] } };
    });
    render(<Harness onSubmit={jest.fn()} />);
    await screen.findByRole('option', { name: 'Kampala' });
    fireEvent.click(screen.getByText('drop pin'));
    expect(await screen.findByText(/outside Uganda/)).toBeInTheDocument();
  });
});
