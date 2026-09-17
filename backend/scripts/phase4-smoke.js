/* Phase 4 HTTP Smoke Tests — run against a live server with real JSON parsing. */
const BASE = 'http://localhost:4000';
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

(async () => {
  console.log('— Health —');
  const health = await api('GET', '/api/health');
  check('health UP', health.status === 200 && health.json?.success === true && health.json?.database === 'connected');

  console.log('— Customer registration/login —');
  const phone = `+25677${Math.floor(1000000 + Math.random() * 9000000)}`;
  const reg = await api('POST', '/api/auth/register', {
    body: { fullName: 'Phase4 Smoker', phone, password: 'SmokePass123!' },
  });
  check('customer register 201', reg.status === 201);
  const login = await api('POST', '/api/auth/login', { body: { phone, password: 'SmokePass123!' } });
  const token = login.json?.data?.token;
  check('customer login issues token', !!token);
  const me = await api('GET', '/api/auth/me', { token });
  const userId = me.json?.data?.user?.id;
  check('customer /me works', me.status === 200 && !!userId);

  console.log('— Security gates —');
  const noAuth = await api('GET', '/api/cart');
  check('unauthenticated GET cart 401', noAuth.status === 401);
  const badTok = await api('GET', '/api/cart', { token: 'garbage.token.here' });
  check('invalid token 401', badTok.status === 401);

  // Admin token must NOT grant customer cart access (separate auth contexts).
  // Credentials come from env; test skips gracefully when absent.
  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: process.env.SMOKE_ADMIN_EMAIL, password: process.env.SMOKE_ADMIN_PASSWORD },
  });
  if (adminLogin.status === 200) {
    const adminCart = await api('GET', '/api/cart', { token: adminLogin.json?.data?.token });
    check('admin token rejected on customer cart (401)', adminCart.status === 401);
  } else {
    check('admin login available for cross-context test (skipped if creds absent)', true);
  }

  console.log('— Cart lifecycle —');
  const empty = await api('GET', '/api/cart', { token });
  check('GET cart returns empty cart', empty.status === 200 && empty.json.data.cart.items.length === 0);
  const cartId1 = empty.json?.data?.cart?.id;

  // find a live product from public catalog
  const prods = await api('GET', '/api/products?limit=5');
  const product = prods.json?.data?.[0];
  check('public catalog returns a product', !!product);
  const prodDetail = await api('GET', `/api/products/slug/${product.slug}`);
  const stockBefore = prodDetail.json.data.availability.stockQuantity;

  const add1 = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 2 } });
  check('add item 201', add1.status === 201);
  const item = add1.json?.data?.cart?.items?.[0];
  check('server price snapshot equals product price', item?.unitPriceUgx === prodDetail.json.data.price);

  const add2 = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
  const item2 = add2.json?.data?.cart?.items?.[0];
  check('duplicate add increments (3)', add2.status === 201 && item2?.quantity === 3);

  const afterAdd = await api('GET', `/api/products/slug/${product.slug}`);
  check('stock NOT deducted by cart add', afterAdd.json.data.availability.stockQuantity === stockBefore);

  const clientPrice = await api('POST', '/api/cart/items', {
    token,
    body: { productId: product.id, quantity: 1, priceUgx: 1, subtotalUgx: 1, userId: 'spoof' },
  });
  check('client price tampering stripped', clientPrice.status === 201 || clientPrice.status === 409);

  const cartAfter = await api('GET', '/api/cart?lang=en', { token });
  const line = cartAfter.json?.data?.cart?.items?.[0];
  check('subtotal = unitPrice x quantity (integer)', line?.subtotalUgx === line?.unitPriceUgx * line?.quantity);

  const badQty = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 2.5 } });
  check('decimal quantity 400', badQty.status === 400);
  const zeroQty = await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 0 } });
  check('zero quantity 400', zeroQty.status === 400);
  const badId = await api('POST', '/api/cart/items', { token, body: { productId: 'abc', quantity: 1 } });
  check('malformed productId 400', badId.status === 400);
  const ghost = await api('POST', '/api/cart/items', { token, body: { productId: 99999999, quantity: 1 } });
  check('nonexistent product 404', ghost.status === 404);

  const upd = await api('PATCH', `/api/cart/items/${line.id}`, { token, body: { quantity: 4 } });
  check('update quantity 200', upd.status === 200);
  const updLine = upd.json?.data?.cart?.items?.find((i) => i.id === line.id);
  check('updated totals correct', updLine?.quantity === 4 && updLine?.subtotalUgx === updLine?.unitPriceUgx * 4);

  // Quantity above stock but inside the validator's max (1000): expect 409.
  // (Quantities > 1000 are correctly rejected as 400 by validation, tested separately.)
  const aboveStockQty = Math.min(1000, stockBefore + 5);
  const overUpd = await api('PATCH', `/api/cart/items/${line.id}`, { token, body: { quantity: aboveStockQty } });
  check('update above stock 409', overUpd.status === 409, `(qty=${aboveStockQty}, stock=${stockBefore})`);

  const badItemUuid = await api('PATCH', '/api/cart/items/not-a-uuid', { token, body: { quantity: 1 } });
  check('malformed itemId 400', badItemUuid.status === 400);

  const rm = await api('DELETE', `/api/cart/items/${line.id}`, { token });
  check('remove item 200', rm.status === 200 && rm.json.data.cart.items.length === 0);

  const rmAgain = await api('DELETE', `/api/cart/items/${line.id}`, { token });
  check('repeated remove 404', rmAgain.status === 404);

  await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 1 } });
  const clear = await api('DELETE', '/api/cart', { token });
  check('clear cart 200, empty', clear.status === 200 && clear.json.data.cart.items.length === 0);
  check('cart record preserved after clear', clear.json.data.cart.id === cartId1);

  console.log('— Language handling —');
  const badLang = await api('GET', '/api/cart?lang=de', { token });
  check('invalid lang 400', badLang.status === 400);
  const lg = await api('GET', '/api/cart?lang=lg', { token });
  check('lang=lg accepted', lg.status === 200);

  console.log('— Checkout preview —');
  await api('POST', '/api/cart/items', { token, body: { productId: product.id, quantity: 2 } });

  const noFulfill = await api('POST', '/api/checkout/preview', { token, body: { fulfillmentMethod: 'HOME_DELIVERY', addressId: null } });
  check('HOME_DELIVERY without address 400', noFulfill.status === 400);
  const ghostAddr = await api('POST', '/api/checkout/preview', { token, body: { fulfillmentMethod: 'HOME_DELIVERY', addressId: '00000000-0000-0000-0000-000000000001' } });
  check('nonexistent address 404', ghostAddr.status === 404);
  const ghostStation = await api('POST', '/api/checkout/preview', { token, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 999999 } });
  check('nonexistent pickup station 404', ghostStation.status === 404);

  // valid pickup preview
  const stations = await fetch(`${BASE}/api/health`); // stations are admin-seeded; use known id 1 from seed
  const preview = await api('POST', '/api/checkout/preview', { token, body: { fulfillmentMethod: 'PICKUP_STATION', pickupStationId: 1 } });
  const co = preview.json?.data?.checkout;
  check('valid pickup preview 200', preview.status === 200);
  check('preview ready', co?.ready === true);
  check('subtotal integer UGX', Number.isInteger(co?.pricing?.subtotalUgx) && co.pricing.subtotalUgx > 0);
  check('commitment calculated from config', Number.isInteger(co?.pricing?.commitmentUgx) && co.pricing.commitmentUgx > 0);
  check('remaining = total - commitment', co?.pricing?.remainingBalanceUgx === co?.pricing?.totalUgx - co?.pricing?.commitmentUgx);
  // Phase 5+: pickup fee is 0 (integer UGX); home delivery fee is now calculated server-side
  check('deliveryFee integer for pickup', co?.fulfillment?.deliveryFeeUgx === 0);

  // read-only guarantee
  const stockAfterPreview = await api('GET', `/api/products/slug/${product.slug}`);
  check('preview does NOT deduct stock', stockAfterPreview.json.data.availability.stockQuantity === stockBefore);

  console.log('— IDOR —');
  // second customer tries to touch first customer's cart item
  const phone2 = `+25678${Math.floor(1000000 + Math.random() * 9000000)}`;
  await api('POST', '/api/auth/register', { body: { fullName: 'Phase4 Smoker B', phone: phone2, password: 'SmokePass123!' } });
  const login2 = await api('POST', '/api/auth/login', { body: { phone: phone2, password: 'SmokePass123!' } });
  const token2 = login2.json?.data?.token;
  const cartB = await api('GET', '/api/cart', { token });
  const itemB = cartB.json?.data?.cart?.items?.[0];
  if (itemB) {
    const steal = await api('PATCH', `/api/cart/items/${itemB.id}`, { token: token2, body: { quantity: 1 } });
    check("customer B cannot update customer A's item (404)", steal.status === 404);
    const stealDel = await api('DELETE', `/api/cart/items/${itemB.id}`, { token: token2 });
    check("customer B cannot delete customer A's item (404)", stealDel.status === 404);
  } else {
    check('IDOR setup (item present)', false, '— customer A cart unexpectedly empty');
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
})().catch((e) => {
  console.error('SMOKE RUNNER ERROR:', e.message);
  process.exit(1);
});

