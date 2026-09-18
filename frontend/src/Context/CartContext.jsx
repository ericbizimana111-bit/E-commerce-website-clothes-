import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
// NOTE: the authoritative cart for authenticated customers is the backend cart
// (GET/POST/PATCH/DELETE /api/cart...). localStorage is used ONLY for guests,
// and is synced into the server cart right after login.

const CartContext = createContext();

const GUEST_CART_STORAGE_KEY = 'ugamarket_guest_cart';

export const CartProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const { currentLang } = useLanguage();

  const [cart, setCart] = useState({
    id: null,
    itemCount: 0,
    lineCount: 0,
    items: [],
    subtotalUgx: 0,
    totalUgx: 0,
    currency: 'UGX'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper to load guest cart from localStorage
  const loadGuestCart = useCallback(() => {
    try {
      const stored = localStorage.getItem(GUEST_CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const itemCount = parsed.reduce((sum, i) => sum + (i.quantity || 1), 0);
          const subtotalUgx = parsed.reduce((sum, i) => sum + ((i.unitPriceUgx || 0) * (i.quantity || 1)), 0);
          setCart({
            id: 'guest',
            itemCount,
            lineCount: parsed.length,
            items: parsed,
            subtotalUgx,
            totalUgx: subtotalUgx,
            currency: 'UGX'
          });
          return;
        }
      }
    } catch (e) {
      console.error('Failed to parse guest cart', e);
    }
    setCart({
      id: null,
      itemCount: 0,
      lineCount: 0,
      items: [],
      subtotalUgx: 0,
      totalUgx: 0,
      currency: 'UGX'
    });
  }, []);

  // Fetch backend cart for authenticated user
  const fetchServerCart = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/cart?lang=${currentLang || 'en'}`);
      if (res?.data?.cart) {
        setCart(res.data.cart);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch cart from server', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentLang]);

  // Sync guest cart to server on login
  const syncGuestCartToServer = useCallback(async () => {
    try {
      const stored = localStorage.getItem(GUEST_CART_STORAGE_KEY);
      if (stored) {
        const guestItems = JSON.parse(stored);
        if (Array.isArray(guestItems) && guestItems.length > 0) {
          for (const item of guestItems) {
            try {
              await apiClient.post(`/cart/items?lang=${currentLang || 'en'}`, {
                productId: Number(item.productId),
                quantity: Number(item.quantity)
              });
            } catch (err) {
              console.warn(`Could not sync guest item ${item.productId}:`, err.message);
            }
          }
          localStorage.removeItem(GUEST_CART_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Error syncing guest cart', e);
    }
    await fetchServerCart();
  }, [currentLang, fetchServerCart]);

  useEffect(() => {
    if (isAuthenticated) {
      syncGuestCartToServer();
    } else {
      loadGuestCart();
    }
  }, [isAuthenticated, token, syncGuestCartToServer, loadGuestCart]);

  // Add Item to Cart
  const addToCart = async (product, quantity = 1) => {
    setError(null);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const productId = Number(product.id);

    if (isAuthenticated) {
      try {
        setLoading(true);
        const res = await apiClient.post(`/cart/items?lang=${currentLang || 'en'}`, {
          productId,
          quantity: qty
        });
        if (res?.data?.cart) {
          setCart(res.data.cart);
        } else {
          await fetchServerCart();
        }
        return { success: true };
      } catch (err) {
        const msg = err.message || 'Failed to add item to cart';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    } else {
      // Guest Cart in localStorage
      try {
        const stored = localStorage.getItem(GUEST_CART_STORAGE_KEY);
        const items = stored ? JSON.parse(stored) : [];
        const existingIdx = items.findIndex((i) => i.productId === productId);

        if (existingIdx > -1) {
          items[existingIdx].quantity += qty;
          items[existingIdx].subtotalUgx = items[existingIdx].quantity * items[existingIdx].unitPriceUgx;
        } else {
          const unitPrice = Number(product.priceUgx || 0);
          items.push({
            id: `guest-item-${Date.now()}-${productId}`,
            productId,
            quantity: qty,
            unitPriceUgx: unitPrice,
            subtotalUgx: unitPrice * qty,
            product: {
              id: productId,
              name: product.name,
              unit: product.unit,
              priceUgx: unitPrice,
              isActive: product.isActive ?? true,
              stockQuantity: product.stockQuantity ?? 999,
              image: product.image || (product.images && product.images[0]?.imageUrl) || null
            }
          });
        }

        localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
        loadGuestCart();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  // Update Item Quantity
  const updateQuantity = async (itemId, quantity) => {
    setError(null);
    const newQty = parseInt(quantity, 10);

    if (newQty <= 0) {
      return removeFromCart(itemId);
    }

    if (isAuthenticated) {
      try {
        setLoading(true);
        const res = await apiClient.patch(`/cart/items/${itemId}?lang=${currentLang || 'en'}`, {
          quantity: newQty
        });
        if (res?.data?.cart) {
          setCart(res.data.cart);
        } else {
          await fetchServerCart();
        }
        return { success: true };
      } catch (err) {
        const msg = err.message || 'Failed to update item quantity';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    } else {
      // Guest cart
      try {
        const stored = localStorage.getItem(GUEST_CART_STORAGE_KEY);
        if (!stored) return;
        const items = JSON.parse(stored);
        const target = items.find((i) => i.id === itemId || i.productId === itemId);
        if (target) {
          target.quantity = newQty;
          target.subtotalUgx = target.quantity * target.unitPriceUgx;
          localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
          loadGuestCart();
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  // Remove Item from Cart
  const removeFromCart = async (itemId) => {
    setError(null);
    if (isAuthenticated) {
      try {
        setLoading(true);
        const res = await apiClient.delete(`/cart/items/${itemId}?lang=${currentLang || 'en'}`);
        if (res?.data?.cart) {
          setCart(res.data.cart);
        } else {
          await fetchServerCart();
        }
        return { success: true };
      } catch (err) {
        const msg = err.message || 'Failed to remove item';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    } else {
      try {
        const stored = localStorage.getItem(GUEST_CART_STORAGE_KEY);
        if (!stored) return;
        const items = JSON.parse(stored).filter((i) => i.id !== itemId && i.productId !== itemId);
        localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
        loadGuestCart();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  // Clear Cart
  const clearCart = async () => {
    setError(null);
    if (isAuthenticated) {
      try {
        setLoading(true);
        const res = await apiClient.delete('/cart');
        if (res?.data?.cart) {
          setCart(res.data.cart);
        } else {
          await fetchServerCart();
        }
      } catch (err) {
        setError(err.message || 'Failed to clear cart');
      } finally {
        setLoading(false);
      }
    } else {
      localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      loadGuestCart();
    }
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        itemCount: cart.itemCount || 0,
        items: cart.items || [],
        subtotalUgx: cart.subtotalUgx || 0,
        totalUgx: cart.totalUgx || 0,
        loading,
        error,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart: isAuthenticated ? fetchServerCart : loadGuestCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
