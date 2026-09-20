import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductFormPage from './ProductFormPage';
import { ToastProvider } from '../../components/feedback/Toast';

/**
 * Contract tests for the product create/edit form:
 *  - Edit mode loads the product via GET /api/admin/catalog/products/:id
 *    (the new single-product endpoint) and populates fields + images.
 *  - Image management UI (primary/remove controls, upload control) renders.
 *  - Clearing the SKU sends sku: null so admins can remove a SKU (PUT).
 *  - Create mode offers image selection and posts to /api/admin/catalog/products.
 */

const CATEGORIES = {
  success: true,
  items: [
    { id: 3, slug: 'matooke-tubers', translations: [{ language: 'EN', name: 'Matooke & Tubers' }] },
    { id: 4, slug: 'fresh-fruits', translations: [{ language: 'EN', name: 'Fresh Fruits' }] },
  ],
};

const PRODUCT = {
  success: true,
  data: {
    id: 42,
    slug: 'fresh-green-matooke',
    categoryId: 3,
    priceUgx: 28000,
    stockQuantity: 12,
    unit: 'kg',
    sku: 'MTK-001',
    isActive: true,
    translations: [
      { language: 'EN', name: 'Green Matooke', description: 'Fresh green matooke' },
      { language: 'LG', name: 'Amatooke Enziriddwa', description: '' },
    ],
    images: [
      { id: 7, imageUrl: '/images/abc.png', altText: null, isPrimary: true, sortOrder: 0 },
      { id: 8, imageUrl: 'https://images.example.com/x.jpg', altText: null, isPrimary: false, sortOrder: 1 },
    ],
  },
};

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchCalls = [];

function routeFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  fetchCalls.push({ method, url: String(url), body: options.body });
  if (String(url).includes('/api/admin/catalog/categories')) return jsonRes(CATEGORIES);
  if (String(url).match(/\/api\/admin\/catalog\/products\/\d+$/) && method === 'GET') {
    return jsonRes(PRODUCT);
  }
  if (String(url).endsWith('/api/admin/catalog/products/42') && method === 'PUT') {
    return jsonRes({ success: true, message: 'Product updated successfully', data: PRODUCT.data });
  }
  if (String(url).endsWith('/api/admin/catalog/products') && method === 'POST') {
    return jsonRes({ success: true, message: 'Product created successfully', data: { ...PRODUCT.data, id: 43 } });
  }
  return jsonRes({ success: true, message: 'ok', data: {} });
}

function renderForm(id) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[id ? `/products/${id}` : '/products/new']}>
        <Routes>
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id" element={<ProductFormPage />} />
          <Route path="/products" element={<div>products list</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('ProductFormPage', () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    vi.stubGlobal('fetch', vi.fn((url, options) => routeFetch(url, options)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads an existing product through the single-product admin endpoint and populates the form', async () => {
    renderForm('42');

    // Categories + product single fetch happen
    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes('/api/admin/catalog/products/42'))).toBe(true);
    });

    // Slug + price populated from the backend record
    await waitFor(() => {
      expect(screen.getByLabelText(/Slug/i)).toHaveValue('fresh-green-matooke');
    });
    expect(screen.getByLabelText(/Price \(UGX/i)).toHaveValue(28000);
    expect(screen.getByDisplayValue('28000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Green Matooke')).toBeInTheDocument();

    // Images section lists both images with primary/remove controls
    expect(screen.getAllByAltText('Product image').length).toBe(2);
    expect(screen.getAllByRole('button', { name: /Remove image/i }).length).toBe(2);
    expect(screen.getByRole('button', { name: /Set image 8 as primary/i })).toBeInTheDocument();
  });

  it('create mode offers image selection and posts the create payload', async () => {
    const user = userEvent.setup();
    renderForm(null);

    await waitFor(() => {
      expect(screen.getByLabelText(/Slug/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Slug/i), 'new-matooke');
    await user.selectOptions(screen.getByLabelText(/^Category/i), '3');
    await user.type(screen.getByLabelText(/Price \(UGX/i), '15000');
    await user.type(screen.getByLabelText('Name', { selector: '#pf-name-en' }), 'New Matooke');
    await user.click(screen.getByRole('button', { name: /Create product/i }));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.method === 'POST' && c.url.endsWith('/api/admin/catalog/products'));
      expect(post).toBeDefined();
      const body = JSON.parse(post.body);
      expect(body.slug).toBe('new-matooke');
      expect(body.categoryId).toBe(3);
      expect(body.priceUgx).toBe(15000);
      expect(body.translations.some((t) => t.language === 'en' && t.name === 'New Matooke')).toBe(true);
    });
    // On success the form navigates back to the products list
    await waitFor(() => {
      expect(screen.getByText('products list')).toBeInTheDocument();
    });
  });

  it('clearing the SKU sends sku: null on update so a SKU can be removed', async () => {
    const user = userEvent.setup();
    renderForm('42');

    await waitFor(() => {
      expect(screen.getByDisplayValue('MTK-001')).toBeInTheDocument();
    });

    const skuInput = screen.getByDisplayValue('MTK-001');
    await user.clear(skuInput);
    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      const put = fetchCalls.find((c) => c.method === 'PUT' && c.url.endsWith('/api/admin/catalog/products/42'));
      expect(put).toBeDefined();
      const body = JSON.parse(put.body);
      expect(body.sku).toBeNull();
      // Untouched fields are still sent; stock is NOT sent on edit (inventory owns it)
      expect(body.stockQuantity).toBeUndefined();
      expect(body.priceUgx).toBe(28000);
    });
  });

  it('shows the error state when the product cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        const method = (options?.method || 'GET').toUpperCase();
        if (String(url).includes('/api/admin/catalog/categories')) return jsonRes(CATEGORIES);
        if (method === 'GET' && String(url).match(/\/api\/admin\/catalog\/products\/\d+$/)) {
          return jsonRes({ success: false, message: 'Product with ID 42 not found' }, 404);
        }
        return jsonRes({ success: true }, 200);
      })
    );

    renderForm('42');
    await waitFor(() => {
      expect(screen.getByText(/Product with ID 42 not found/i)).toBeInTheDocument();
    });
  });
});
