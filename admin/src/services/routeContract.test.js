/**
 * Route contract test — catches path drift between the admin frontend and the
 * backend by parsing the backend's ACTUAL route registrations instead of
 * duplicating them by hand.
 *
 * How it works:
 *   1. Extracts the real mount points from backend/src/app.js
 *      (app.use('/api/admin/catalog', ...) etc.).
 *   2. Extracts each router's method+path registrations from
 *      backend/src/routes/admin*.routes.js.
 *   3. Combines them into the set of real backend route templates
 *      (e.g. PATCH /api/admin/catalog/products/:id/active).
 *   4. Scans admin/src for every api.get/post/put/patch/delete call and
 *      requires each one to match a real backend route (same method, and a
 *      path template that normalizes to the backend template — literal
 *      segments must match, and dynamic admin-supplied segments are allowed
 *      where the backend has :params).
 *
 * This test fails when someone renames or remounts a backend route (or typos a
 * frontend path) without updating the other side — the exact drift class that
 * previously shipped (admin called /admin/products while the backend mounted
 * /api/admin/catalog/products).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = path.resolve(__dirname, '..', '..');
const BACKEND_SRC = path.resolve(ADMIN_DIR, '..', 'backend', 'src');

function walk(dir, exts, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract backend route templates: { method, template } from app.js mounts + routers. */
function extractBackendRoutes() {
  const appJs = fs.readFileSync(path.join(BACKEND_SRC, 'app.js'), 'utf8');
  const mounts = [...appJs.matchAll(/app\.use\('([^']+)',\s*(?:[\w$]+,\s*)?(\w+)\)/g)]
    .filter((m) => m[1].startsWith('/api'))
    .map((m) => ({ mount: m[1].replace(/\/$/, ''), routerVar: m[2] }));

  const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]*routes[^'"]*)['"]\)/g;
  const routerFiles = {};
  for (const m of appJs.matchAll(requireRe)) {
    const varName = m[1];
    const resolved = m[2].startsWith('.') ? path.join(BACKEND_SRC, m[2]) : m[2];
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) routerFiles[varName] = resolved;
    else if (fs.existsSync(resolved + '.js')) routerFiles[varName] = resolved + '.js';
  }

  const routes = [];
  for (const { mount, routerVar } of mounts) {
    const file = routerFiles[routerVar];
    if (!file) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      routes.push({
        method: m[1].toUpperCase(),
        template: (mount + (m[2] === '/' ? '' : m[2])).replace(/\/+$/, '') || mount,
      });
    }
  }
  return routes;
}

/** Normalize a concrete path for template comparison: strip query strings and
 *  collapse likely-dynamic segments (UUIDs, ints, slugs-with-ids) to ':param'. */
function normalize(p) {
  return (
    '/' +
    p
      .split('?')[0]
      .split('/')
      .filter(Boolean)
      .map((seg) => {
        if (/^[0-9a-fA-F-]{8,}$/.test(seg)) return ':id'; // uuid
        if (/^\d+$/.test(seg)) return ':id'; // integer
        return seg;
      })
      .join('/')
  );
}

/** Does a concrete (normalized) path match a backend template? (inlined below) */

describe('admin ↔ backend route contract', () => {
  const backendRoutes = extractBackendRoutes();
  const templates = backendRoutes.map((r) => `${r.method} ${normalize(r.template)}`);

  beforeAll(() => {
    // Guard the guard: the extraction itself must have found the known mounts.
    expect(templates).toContain('POST /api/admin/auth/login');
    expect(templates).toContain('GET /api/admin/orders');
    expect(templates).toContain('GET /api/admin/catalog/products');
    expect(templates).toContain('PATCH /api/admin/catalog/products/:id/active');
    expect(templates).toContain('POST /api/admin/catalog/products/:id/inventory/restock');
    expect(templates).toContain('PATCH /api/admin/deliveries/:id/assign');
  });

  test('backend route extraction is non-trivial', () => {
    expect(backendRoutes.length).toBeGreaterThanOrEqual(20);
  });

  test('every api.<method> call in admin/src maps to a real backend route', () => {
    const srcFiles = walk(ADMIN_DIR, ['.jsx', '.js']).filter((f) => !f.includes('.test.'));
    const offenders = [];

    for (const file of srcFiles) {
      const src = fs.readFileSync(file, 'utf8');
      // Match api.get('/path'...), api.post(`/path`...), incl. multiline chains.
      for (const m of src.matchAll(/\bapi\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])(\/[^'"`\s)]+)\2/g)) {
        const method = m[1].toUpperCase();
        const rawPath = m[3];
        // Resolve simple template literals with ${...} interpolations.
        // The admin API client prepends its '/api' base to relative paths.
        const concrete0 = rawPath.replace(/\$\{[^}]+\}/g, 'PARAM');
        const concrete = concrete0.startsWith('/api') ? concrete0 : '/api' + concrete0;
        const norm = normalize(concrete).replace(/PARAM/g, ':param');
        const ok = templates.some((t) => {
          const [tMethod, tPath] = t.split(' ');
          if (tMethod !== method) return false;
          // ':param' (admin-side interpolation) matches any template segment.
          const c = norm.split('/');
          const tt = tPath.split('/');
          return c.length === tt.length && c.every((seg, i) => seg === ':param' || tt[i].startsWith(':') || seg === tt[i]);
        });
        if (!ok) offenders.push(`${path.relative(ADMIN_DIR, file)}: ${method} ${rawPath}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('admin never calls removed/renamed legacy paths', () => {
    const srcFiles = walk(ADMIN_DIR, ['.jsx', '.js']).filter((f) => !f.includes('.test.'));
    const legacy = [];
    for (const file of srcFiles) {
      const src = fs.readFileSync(file, 'utf8');
      if (/['"`]\/admin\/(products|categories)/.test(src)) {
        legacy.push(path.relative(ADMIN_DIR, file));
      }
    }
    expect(legacy).toEqual([]);
  });
});
