/**
 * Validated Uganda addresses + public location lookups.
 *
 * Geocoder is disabled under test (GEOCODER_PROVIDER=NONE), so these cover
 * the offline rules that always apply: known district, map pin required and
 * inside Uganda, pin consistent with the district, valid Ugandan phone,
 * ownership, default handling.
 */
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const geo = require('../src/services/geo.service');

jest.setTimeout(30000);

const VALID = {
  title: 'Home',
  district: 'Kampala',
  division: 'Ntinda',
  streetAddress: 'Plot 4, Kigoowa Road',
  landmark: 'Next to the blue church',
  contactPhone: '0772 123456',
  latitude: 0.3545,
  longitude: 32.6152,
};

describe('Addresses & locations', () => {
  let token = null;
  let userId = null;
  let otherToken = null;
  const createdUserIds = [];

  async function makeCustomer(name) {
    for (let i = 0; i < 5; i++) {
      const phone = `+2567${Math.floor(10000000 + Math.random() * 89999999)}`;
      const reg = await request(app).post('/api/auth/register').send({ fullName: `${name} ${i}`, phone, password: 'AddrPass123!' });
      if (reg.statusCode === 409) continue;
      createdUserIds.push(reg.body.data.user.id);
      const login = await request(app).post('/api/auth/login').send({ phone, password: 'AddrPass123!' });
      return { token: login.body.data.token, id: reg.body.data.user.id };
    }
    throw new Error('could not create customer');
  }

  const post = (body, t = token) => request(app).post('/api/addresses').set('Authorization', `Bearer ${t}`).send(body);

  beforeAll(async () => {
    const a = await makeCustomer('Address Tester');
    token = a.token;
    userId = a.id;
    otherToken = (await makeCustomer('Address Other')).token;
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.address.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.$disconnect();
  });

  describe('Uganda dataset', () => {
    test('covers all four regions and every district has a valid region and centroid inside Uganda', () => {
      expect(geo.regions.map((r) => r.code).sort()).toEqual(['CENTRAL', 'EASTERN', 'NORTHERN', 'WESTERN']);
      expect(geo.districts.length).toBeGreaterThanOrEqual(135);
      const names = new Set();
      for (const d of geo.districts) {
        expect(['CENTRAL', 'EASTERN', 'NORTHERN', 'WESTERN']).toContain(d.region);
        expect(geo.isInsideUgandaBounds(d.lat, d.lng)).toBe(true);
        expect(names.has(d.name)).toBe(false); // no duplicates
        names.add(d.name);
      }
    });

    test('district lookup tolerates case and suffixes', () => {
      expect(geo.findDistrict('kampala').name).toBe('Kampala');
      expect(geo.findDistrict('Gulu District').name).toBe('Gulu');
      expect(geo.findDistrict('Narnia')).toBeNull();
    });

    test('district consistency: Ntinda pin is Kampala, not Gulu', () => {
      expect(geo.checkDistrictConsistency(0.3545, 32.6152, 'Kampala').ok).toBe(true);
      const wrong = geo.checkDistrictConsistency(0.3545, 32.6152, 'Gulu');
      expect(wrong.ok).toBe(false);
      expect(['Kampala', 'Wakiso']).toContain(wrong.suggestedDistrict);
    });
  });

  describe('POST /api/addresses validation', () => {
    test('valid address is saved, normalized and becomes default', async () => {
      const res = await post(VALID);
      expect(res.statusCode).toBe(201);
      const a = res.body.data.address;
      expect(a.district).toBe('Kampala');
      expect(a.region).toBe('CENTRAL');
      expect(a.contactPhone).toBe('+256772123456');
      expect(a.latitude).toBeCloseTo(0.3545, 4);
      expect(a.isDefault).toBe(true); // first address
      expect(a.isVerified).toBe(false); // geocoder off under test
      expect(a.formattedAddress).toMatch(/Kampala District, Uganda/);
    });

    test('unknown district is rejected', async () => {
      const res = await post({ ...VALID, district: 'Atlantis' });
      expect(res.statusCode).toBe(422);
      expect(res.body.message).toMatch(/valid Ugandan district/);
    });

    test('missing map pin is rejected', async () => {
      const { latitude, longitude, ...rest } = VALID;
      const res = await post(rest);
      expect(res.statusCode).toBe(400);
    });

    test('pin outside Uganda (Nairobi) is rejected', async () => {
      const res = await post({ ...VALID, latitude: -1.2921, longitude: 36.8219 });
      expect(res.statusCode).toBe(422);
      expect(res.body.message).toMatch(/outside Uganda/);
    });

    test('pin far from the chosen district is rejected with a suggestion', async () => {
      const res = await post({ ...VALID, district: 'Gulu' });
      expect(res.statusCode).toBe(422);
      expect(res.body.message).toMatch(/appears to be in (Kampala|Wakiso) district, not Gulu/);
    });

    test('wrong region for the district is rejected', async () => {
      const res = await post({ ...VALID, region: 'NORTHERN' });
      expect(res.statusCode).toBe(422);
    });

    test('invalid phone is rejected', async () => {
      const res = await post({ ...VALID, contactPhone: '12345' });
      expect([400, 422]).toContain(res.statusCode);
    });

    test('too-short street details are rejected', async () => {
      const res = await post({ ...VALID, streetAddress: 'x' });
      expect(res.statusCode).toBe(400);
    });

    test('client cannot force isVerified', async () => {
      const res = await post({ ...VALID, title: 'Work', isVerified: true });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.address.isVerified).toBe(false);
    });
  });

  describe('edit, default, delete & ownership', () => {
    test('update re-validates, default switch keeps exactly one default', async () => {
      const second = (await post({ ...VALID, title: 'Office', latitude: 0.3240, longitude: 32.5800, division: 'Nakasero' })).body.data.address;

      const bad = await request(app).put(`/api/addresses/${second.id}`).set('Authorization', `Bearer ${token}`).send({ ...VALID, district: 'Kabale' });
      expect(bad.statusCode).toBe(422);

      const def = await request(app).patch(`/api/addresses/${second.id}/default`).set('Authorization', `Bearer ${token}`);
      expect(def.statusCode).toBe(200);
      const defaults = def.body.data.addresses.filter((a) => a.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.id);
    });

    test('another customer cannot edit or delete my address', async () => {
      const mine = await prisma.address.findFirst({ where: { userId } });
      const edit = await request(app).put(`/api/addresses/${mine.id}`).set('Authorization', `Bearer ${otherToken}`).send(VALID);
      expect(edit.statusCode).toBe(404);
      const del = await request(app).delete(`/api/addresses/${mine.id}`).set('Authorization', `Bearer ${otherToken}`);
      expect(del.statusCode).toBe(404);
    });

    test('deleting the default promotes another address', async () => {
      const def = await prisma.address.findFirst({ where: { userId, isDefault: true } });
      const res = await request(app).delete(`/api/addresses/${def.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      const remaining = await prisma.address.findMany({ where: { userId } });
      expect(remaining.length).toBeGreaterThan(0);
      expect(remaining.filter((a) => a.isDefault)).toHaveLength(1);
    });
  });

  describe('public location lookups', () => {
    test('GET /api/locations/meta lists regions and districts', async () => {
      const res = await request(app).get('/api/locations/meta');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.country.code).toBe('UG');
      expect(res.body.data.districts.find((d) => d.name === 'Mbarara').region).toBe('WESTERN');
    });

    test('GET /api/locations/search finds neighbourhoods offline', async () => {
      const res = await request(app).get('/api/locations/search?q=ntin');
      expect(res.statusCode).toBe(200);
      const hit = res.body.data.results.find((r) => r.name === 'Ntinda');
      expect(hit).toBeDefined();
      expect(hit.district).toBe('Kampala');
    });

    test('GET /api/locations/reverse identifies district and rejects foreign points', async () => {
      const ok = await request(app).get('/api/locations/reverse?lat=0.3545&lng=32.6152');
      expect(ok.body.data.insideUganda).toBe(true);
      expect(ok.body.data.district).toBe('Kampala');
      expect(ok.body.data.area).toBe('Ntinda');

      const foreign = await request(app).get('/api/locations/reverse?lat=-1.2921&lng=36.8219');
      expect(foreign.body.data.insideUganda).toBe(false);

      const bad = await request(app).get('/api/locations/reverse?lat=abc&lng=1');
      expect(bad.statusCode).toBe(400);
    });
  });
});
