# UgaFresh Payments API — Phase 6

Commitment-payment infrastructure for the existing Phase 5 order lifecycle.

**Core business rule:** creating an order does NOT mean the commitment payment has been paid. A new order is `PENDING_PAYMENT`; only a **server-side verified provider result** may move it to `COMMITMENT_PAID`. The client can never assert payment success.

---

## 1. Architecture

```
payment.controller        (HTTP boundary, validation)
        │
payment.service           (domain logic: eligibility, amounts, idempotency,
        │                  transactional verification, order transition)
        │
PaymentProvider contract  (src/services/paymentProviders/index.js)
        │
        ├── mockProvider  — deterministic sandbox, NON-PRODUCTION
        └── (future real adapters plug in here, e.g. flutterwaveProvider)
```

- Providers are **stateless adapters**: they talk to the outside world and return normalized results. They never touch the database and never decide order lifecycle.
- `payment.service` is the only component that may transition an order because of a payment — and it does so **exclusively** through the central Phase 5 transition function (`order.service.applyOrderStatusTransition`, same map the admin endpoint uses). There is no second status-transition mechanism.
- The provider `verifyWebhook()` is the **single signature-verification boundary**; provider-specific logic never appears in controllers or routes.

### Real provider integration point (future)
Add an adapter next to `mockProvider.js`, implement `initiatePayment` / `verifyPayment` / `verifyWebhook`, and register it in `PROVIDER_REGISTRY` (`src/services/paymentProviders/index.js`). The active provider is selected purely by `PAYMENT_PROVIDER` in env — no other code changes. Production refuses non-production providers (`isProduction: false` → 403 under `NODE_ENV=production`).

---

## 2. Payment lifecycle

Statuses (`PaymentStatus`): `PENDING → PROCESSING → SUCCESS | FAILED | CANCELLED | EXPIRED`

```
initiate  → PENDING          (attempt created; order STILL PENDING_PAYMENT)
webhook SUCCESS → SUCCESS    (verified; order → COMMITMENT_PAID, atomically)
webhook FAILED  → FAILED     (order stays PENDING_PAYMENT; retry creates a fresh attempt)
TTL exceeded    → EXPIRED    (lazy sweep on next initiate/webhook; can never verify afterwards)
```

- Every attempt carries `expiresAt` (`PAYMENT_ATTEMPT_TTL_MINUTES`, default 30). Expiration is **service-based and lazy** — no scheduler was added. A future periodic job can call `paymentExpiry.applyPaymentExpiration(prisma)` if volumes require it.
- `purpose`: `COMMITMENT` (implemented) / `BALANCE` (reserved — the remaining order balance continues to be collected through the existing cash business process, **not** online in this phase).

## 3. Order integration

- `PENDING_PAYMENT → COMMITMENT_PAID` is validated by the same central map as every admin transition; the payment path cannot jump to `CONFIRMED` or beyond.
- Verification is one DB transaction: payment → `SUCCESS` (+`verifiedAt`), order → `COMMITMENT_PAID`, exactly one `OrderStatusHistory` entry (`changedByType: SYSTEM`), then post-commit audit `COMMITMENT_PAYMENT_APPLIED`.
- Failure never marks the order paid and never rolls the order back to an earlier state; the customer simply retries initiation.
- Audit actions: `PAYMENT_INITIATED`, `PAYMENT_FAILED`, `PAYMENT_WEBHOOK_REJECTED`, `COMMITMENT_PAYMENT_APPLIED` (secrets never appear in audit details).

## 4. API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders/:id/payment` | customer JWT (owner) | Initiate/reuse the commitment payment attempt |
| GET | `/api/orders/:id/payment` | customer JWT (owner) | List own payment attempts for the order |
| POST | `/api/payments/webhook` | provider signature (no JWT) | Provider result callbacks |
| GET | `/api/admin/orders/:id/payment` | admin JWT | Read-only payment visibility |

