# Orders API (Phase 5)

Customer endpoints require a **customer JWT**; admin endpoints require an **admin JWT**
(`DISPATCHER`, `ADMIN`, or `SUPER_ADMIN`). Customer and admin token contexts are strictly
separated — a customer JWT is rejected (401) on `/api/admin/*`.

Errors use the standard envelope `{ "success": false, "message": "...", "errors": [...] }`.

---

## Order Lifecycle

```text
PENDING_PAYMENT ─→ COMMITMENT_PAID ─→ CONFIRMED ─→ PREPARING ─┬─→ READY_FOR_DELIVERY ─→ OUT_FOR_DELIVERY ─┬─→ DELIVERED ─→ BALANCE_PAID ─→ COMPLETED
       │               │                  │            │          │                                          │
       │               │                  │            │          └─→ READY_FOR_PICKUP ─→ PICKED_UP ────────┘ (→ BALANCE_PAID …)
       ↓               ↓                  ↓            ↓
   CANCELLED       CANCELLED          CANCELLED     CANCELLED
       └─ PAYMENT_FAILED (→ CANCELLED | PENDING_PAYMENT)
       └─ DELIVERY_FAILED (→ REFUNDED | OUT_FOR_DELIVERY), REFUNDED terminal
```

Transitions are enforced server-side by a centralized map (`src/constants/index.js`).
Clients can never set a status directly; invalid transitions return **409**.
Every successful change (including creation, `null → PENDING_PAYMENT`) writes an
`OrderStatusHistory` entry.

---

## POST /api/orders  (customer)

Creates an order from the authenticated customer's cart in **one atomic transaction**:
revalidates the cart, locks product rows (`FOR UPDATE`), re-reads authoritative prices,
deducts stock, writes `SALE` inventory history, snapshots fulfillment, creates the order +
items + initial status history, and clears the customer's cart items. Any failure rolls
everything back.

**Request**

```json
{ "fulfillmentMethod": "HOME_DELIVERY", "addressId": "uuid", "notes": "ring the bell" }
```

or

```json
{ "fulfillmentMethod": "PICKUP_STATION", "pickupStationId": 1 }
```

Client-supplied `userId`, `orderNumber`, `status`, `subtotalUgx`, `deliveryFeeUgx`,
`totalUgx`, `commitmentUgx`, `remainingBalanceUgx`, `currency`, `items` are **stripped**
(mass-assignment protection).

**Errors:** `400` empty cart / inactive product / invalid fulfillment / delivery not configured,
`404` address not owned or station missing/inactive, `409` insufficient stock.

**Response:** `201` with `{ data: { order } }` including `orderNumber` (`FB-YYYYMMDD-XXXXXX`),
status history, items with snapshot prices, and the pricing block:

```json
"pricing": {
  "currency": "UGX",
  "itemsSubtotalUgx": 34000,
  "deliveryFeeUgx": 6000,
  "totalUgx": 40000,
  "commitmentUgx": 12000,
  "remainingBalanceUgx": 28000
}
```

Home delivery fee uses the active `delivery_pricing_config`:
`base_fee + max(0, km − free_radius_km) × per_km_rate` (Haversine from the warehouse;
minimum fee when the address has no coordinates). Pickup fee is `0`.
Commitment comes from `commitment_rule_config` (default: 30%, min 5000 UGX).

The order snapshots: product name/price/unit per line, address (title, district, division,
street, lat/lng) or station (name, district, addressText, contactPhone, operatingHours).
Later edits to products/addresses/stations/config never change existing orders.

---

## GET /api/orders  (customer)

Own orders only, newest first. Query: `page` (default 1), `limit` (default 10, max 50),
`status` (comma-separated list), `lang`. Returns `{ items, pagination }`.

## GET /api/orders/:id  (customer)

Own order detail (404 for another customer's order). Includes items, full status history,
payment records if present, fulfillment snapshots. Query: `lang=en|lg|fr|sw` (400 otherwise).

## POST /api/orders/:id/cancel  (customer)

Cancels the customer's own order. Allowed only in `PENDING_PAYMENT`, `COMMITMENT_PAID`,
`CONFIRMED` — otherwise **409**. Restores stock exactly once (`RETURN` inventory history),
records history, is safely rejected when already `CANCELLED`. Body: `{ "reason": "..." }`
(optional, ≤500 chars).

---

## GET /api/admin/orders  (admin)

All orders, paginated (`page`, `limit` ≤ 100), filterable by `status` (comma list) and
`fulfillmentMethod` (`HOME_DELIVERY`|`PICKUP_STATION`), `search` by order number or
customer phone/email. Returns customer `{ id, fullName, phone, email }` — never passwordHash.

## GET /api/admin/orders/:id  (admin)

Full detail including status history, payments, customer info.

## PATCH /api/admin/orders/:id/status  (admin)

**Body:** `{ "status": "CONFIRMED", "reason": "supplier confirmed" }`

Validated against the transition map (invalid → **409**). `CANCELLED` via this endpoint also
restores stock exactly once and writes `RETURN` inventory history. Every change writes an
`OrderStatusHistory` row (`changedByType: ADMIN`) and an audit log entry
(`ORDER_STATUS_<STATUS>`); reasons/notes never contain secrets.

---

## Idempotency / duplicate protection

Order creation derives everything from the authenticated user's cart inside one locked
transaction; double-clicks at worst produce a second order only if the cart still has items
after the first request completed (the cart is cleared on success, so retries find an empty
cart → `400`). Client order numbers are ignored. A formal idempotency-key table is deferred
to the payment phase, where provider retries make it essential.
