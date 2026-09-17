# UgaFresh Delivery & Fulfillment API (Phase 7)

Backend fulfillment infrastructure for `HOME_DELIVERY` and `PICKUP_STATION` orders, built on top of the Phase 5 order lifecycle and Phase 6 payment infrastructure.

## Architecture

```
DeliveryController            (auth context, validation, response shaping)
        ↓
DeliveryService               (fulfillment state machine, assignment, views,
        ↓          ↘            notifications, pricing core)
OrderService                  applyOrderStatusTransition   ← THE order state machine
        ↓
Prisma / PostgreSQL           (row locks, FK + unique constraints, transactions)
```

- **One delivery per order.** Created transactionally during `POST /api/orders` (`createOrderFromCart`). DB-enforced by the unique constraint `deliveries.order_id` — retries/concurrent creations cannot produce a second fulfillment.
- **Single order state machine.** Delivery code never mutates `Order.status` directly; every order move goes through `order.service.applyOrderStatusTransition` (same function the admin endpoint uses). One `OrderStatusHistory` entry per transition.
- **Single delivery state machine.** All delivery status changes go through `delivery.service.applyDeliveryStatusTransition` (central map + fulfillment-type guards). Controllers never write delivery status.
- **Financial boundary.** Delivery code never creates payments, never fakes `COMMITMENT_PAID`, never processes balance payments or refunds. Phase 6 payment infrastructure remains the only path to `COMMITMENT_PAID`.

## Fulfillment Types

| Type | Created when | Initial status | Fee |
|---|---|---|---|
| `HOME_DELIVERY` | home-delivery order created | `PENDING` | server-calculated (see Pricing) |
| `PICKUP_STATION` | pickup order created | `PENDING` | 0 (station pickup fee not charged to the order) |

Snapshots are copied from the order's permanent Phase 5 snapshots at creation time (`addressSnapshot` / `stationSnapshot`) and are immutable afterwards.

## Delivery State Machine

```
HOME_DELIVERY:
  PENDING → ASSIGNED → READY → OUT_FOR_DELIVERY → DELIVERED
     ↘         ↘        ↘           ↘
      CANCELLED  READY   FAILED → OUT_FOR_DELIVERY (re-dispatch)

PICKUP_STATION:
  PENDING → READY → PICKED_UP
     ↘        ↘
      CANCELLED  FAILED (station issue)

Terminal states: DELIVERED, PICKED_UP, CANCELLED (no exits, no reassignment).
FAILED is not terminal: re-dispatch via FAILED → OUT_FOR_DELIVERY, mirroring the
order map's DELIVERY_FAILED → OUT_FOR_DELIVERY.
```

Guards enforced centrally:
- `READY → FAILED` is pickup-only (home deliveries must dispatch before failing).
- `DELIVERED` requires the delivery to be `OUT_FOR_DELIVERY` (a PENDING/READY delivery cannot be marked delivered in one hop).
- `PICKED_UP` is only valid for `PICKUP_STATION` fulfillments.
- Repeating the current status is an **idempotent no-op** (no history, no order transition, no side effects) — safe client/staff retries return `{ repeated: true }`.
- Every `FAILED` requires a controlled `failureReason` (`CUSTOMER_UNAVAILABLE`, `INVALID_ADDRESS`, `DRIVER_UNABLE_TO_COMPLETE`, `PICKUP_STATION_ISSUE`, `OTHER`).

## Order Integration

Delivery status → order status mapping (order map remains authoritative):

| Delivery event | Order transition | Notes |
|---|---|---|
| admin moves order | delivery syncs | `CONFIRMED`/`PREPARING` → delivery stays `PENDING`/`ASSIGNED`; `READY_FOR_DELIVERY`/`READY_FOR_PICKUP` → delivery `READY`; `CANCELLED` → delivery `CANCELLED`; `DELIVERY_FAILED` → delivery `FAILED` |
| delivery `OUT_FOR_DELIVERY` | order `OUT_FOR_DELIVERY` | order must already be `READY_FOR_DELIVERY` |
| delivery `DELIVERED` | order `DELIVERED` | exactly one history entry |
| delivery `PICKED_UP` | order `PICKED_UP` | exactly one history entry |

`ASSIGNED`/`READY` are delivery-internal operational steps (no order state exists for "assigned/ready during preparation"), so they only validate a sane order pre-condition (`COMMITMENT_PAID`+ / `CONFIRMED`+) without mutating the order.

Sync is **path-resolving and transactional**: if the delivery is several steps from its target (e.g. `ASSIGNED → READY → OUT_FOR_DELIVERY`), the intermediate hops are applied through the same transition map inside the order's transaction — an impossible state (order `DELIVERED`, delivery `PENDING`) cannot result from a single admin action, and a dispatch that never happened cannot be fabricated.

## Pricing & Distance

```
fee = baseFeeUgx + max(0, distanceKm - freeRadiusKm) * perKmRateUgx
fee = max(fee, minimumFeeUgx)
```

- Configured per active `DeliveryPricingConfig` row in the DB (`baseFeeUgx`, `freeRadiusKm`, `perKmRateUgx`, `minimumFeeUgx`, `warehouseLat`, `warehouseLng`). Defaults: 3000 UGX base, 3 km free radius, 1200 UGX/km, 3000 UGX minimum.
- Distance = **Haversine** between the warehouse origin (DB config) and the address coordinates. No external maps API is used or required.
- Address without coordinates → minimum-fee fallback (`NO_COORDINATES_MINIMUM_FEE`), never client-supplied distance.
- Money is **integer UGX** (`Int`); distance is stored as `Decimal(8,3)`. No floating-point arithmetic touches money.
- The client can never set fee/distance/rates: validators strip `deliveryFee`, `distanceKm`, `baseFeeUgx`, `perKmRateUgx`, `freeRadiusKm`, etc., and the server recomputes from the DB config.
- No active config → home delivery is unavailable (400); pickup still works.

