import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProductCard from './ProductCard';
import { LanguageProvider } from '../../Context/LanguageContext';
import { AuthProvider } from '../../Context/AuthContext';
import { CartProvider } from '../../Context/CartContext';

const renderCard = (product) =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <ProductCard product={product} />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );

const inStockProduct = {
  id: 7,
  slug: 'fresh-green-matooke-cluster',
  name: 'Fresh Green Matooke (Cluster)',
  price: 28000,
  currency: 'UGX',
  unit: 'bunch',
  availability: { inStock: true, stockQuantity: 45 },
  category: { id: 1, slug: 'matooke-tubers', name: 'Matooke & Tubers' },
  images: [],
};

const outOfStockProduct = {
  ...inStockProduct,
  id: 8,
  name: 'Lake Victoria Fresh Tilapia',
  availability: { inStock: false, stockQuantity: 0 },
};

describe('ProductCard (UgaMarket — home to home)', () => {
  test('renders product name, UGX price and unit from the backend shape', () => {
    renderCard(inStockProduct);

    expect(screen.getByText('Fresh Green Matooke (Cluster)')).toBeInTheDocument();
    // formatUGX: integer UGX with thousands separator
    expect(screen.getByText('UGX 28,000')).toBeInTheDocument();
    // Unit appears in the meta line and the price suffix (/bunch)
    expect(screen.getAllByText(/bunch/i).length).toBeGreaterThan(0);
  });

  test('shows in-stock badge for available produce', () => {
    renderCard(inStockProduct);
    expect(screen.getAllByText(/in stock/i).length).toBeGreaterThan(0);
  });

  test('marks unavailable produce as out of stock and disables add-to-cart', () => {
    renderCard(outOfStockProduct);

    expect(screen.getAllByText(/out of stock/i).length).toBeGreaterThan(0);
    const addBtn = screen.getByRole('button', { name: /add to cart/i });
    expect(addBtn).toBeDisabled();
  });

  test('links to the product details page', () => {
    renderCard(inStockProduct);
    const link = screen.getAllByRole('link')[0];
    expect(link).toHaveAttribute('href', '/product/7');
  });
});
