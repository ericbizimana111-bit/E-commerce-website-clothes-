import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { CartProvider, useCart } from './CartContext';
import { AuthProvider } from './AuthContext';
import { LanguageProvider } from './LanguageContext';

const TestCartConsumer = () => {
  const { cart, itemCount, subtotalUgx, addToCart, clearCart } = useCart();

  const handleAddSample = () => {
    addToCart({
      id: 1,
      name: 'Fresh Green Matooke',
      priceUgx: 28000,
      stockQuantity: 10
    }, 2);
  };

  return (
    <div>
      <span data-testid="item-count">{itemCount}</span>
      <span data-testid="subtotal">{subtotalUgx}</span>
      <button data-testid="btn-add" onClick={handleAddSample}>
        Add Matooke
      </button>
      <button data-testid="btn-clear" onClick={clearCart}>
        Clear
      </button>
    </div>
  );
};

describe('CartContext (Guest Mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('initializes empty and calculates itemCount and subtotal correctly upon adding items', async () => {
    render(
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <TestCartConsumer />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    );

    expect(screen.getByTestId('item-count').textContent).toBe('0');
    expect(screen.getByTestId('subtotal').textContent).toBe('0');

    await act(async () => {
      screen.getByTestId('btn-add').click();
    });

    expect(screen.getByTestId('item-count').textContent).toBe('2');
    expect(screen.getByTestId('subtotal').textContent).toBe('56000');

    await act(async () => {
      screen.getByTestId('btn-clear').click();
    });

    expect(screen.getByTestId('item-count').textContent).toBe('0');
    expect(screen.getByTestId('subtotal').textContent).toBe('0');
  });
});