## Assignment & RBAC

Roles: `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` (existing `Role` enum).

- All admin delivery routes require an admin JWT (`authenticateAdmin` + `requireRole('DISPATCHER','ADMIN','SUPER_ADMIN')`).
- Assignment targets must be **active** staff with role DISPATCHER/ADMIN/SUPER_ADMIN (validated server-side; 422 otherwise).
- Only `HOME_DELIVERY` deliveries can be assigned (pickup is station-based → 409).
- Terminal states (`DELIVERED`, `PICKED_UP`, `CANCELLED`) cannot be (re)assigned (409).
- Assignment is transactional with a `FOR UPDATE` row lock: concurrent assignments serialize — no corrupted state.
- Audited post-commit (`DELIVERY_ASSIGNED` / `DELIVERY_REASSIGNED`). Customers cannot reach assignment endpoints (401/403).

## Customer API

| Endpoint | Description |
|---|---|
| `GET /api/orders/:id/delivery` | Read-only fulfillment info for **the customer's own** order. Ownership is resolved from the authenticated JWT (IDOR-safe; foreign orders → 404 with no leak). Exposes: id, orderId, fulfillmentType, status, deliveryFeeUgx, distanceKm, addressSnapshot, stationSnapshot, scheduledAt/startedAt/completedAt, failureReason/Message, timestamps. Does **not** expose internal dispatcher metadata, audit details, or other customers' data. |

## Admin API

| Endpoint | Description |
|---|---|
| `GET /api/admin/deliveries` | Paginated list (max 50/page) with filters: `status`, `fulfillmentType`, `assignedAdminId`, `orderNumber`. |
| `GET /api/admin/deliveries/:id` | Delivery detail incl. `assignedAdmin` and order number/status. |
| `PATCH /api/admin/deliveries/:id/assign` | Body `{ assignedAdminId, notes? }`. |
| `PATCH /api/admin/deliveries/:id/status` | Body `{ status, failureReason?, failureMessage?, notes?, scheduledAt? }`. Idempotent repeats return `{ repeated: true }`. |

All request bodies pass through Zod validation with mass-assignment stripping (`orderId`, `orderStatus`, `deliveryFee`, `distanceKm`, `assignedAdminId`-in-status, `customerId`, etc. are ignored/rejected).

## Security

- **IDOR:** customer delivery access is derived from the authenticated identity only; cross-customer access returns 404 without leaking existence.
- **RBAC:** admin endpoints require admin JWT + role; dispatcher permissions are operational only (no financial capabilities exist to escalate into).
- **Server-authoritative pricing:** fee/distance/rates come exclusively from DB config + Haversine.
- **Address ownership:** validated at order creation (Phase 5); the delivery snapshot is then frozen.
- **State enforcement:** both state machines are centralized maps; no controller or route mutates status directly.
- **Concurrency:** row locks (`FOR UPDATE`) on transitions/assignment; conditional guarded update for cancellation sync; DB unique constraint prevents duplicate fulfillments.
- **Audit integrity:** audits are written **after** the transaction commits (matching the Phase 6 convention) — an audit failure can never corrupt an operational state change. No secrets, tokens, or personal contact data are written to audit records.
- **Notifications:** in-app only (`Notification` table), best-effort with error logging; a notification failure never rolls back fulfillment state.

## Cancellation Interaction

- Order cancellation (Phase 5 rules own eligibility) deactivates the fulfillment: delivery → `CANCELLED` via a conditional atomic update (`status IN ('PENDING','ASSIGNED','READY')`), inside the same transaction as stock restoration. A delivery already `DELIVERED`/`PICKED_UP`/`FAILED` is left untouched (money/history intact).
- No refund is recorded or faked; `COMMITMENT_PAID` is never set or unset by delivery code.

## Payment & Balance Boundary

- **Phase 7 does not process balance payments.** Completing a delivery leaves the order in `DELIVERED`/`PICKED_UP`; `BALANCE_PAID` and `COMPLETED` remain future staff-confirmed transitions through the existing order map. Cash is never assumed received.
- **Phase 7 does not process refunds.**
- **Phase 6 payment infrastructure remains authoritative** for all payment state.

## Environment Variables

No new Phase 7 environment variables are required. Pricing origin/fees live in the `delivery_pricing_config` DB table (managed by existing admin configuration), not in env or code.

## Testing

`tests/delivery.test.js` (23 tests): creation (home/pickup/IDOR address/inactive station), pricing authority + formula table, snapshot immutability, IDOR/RBAC, full lifecycle sync (home + pickup), invalid transitions, idempotent repeats, assignment (authorized/invalid target/terminal/pickup/concurrent), cancellation interaction, and real-DB concurrency (5 completions / 5 pickups → exactly one transition + one history entry). `scripts/phase7-smoke.js` (40 HTTP checks) exercises the same boundaries over real HTTP with exact cleanup.

## Future Work (deliberately deferred)

- Real payment provider integration (Phase 6 boundary, `src/services/paymentProviders/`)
- Balance payment processing (`BALANCE_PAID` flow)
- Refunds / refund provider
- Driver mobile application, GPS tracking, live maps, route optimization
- Push notifications / external notification providers
- Delivery time-window estimates and scheduling beyond the `scheduledAt` field
