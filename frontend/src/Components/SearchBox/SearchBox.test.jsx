import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SearchBox from './SearchBox';
import { LanguageProvider } from '../../Context/LanguageContext';

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  resolveImageUrl: (u) => u || null
}));

const apiClient = require('../../api/client').default;

const PRODUCTS = [
  { id: 7, name: 'Fresh Green Matooke', priceUgx: 28000, category: { name: 'Matooke & Tubers' } },
  { id: 9, name: 'Matooke Flour', priceUgx: 9000 }
];

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
};

const renderBox = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/']}>
        <SearchBox />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );

const type = (value) => fireEvent.change(screen.getByRole('combobox'), { target: { value } });
const flush = async (ms = 400) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('SearchBox', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    apiClient.get.mockReset();
    apiClient.get.mockImplementation(async (url) => {
      if (url.startsWith('/categories')) return { data: [{ id: 1, slug: 'matooke-tubers', name: 'Matooke & Tubers' }] };
      return { data: PRODUCTS };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('suggests products as you type, after a short pause, with one request', async () => {
    renderBox();
    type('m');
    type('ma');
    type('mat');
    await flush();

    const productCalls = apiClient.get.mock.calls.filter(([u]) => u.startsWith('/products'));
    expect(productCalls).toHaveLength(1);
    expect(productCalls[0][0]).toContain('search=mat');

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent).join('|')).toMatch(/Fresh Green Matooke/);
    expect(screen.getByText('UGX 28,000')).toBeInTheDocument();
  });

  test('does not search for a single character', async () => {
    renderBox();
    type('m');
    await flush();
    expect(apiClient.get.mock.calls.filter(([u]) => u.startsWith('/products'))).toHaveLength(0);
  });

  test('Enter opens the catalog filtered by what was typed', async () => {
    renderBox();
    type('red beans');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/catalog?search=red%20beans');
  });

  test('arrow keys + Enter open the highlighted product', async () => {
    renderBox();
    type('mat');
    await flush();
    await screen.findAllByRole('option');

    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // category row
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // first product
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/product/7');
  });

  test('shows a friendly message when nothing matches', async () => {
    apiClient.get.mockImplementation(async (url) => (url.startsWith('/categories') ? { data: [] } : { data: [] }));
    renderBox();
    type('zzzz');
    await flush();
    expect(await screen.findByText(/No matches for/i)).toBeInTheDocument();
  });

  test('never accepts more than the maximum length', () => {
    renderBox();
    type('x'.repeat(500));
    expect(screen.getByRole('combobox').value.length).toBeLessThanOrEqual(100);
  });
});
