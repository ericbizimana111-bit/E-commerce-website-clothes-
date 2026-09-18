# UgaMarket — home to home: Payments & Financial Lifecycle API

Payment infrastructure and financial lifecycle for **UgaMarket — home to home** marketplace backend (Phases 6 & 8).

**Core Business Rules:**
1. Creating an order does **not** mean the commitment payment has been paid. A new order is `PENDING_PAYMENT`; only a **server-verified provider result** can transition it to `COMMITMENT_PAID`.
2. Completing fulfillment does **not** mean the balance payment has been paid. An order in `DELIVERED` or `PICKED_UP` requires a **server-verified balance payment** before reaching its final terminal state `COMPLETED`.
3. Financial state is **server-authoritative**: client-submitted amounts, currencies, statuses, or tokens are completely ignored and stripped by Zod validation. All financial arithmetic uses strictly integer Ugandan Shillings (UGX).
4. No fake refunds: when a paid order is cancelled, the payment record is preserved untouched with zero automatic refund simulation.

---

## 1. System Architecture

```
HTTP Request / Webhook
         │
         ▼
 payment.controller          (HTTP boundary, input validation, user context)
         │
         ▼
 payment.service             (Authoritative domain logic: eligibility guards,
         │                    balance calculation, attempt reuse, row locking,
         │                    transactional completion & notifications)
         │
         ├──► order.service  (Central state machine & OrderStatusHistory)
         ├──► audit.service  (Sanitized operational audit logging)
         └──► db (Prisma)    (PostgreSQL with partial unique index guards)
         │
         ▼
 PaymentProvider Contract    (src/services/paymentProviders/index.js)
         │
         ├── mockProvider    (Deterministic HMAC-SHA256 sandbox, NON-PRODUCTION)
         └── (Future real adapters, e.g. flutterwaveProvider / mtnMomoProvider)
```

- **Stateless Providers**: Providers talk to external gateways and normalize events. They never touch the database and never make lifecycle decisions.
- **Single State Machine**: All order status transitions — whether triggered by admin action or payment webhooks — flow exclusively through `applyOrderStatusTransition` using the canonical `ORDER_STATUS_TRANSITIONS` table.
- **Provider Registry**: The active provider is determined strictly by the `PAYMENT_PROVIDER` environment variable. Production environments block non-production providers (`isProduction: false` → 403 under `NODE_ENV=production`).

---

## 2. Two-Stage Payment Lifecycle

| Lifecycle Stage | Order Prerequisites | Payment Purpose | Success Transition | Resulting Order Status |
|---|---|---|---|---|
| **Stage 1: Commitment** | Order created (`PENDING_PAYMENT`) | `COMMITMENT` | `PENDING_PAYMENT` → `COMMITMENT_PAID` | Ready for admin confirmation & prep |
| **Stage 2: Balance** | Fulfillment finished (`DELIVERED` or `PICKED_UP`) | `BALANCE` | `DELIVERED` / `PICKED_UP` → `COMPLETED` | Fully paid, terminal completion |

### Payment Attempt Statuses (`PaymentStatus`)
```
initiatePayment() ──► PENDING / PROCESSING
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
     webhook SUCCESS                 webhook FAILED
            │                               │
            ▼                               ▼
         SUCCESS                         FAILED
(Order transitions atomically)   (Order unchanged; retry creates fresh attempt)
```

- Attempts carry a configurable TTL (`PAYMENT_ATTEMPT_TTL_MINUTES`, default 30).
- Expiration is lazily evaluated during subsequent initiation or webhook delivery.

---

## 3. Server-Authoritative Balance Calculation & Eligibility

### Calculation Rules
The outstanding balance due on any order is computed strictly on the server:
$$\text{remainingBalanceUgx} = \text{totalUgx} - \sum(\text{successful commitment & balance payments})$$

- If $\text{remainingBalanceUgx} \le 0$, initiation is rejected with `409 Conflict` (`This order has no outstanding balance due`).
- Client attempts to pass `amount`, `amountUgx`, `currency`, `status`, `providerRef`, or `mockOutcome` in request bodies are discarded by the input sanitizer.

### Fulfillment Eligibility Boundary
Balance payment cannot be initiated or applied until physical fulfillment is complete:
- **Home Delivery (`HOME_DELIVERY`)**: Order status must be `DELIVERED`.
- **Pickup Station (`PICKUP_STATION`)**: Order status must be `PICKED_UP`.
- Any initiation before reaching these fulfillment states is rejected with `409 Conflict` (`Order is not eligible for balance payment. Fulfillment must be completed first`).

---

## 4. API Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/orders/:id/payment` | Customer JWT (Order owner) | Initiate or reuse payment attempt (`COMMITMENT` or `BALANCE`) |
| `GET` | `/api/orders/:id/payment` | Customer JWT (Order owner) | View payment breakdown, pricing summary, and attempt history |
| `POST` | `/api/payments/webhook` | Provider Signature (Header) | Signed provider callback for payment outcome |
| `GET` | `/api/admin/orders/:id/payment` | Admin JWT (`SUPER_ADMIN`, `ADMIN`, `FINANCE`) | Read-only payment audit view for an order |

