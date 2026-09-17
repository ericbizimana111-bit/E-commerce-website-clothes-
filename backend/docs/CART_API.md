# Cart & Checkout Preparation API (Phase 4)

All endpoints require a **customer JWT**: `Authorization: Bearer <customer_token>`.
Admin tokens are a separate auth context and are rejected on these routes.

Errors use the project's standard envelope:

```json
{ "success": false, "message": "...", "errors": [ { "field": "...", "message": "..." } ] }
```

Common status codes: `400` validation/business rule, `401` unauthenticated, `404` not found,
`409` stock conflict, `429` rate limited, `500` server error.

---

## GET /api/cart

Returns the authenticated customer's cart, creating it if it does not exist
(concurrency-safe: exactly one cart per customer).

**Query:** `lang` (optional) — `en` | `lg` | `fr` | `sw` (case-insensitive). Invalid → `400`.
Fallback chain: requested language → English → first available translation.

**Response:**

```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "uuid",
      "itemCount": 3,
      "lineCount": 1,
      "items": [
        {
          "id": "uuid",
          "productId": 1,
          "quantity": 3,
          "unitPriceUgx": 5000,
          "cartPriceUgx": 5000,
          "subtotalUgx": 15000,
          "priceIsStale": false,
          "availability": {
            "inStock": true,
            "sufficientStock": true,
            "stockQuantity": 45,
            "isActive": true,
            "purchasable": true
          },
          "product": {
            "id": 1,
            "slug": "fresh-green-matooke-cluster",
            "name": "Fresh Green Matooke (Cluster)",
            "unit": "bunch",
            "priceUgx": 5000,
            "isActive": true,
            "stockQuantity": 45,
            "image": "https://..."
          }
        }
      ],
      "subtotalUgx": 15000,
      "totalUgx": 15000,
      "currency": "UGX"
    }
  }
}
```

All prices/totals are server-calculated integer UGX. `unitPriceUgx` always reflects the
**current** product price from PostgreSQL; `cartPriceUgx` is the snapshot taken when the
item was added; `priceIsStale` flags a mismatch. Availability flags let the frontend warn
about deactivated products or stock drops (items are never silently deleted).

---

## POST /api/cart/items

Adds a product or increments an existing line (never duplicates a row).

**Body:**

```json
{ "productId": 1, "quantity": 2 }
```

- `productId` — integer, required
- `quantity` — integer 1..1000, required (0, negatives, decimals, NaN, Infinity → `400`)

Client-supplied `priceUgx` / `unitPriceUgx` / `subtotalUgx` / `userId` / `cartId`
are **stripped** (mass-assignment protection). Price is read from the DB.

**Errors:** `404` product missing, `400` product inactive, `409` resulting quantity
(existing + requested) exceeds available stock — the whole operation is rejected, no partial add.

**Status:** `201`

---

## PATCH /api/cart/items/:itemId

Sets a new quantity for one of this customer's cart items.

**Body:** `{ "quantity": 5 }` — integer 1..1000.

Ownership-scoped: another customer's `itemId` → `404` (IDOR-safe). Product must still be
active and in stock; `409` if requested quantity exceeds stock, `410` if product was removed.

**Status:** `200` with the refreshed cart.

---

## DELETE /api/cart/items/:itemId

Removes one item from this customer's cart. Another customer's item → `404`.
Repeated deletes → `404`. **Status:** `200` with the updated cart.

---

## DELETE /api/cart

Removes **all** items; preserves the cart record itself. Idempotent on an empty cart.
**Status:** `200` with an empty cart representation.

---

## POST /api/checkout/preview

Read-only checkout **preparation**. Never creates an order, payment, or reservation and
never mutates stock — it validates the cart and calculates what checkout would cost.

**Body:**

```json
{ "fulfillmentMethod": "HOME_DELIVERY", "addressId": "uuid", "pickupStationId": null }
```

or

```json
{ "fulfillmentMethod": "PICKUP_STATION", "pickupStationId": 1, "addressId": null }
```

- `fulfillmentMethod` — `HOME_DELIVERY` | `PICKUP_STATION` (matches Prisma enums)
- address must exist **and belong to the customer** (else `404`)
- pickup station must exist and be active (else `404`)

**Response:**

```json
{
  "success": true,
  "data": {
    "checkout": {
      "ready": true,
      "issues": [],
      "fulfillment": {
        "fulfillmentMethod": "PICKUP_STATION",
        "pickupStationId": 1,
        "deliveryFeeUgx": null,
        "deliveryFeeNote": "Delivery fee calculation is not yet available and will be added in the delivery phase"
      },
      "pricing": {
        "currency": "UGX",
        "subtotalUgx": 34000,
        "totalUgx": 34000,
        "commitmentUgx": 10200,
        "remainingBalanceUgx": 23800,
        "commitmentNote": "Commitment calculated from current platform commitment rules"
      },
      "items": [
        {
          "cartItemId": "uuid",
          "productId": 1,
          "slug": "...",
          "quantity": 2,
          "cartUnitPriceUgx": 17000,
          "currentUnitPriceUgx": 17000,
          "priceIsStale": false,
          "lineSubtotalUgx": 34000
        }
      ]
    }
  }
}
```

`ready: false` with a populated `issues` array (`PRODUCT_INACTIVE`, `INSUFFICIENT_STOCK`,
`STALE_PRICE`) means checkout could not proceed safely; issues never mutate the cart.
`commitmentUgx` / `remainingBalanceUgx` come from the active `commitment_rule_config`
(30% percentage rule, 5000 UGX minimum by default) via the Phase 1 currency utilities.
Delivery fee is intentionally `null` until the delivery phase implements it.

**Status:** `200` (preview), `400` (empty cart / invalid fulfillment / malformed body),
`404` (address/station not found or not owned).
