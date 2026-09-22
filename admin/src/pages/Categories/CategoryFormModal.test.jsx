import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryFormModal from './CategoryFormModal';

/**
 * Category image upload from the admin form:
 *  - editing: choosing a file uploads immediately (multipart POST) and shows it
 *  - editing: removing asks for confirmation, then calls DELETE
 *  - invalid files are rejected on the client without any request
 *  - creating: the file is uploaded only after the category exists
 */

const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const calls = [];
const respond = vi.fn();

const png = (name = 'cat.png', type = 'image/png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type });

beforeEach(() => {
  calls.length = 0;
  respond.mockReset();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      calls.push({ method, url: String(url), body: options.body });
      return respond(method, String(url));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const EXISTING = {
  id: 5,
  slug: 'fresh-fruits',
  displayOrder: 1,
  imageUrl: '/images/old.png',
  translations: [{ language: 'EN', name: 'Fresh Fruits' }],
};

describe('CategoryFormModal — image', () => {
  it('uploads a chosen file straight away when editing and shows the new image', async () => {
    respond.mockImplementation(() => jsonRes({ success: true, data: { id: 5, imageUrl: '/images/new.png' } }, 201));
    const onImageChanged = vi.fn();
    const user = userEvent.setup();
    render(<CategoryFormModal category={EXISTING} onClose={() => {}} onSaved={() => {}} onImageChanged={onImageChanged} />);

    await user.upload(screen.getByLabelText('Choose category image'), png());

    await waitFor(() => expect(onImageChanged).toHaveBeenCalled());
    const post = calls.find((c) => c.method === 'POST');
    expect(post.url).toContain('/admin/catalog/categories/5/image');
    expect(post.body).toBeInstanceOf(FormData);
    expect(screen.getByAltText('Category')).toHaveAttribute('src', '/images/new.png');
  });

  it('rejects unsupported and oversized files without calling the server', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<CategoryFormModal category={EXISTING} onClose={() => {}} onSaved={() => {}} />);
    const input = screen.getByLabelText('Choose category image');

    await user.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/not supported/i)).toBeInTheDocument();

    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await user.upload(input, big);
    expect(await screen.findByText(/larger than the 5 MB limit/i)).toBeInTheDocument();

    expect(calls).toHaveLength(0);
  });

  it('asks before removing, then calls DELETE and drops the preview', async () => {
    respond.mockImplementation(() => jsonRes({ success: true, data: { id: 5, imageUrl: null } }));
    const user = userEvent.setup();
    render(<CategoryFormModal category={EXISTING} onClose={() => {}} onSaved={() => {}} />);

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(screen.getByText('Remove this image?')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.find((c) => c.method === 'DELETE').url).toContain('/admin/catalog/categories/5/image');
    await waitFor(() => expect(screen.queryByAltText('Category')).not.toBeInTheDocument());
  });

  it('uploads the picked file only after the new category has been created', async () => {
    respond.mockImplementation((method, url) => {
      if (method === 'POST' && url.endsWith('/categories')) return jsonRes({ success: true, data: { id: 9 } }, 201);
      return jsonRes({ success: true, data: { id: 9, imageUrl: '/images/n.png' } }, 201);
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<CategoryFormModal category={null} onClose={() => {}} onSaved={onSaved} />);

    await user.upload(screen.getByLabelText('Choose category image'), png());
    expect(calls).toHaveLength(0); // nothing uploaded yet

    await user.type(screen.getByLabelText(/^Slug/), 'dairy');
    await user.type(screen.getByLabelText('Name', { selector: '#cat-name-en' }), 'Dairy');
    await user.click(screen.getByRole('button', { name: /create category/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Category created successfully.'));
    expect(calls.map((c) => `${c.method} ${new URL(c.url, 'http://x').pathname}`)).toEqual([
      'POST /api/admin/catalog/categories',
      'POST /api/admin/catalog/categories/9/image',
    ]);
  });
});