### Request: Initiate Payment
```http
POST /api/orders/e28be63a-7612-421d-922e-13c59a35e9cb/payment HTTP/1.1
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "purpose": "BALANCE"
}
```
*Note: If `purpose` is omitted, it defaults to `COMMITMENT`.*

### Response: Initiate Payment
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": "7611ef49-6f1c-43f1-b8f9-4d640242ac11",
      "provider": "MOCK",
      "purpose": "BALANCE",
      "status": "PENDING",
      "amountUgx": 25000,
      "currency": "UGX",
      "providerRef": "mock_bal_e28be63a_1726671000",
      "checkoutUrl": "https://mock-payments.ugamarket.internal/checkout/mock_bal_e28be63a_1726671000"
    },
    "reused": false
  }
}
```

### Response: Customer Payment View
```json
{
  "success": true,
  "data": {
    "orderId": "e28be63a-7612-421d-922e-13c59a35e9cb",
    "orderNumber": "FB-20260918-A1B2C3",
    "orderStatus": "COMPLETED",
    "fulfillmentMethod": "PICKUP_STATION",
    "isFullyPaid": true,
    "isCompleted": true,
    "pricing": {
      "currency": "UGX",
      "subtotalUgx": 30000,
      "deliveryFeeUgx": 0,
      "totalUgx": 30000,
      "commitmentUgx": 5000,
      "balanceUgx": 25000,
      "totalPaidUgx": 30000,
      "remainingBalanceUgx": 0
    },
    "commitmentPaymentStatus": "SUCCESS",
    "balancePaymentStatus": "SUCCESS",
    "payments": [ ... ]
  }
}
```

---

## 5. Webhook Security & Idempotency

### Signature Verification
- Provider webhooks must include an HMAC-SHA256 signature in the `x-ugafresh-signature` (or configured provider) header.
- The HMAC is computed over the **exact raw request body bytes** using `PAYMENT_WEBHOOK_SECRET`.
- Comparison uses constant-time `crypto.timingSafeEqual` to prevent timing attacks.
- Missing or invalid signatures result in immediate `400 Bad Request`.

### Payload Tampering Protection
Even with a valid HMAC signature, the webhook payload is cross-checked against database records:
- `orderNumber` must match the internal `Order.orderNumber`.
- `amountUgx` must match `Payment.amountUgx` exactly; mismatches return `422 Unprocessable Entity`.
- `currency` must match `Payment.currency` (`UGX`).
- `purpose` must match `Payment.purpose`.

### Concurrency & Duplicate Protection (DB-Level)
- **PostgreSQL Partial Unique Indexes**:
  - `payments_one_successful_commitment_per_order` on `payments(order_id) WHERE purpose = 'COMMITMENT' AND status = 'SUCCESS'`
  - `payments_one_successful_balance_per_order` on `payments(order_id) WHERE purpose = 'BALANCE' AND status = 'SUCCESS'`
- **Pessimistic Row Locking**: Order and Payment rows are locked with `FOR UPDATE` during webhook verification.
- **Replay Idempotency**: Replaying an already processed webhook returns `200 OK` with `{ event: "ALREADY_PROCESSED" }`, producing zero duplicate history, notification, or audit records.

---

## 6. Order Completion & Side Effects

When a balance payment webhook succeeds:
1. `Payment.status` moves to `SUCCESS`, stamping `verifiedAt`.
2. The order transitions atomically to `COMPLETED`.
3. An `OrderStatusHistory` row is inserted with `statusFrom: <PICKED_UP|DELIVERED>`, `statusTo: 'COMPLETED'`, `changedByType: 'SYSTEM'`.
4. An in-app `Notification` is created for the customer:
   - `type`: `ORDER_STATUS`
   - `title`: `Order Completed`
   - `message`: `Your order #<orderNumber> is complete. Thank you for shopping with UgaMarket!`
5. An audit log entry is recorded with action `BALANCE_PAYMENT_APPLIED` (sanitized; no secrets or tokens).

---

## 7. Cancellation & Refund Boundaries

- **Cancellations**:
  - Orders in `COMPLETED` cannot be cancelled by customers or administrators (`409 Conflict`).
  - Orders cancelled prior to balance payment cannot accept balance payment initiations or webhooks (`409 Conflict`).
- **No Fake Refunds**:
  - If an order with a successful commitment payment is cancelled (e.g. while `CONFIRMED`), the payment record remains intact in the database as `SUCCESS`.
  - No simulated refund transactions, negative balances, or fake ledger adjustments are created.
  - Actual financial refund gateways will be implemented when real banking rails are connected.

---

## 8. Automated Verification

- `tests/balancePayment.test.js`: 14 comprehensive tests covering fulfillment boundaries, server-authoritative balance calculation, idempotency, webhook security, failures/retries, order completion, notifications, replay protection, IDOR/RBAC, and concurrency races.
- `scripts/phase8-smoke.js`: 50 end-to-end integration assertions verifying the live running server, customer & admin flows, and multi-threaded concurrency.
