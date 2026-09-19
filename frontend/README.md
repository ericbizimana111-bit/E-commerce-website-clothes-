# UgaMarket — home to home | Customer Web Application (Phase 9)

The customer-facing website for **UgaMarket — home to home**, a modern Ugandan
food marketplace. Customers browse farm-fresh food, order with a small
commitment deposit, track fulfillment, and pay the remaining balance after
quality inspection.

This app consumes the existing backend API from Phases 1–8
(`backend/`) — it never talks to the database directly and contains no admin
functionality (the admin dashboard is Phase 10).

---

## Architecture

```
frontend/
├── public/                     # Static assets (index.html, favicon, placeholders)
└── src/
    ├── api/
    │   └── client.js           # Centralized API client (base URL, auth token,
    │                           #   error normalization, 401 event, image URL resolver)
    ├── Components/             # Reusable UI (Navbar, Footer, ProductCard)
    ├── Context/                # React state providers
    │   ├── AuthContext.jsx     # Customer session (JWT + /auth/me, 401 expiry handling)
    │   ├── CartContext.jsx     # Backend-authoritative cart (guest cart synced on login)
    │   ├── LanguageContext.jsx # en/lg/sw/fr UI translations
    │   └── ShopContext.jsx     # (legacy stub, unused)
    ├── Pages/                  # Route-level screens (see Routing below)
    ├── utils/currency.js       # Centralized UGX formatting (UGX 10,000)
    ├── App.js                  # Router + protected-route guard
    └── index.js                # Provider tree entry point
```

### API client
All HTTP goes through `src/api/client.js`:
- Base URL from `REACT_APP_API_URL` (default `http://localhost:4000/api`)
- `Authorization: Bearer <token>` attached automatically
- Errors normalized to `ApiError { message, status, data }`
- A `401` dispatches `ugamarket:unauthorized` so `AuthContext` can clear the
  expired session

## Environment configuration

Copy `.env.example` to `.env.local` and adjust:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REACT_APP_API_URL` | `http://localhost:4000/api` | UgaMarket backend base URL |

No secrets belong in this app. The backend remains the authority for prices,
stock, totals, commitment rules and order status.

## Authentication flow

Phone-first customer auth against the backend contract:

1. **Signup** — `POST /api/auth/register` (`fullName`, `phone` (07XXXXXXXX or
   +2567XXXXXXXX), optional `email`, `password`) → `{ data: { user, token } }`
2. **Login** — `POST /api/auth/login` (`phone`, `password`) → `{ data: { user, token } }`
3. The JWT is stored in `localStorage` (`ugamarket_token`) and mirrored in
   memory; the profile is revalidated with `GET /api/auth/me` on page load.
4. On any `401`, the session is cleared and the customer is redirected to
   `/login?redirect=…`, preserving the original destination (e.g. checkout).
5. **Logout** clears the token locally (the backend is stateless JWT).

## Route structure

| Route | Guard | Page |
| --- | --- | --- |
| `/` | public | Home (hero, categories, featured products, how it works, pickup stations) |
| `/catalog` | public | Product catalog with search, category, price & stock filters |
| `/product/:idOrSlug` | public | Product details |
| `/cart` | public | Cart (backend cart for logged-in, guest localStorage otherwise) |
| `/pickup-stations` | public | Pickup station directory |
| `/how-it-works` | public | Commitment-deposit explainer |
| `/login` (`?signup=true`, `?redirect=`) | public | Login / signup |
| `/checkout` | auth | Fulfillment choice, server checkout preview, order creation |
| `/account/orders` | auth | Order history (paginated) |
| `/account/orders/:id` | auth | Order tracking, payments, delivery, payment history |
| `/account/addresses` | auth | Address book (add/delete) |
| `/account/notifications` | auth | In-app notifications with read state |

## Backend APIs consumed

Public: `GET /api/categories`, `GET /api/products`, `GET /api/products/:id|slug/:slug`,
`GET /api/pickup-stations`, `POST /api/auth/*`

Customer (JWT): `GET /api/auth/me`, `GET|POST|PATCH|DELETE /api/cart*`,
`POST /api/checkout/preview`, `POST /api/orders`, `GET /api/orders`,
`GET /api/orders/:id`, `POST /api/orders/:id/cancel`,
`POST /api/orders/:id/payment` (purpose `COMMITMENT`/`BALANCE`),
`GET /api/orders/:id/payment`, `GET /api/orders/:id/delivery`,
`GET|POST|DELETE /api/addresses*`, `GET /api/notifications`,
`PATCH /api/notifications/:id/read`

## Customer flows

1. **Browse** Home → Catalog → Product → Add to Cart
2. **Checkout** Cart → Checkout → Home Delivery (address) *or* Pickup Station
   → server checkout preview → Place Order (`POST /api/orders`)
3. **Commitment payment** Order detail → Pay Deposit →
   `POST /api/orders/:id/payment` → the backend webhook verifies the provider
   outcome → order becomes `COMMITMENT_PAID` (UI polls while the attempt is
   pending; in development the deterministic mock provider is used)
4. **Fulfillment** order/delivery status is shown from
   `GET /api/orders/:id` + `GET /api/orders/:id/delivery`
5. **Balance payment** once the order reaches `DELIVERED`/`PICKED_UP`, the
   balance becomes payable → `BALANCE_PAID` → `COMPLETED`

Totals, commitment and balance amounts are always displayed from the server
(`checkout preview` and `GET /api/orders/:id/payment`) — never client-calculated.

## Languages

UI strings are centralized in `LanguageContext` for **English (en)**,
**Luganda (lg)**, **Kiswahili (sw)** and **French (fr)**. Product and category
names are requested from the backend with `?lang=<code>`; the backend falls
back per-translation, so missing translations degrade gracefully.

## Currency

All money is integer UGX rendered through `formatUGX()` (`UGX 10,000`).
No floating-point financial math happens in the frontend.

## Development commands

```bash
npm install
npm start          # dev server on :3000 (proxy configured to :4000)
npm test           # Jest + React Testing Library
npm run build      # production build
```

The backend must be running for real data (`cd ../backend && npm run dev`).