- Initiation body: nothing financially meaningful is accepted. `amount`, `currency`, `status`, `paymentStatus`, `paid`, `providerRef`, `transactionRef`, `provider` etc. are validated-and-stripped by Zod. The amount always comes from `Order.commitmentAmount` (integer UGX); currency is locked to `UGX`.
- Idempotent initiation: retries reuse the single active `PENDING/PROCESSING` attempt (order row locked; concurrent initiations share one attempt). After success, initiation returns the existing successful payment (`reused: true`) rather than creating a second one. A `FAILED`/`EXPIRED` attempt is superseded by a fresh attempt on the next initiation.
- Error mapping follows the central handler: 400 invalid/signature, 401 unauthenticated, 404 unknown order/payment, 409 wrong state (cancelled, not payable), 422 semantic mismatch (amount/order reference), 413 oversized webhook, 429 rate limited.

## 5. Webhook security

- Signature: HMAC-SHA256 over the **exact raw request body bytes** (captured by the `express.json` `verify` hook — re-serialized JSON would not verify), keyed with `PAYMENT_WEBHOOK_SECRET`, header `x-ugafresh-signature`. Comparison is timing-safe.
- Rejected: missing/invalid signature, malformed payload, unknown `providerRef` (audited `PAYMENT_WEBHOOK_REJECTED`), amount/currency/order-number mismatch, wrong purpose, event for a cancelled/non-payable order.
- Events are validated against **internal authoritative state** (stored amount/currency/order binding), never against other client data.
- Rate limiting: dedicated generous webhook limiter so provider retries are not starved, on top of the global API limiter.

## 6. Idempotency & duplicate protection (DB-enforced)

- `payments.transaction_ref` UNIQUE (internal reference).
- `payments (provider, provider_ref)` UNIQUE — one provider event can never map to two payments.
- Partial unique index `payments_one_successful_commitment_per_order` — **at most one successful COMMITMENT payment per order**, enforced by PostgreSQL (`WHERE purpose='COMMITMENT' AND status='SUCCESS'`), so even concurrent/raced verifications cannot create duplicate financial state.
- Webhook replay of a processed success is acknowledged (`ALREADY_PROCESSED`) and changes nothing: no second payment, no second transition, no second history entry, no duplicate audit.
- Row-level `FOR UPDATE` locking serializes concurrent webhook processors; losers observe the committed state and return `ALREADY_PROCESSED`.

## 7. Cancellation × payment (refund boundary)

- `PENDING_PAYMENT → CANCELLED` then a late success webhook → **rejected** (`ORDER_NOT_PAYABLE`, audited); a cancelled order can never become paid.
- `COMMITMENT_PAID → CANCELLED` (customer-cancellable per Phase 5) → order cancelled, stock restored exactly once, and the successful payment record is **preserved untouched**. No refund is recorded, faked, or processed — real refund-provider integration is explicitly out of Phase 6 scope and must be built on top of this preserved record in a later phase.

## 8. Environment variables

| Variable | Purpose |
|---|---|
| `PAYMENT_PROVIDER` | Active provider (`MOCK` only for now; refused in production) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret for webhook signatures (never commit; never log) |
| `PAYMENT_ATTEMPT_TTL_MINUTES` | Attempt TTL before lazy expiry (default 30) |

See `.env.example`. The mock provider is clearly marked non-production and is hard-blocked when `NODE_ENV=production`.

## 9. Testing

- `tests/payment.test.js` — initiation, tampering, IDOR, verification transitions, failure/retry, cancellation interaction, snapshot immutability (13 tests).
- `tests/paymentWebhook.test.js` — signature enforcement, payload validation, replay/duplicate/concurrent webhooks (13 tests).
- `tests/paymentIntegrity.test.js` — DB-level uniqueness proofs, concurrent initiation, expiry, cancellation-after-payment, response redaction (6 tests).
- `scripts/phase6-smoke.js` — 32 end-to-end HTTP checks with exact cleanup.
