const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const prisma = require('../src/config/db');
const env = require('../src/config/env');
const imageService = require('../src/services/image.service');
const { signAdminToken, signCustomerToken } = require('../src/services/token.service');

/**
 * Category image upload/removal (admin multipart upload).
 * Covers: upload + persistence + public retrieval, replacement cleaning the
 * old file, validation (type / signature), authorization, unknown category,
 * and removal.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64'
);
const FAKE_IMAGE = Buffer.from('this is definitely not an image, just plain text payload');

describe('Category Image Upload & Removal', () => {
  let superAdminToken;
  let dispatcherToken;
  let customerToken;
  let categoryId;
  const createdFiles = [];

  const track = (imageUrl) => {
    if (typeof imageUrl === 'string' && imageUrl.startsWith('/images/')) {
      createdFiles.push(path.join(imageService.UPLOADS_DIR, path.basename(imageUrl)));
    }
  };
  const fileFor = (imageUrl) => path.join(imageService.UPLOADS_DIR, path.basename(imageUrl));

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: env.ADMIN_1_EMAIL, password: env.ADMIN_1_PASSWORD });
    superAdminToken = adminRes.body.data.token;

    const dispatcher = await prisma.admin.upsert({
      where: { email: 'dispatcher.catimages@ugandafood.market' },
      update: { role: 'DISPATCHER', isActive: true },
      create: {
        fullName: 'Category Image Dispatcher',
        email: 'dispatcher.catimages@ugandafood.market',
        passwordHash: '$2a$12$eXampleHashedPasswordForTestOnly999999999999999999999999',
        role: 'DISPATCHER',
        isActive: true,
      },
    });
    dispatcherToken = signAdminToken(dispatcher);
    customerToken = signCustomerToken({ id: '00000000-0000-0000-0000-000000000078', phone: '+256770000012' });

    const catRes = await request(app)
      .post('/api/admin/catalog/categories')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ slug: 'cat-image-test-' + Date.now(), translations: [{ language: 'en', name: 'Category Image Test' }] });
    categoryId = catRes.body.data.id;
  });

  afterAll(async () => {
    createdFiles.forEach((file) => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        /* best effort */
      }
    });
    if (categoryId) {
      await prisma.categoryTranslation.deleteMany({ where: { categoryId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
    await prisma.admin.deleteMany({ where: { email: 'dispatcher.catimages@ugandafood.market' } });
    await prisma.$disconnect();
  });

  const upload = (buffer, filename, contentType, token = superAdminToken, id = categoryId) => {
    const req = request(app).post(`/api/admin/catalog/categories/${id}/image`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.attach('image', buffer, { filename, contentType });
  };

  let firstUrl;

  it('uploads an image, stores a local /images path and serves it publicly', async () => {
    const res = await upload(TINY_PNG, 'cat.png', 'image/png');
    expect(res.status).toBe(201);
    firstUrl = res.body.data.imageUrl;
    track(firstUrl);
    expect(firstUrl).toMatch(/^\/images\/[0-9a-f-]+\.png$/);

    const publicRes = await request(app).get(firstUrl);
    expect(publicRes.status).toBe(200);
  });

  it('replacing the image deletes the old file once nothing references it', async () => {
    const res = await upload(TINY_JPEG, 'cat.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    const secondUrl = res.body.data.imageUrl;
    track(secondUrl);
    expect(secondUrl).not.toBe(firstUrl);
    expect(fs.existsSync(fileFor(firstUrl))).toBe(false);
    expect(fs.existsSync(fileFor(secondUrl))).toBe(true);
  });

  it('rejects unsupported types and files whose content is not an image', async () => {
    const wrongType = await upload(FAKE_IMAGE, 'x.txt', 'text/plain');
    expect(wrongType.status).toBe(400);

    const fake = await upload(FAKE_IMAGE, 'fake.png', 'image/png');
    expect(fake.status).toBe(400);
    expect(fake.body.message).toMatch(/not a valid/i);
  });

  it('requires admin authentication and the ADMIN / SUPER_ADMIN role', async () => {
    expect((await upload(TINY_PNG, 'a.png', 'image/png', null)).status).toBe(401);
    expect((await upload(TINY_PNG, 'a.png', 'image/png', customerToken)).status).toBe(401);
    expect((await upload(TINY_PNG, 'a.png', 'image/png', dispatcherToken)).status).toBe(403);
  });

  it('returns 404 for an unknown category and 400 for a missing file', async () => {
    expect((await upload(TINY_PNG, 'a.png', 'image/png', superAdminToken, 99999999)).status).toBe(404);

    const noFile = await request(app)
      .post(`/api/admin/catalog/categories/${categoryId}/image`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(noFile.status).toBe(400);
  });

  it('removes the image and cleans up the file', async () => {
    const current = await prisma.category.findUnique({ where: { id: categoryId } });
    const url = current.imageUrl;
    expect(url).toBeTruthy();

    const res = await request(app)
      .delete(`/api/admin/catalog/categories/${categoryId}/image`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.imageUrl).toBeNull();
    expect(fs.existsSync(fileFor(url))).toBe(false);
  });
});
