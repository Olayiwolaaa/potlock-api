# Architecture

PotLockNg API is a **Bun + Hono** service organized in a **clean/layered architecture**: HTTP concerns, application use cases, domain models, and infrastructure adapters are separated so business rules don't depend on frameworks or external services.

## Layers

```
src/
├── api/            # HTTP layer — Hono routes, middleware, Zod schemas, validators
├── application/    # Use cases — orchestrate domain + infrastructure (one class per action)
├── domain/         # Pure business models: Result type, Money, DomainError, entities
├── infrastructure/ # Adapters to the outside world: DB, cache, payment, realtime, storage, email, auth
└── config/         # env.ts — Zod-validated environment contract
```

The dependency direction points inward: `api` → `application` → `domain`, with `infrastructure` implementing interfaces the inner layers define. Routes construct use cases and inject repositories/services (see `feedback.routes.ts`, which wires `FeedbackRepository` + `ResendEmailService` into `SubmitFeedbackUseCase`).

## Request lifecycle

`main.ts` boots the server; `src/api/app.ts` assembles the Hono app. Global middleware runs in this order on every request:

1. `requestId` — attaches a correlation ID (for logging/tracing).
2. `secureHeaders()` — Hono security headers.
3. `errorHandler()` — catches thrown errors and formats a consistent JSON error envelope.
4. `cors(...)` — configured entirely from `CORS_*` env vars (origins, methods, headers, credentials, max-age).
5. `sanitizeBody` — input sanitization.

Then **targeted rate limits** apply before the routers:

- `authRateLimit` on `/api/v1/auth/*`
- `paymentRateLimit` on `/api/v1/wallet/fund` and `/api/v1/wallet/withdraw`
- `apiRateLimit` on everything else under `/api/v1/*`

Routers are mounted as:

| Mount | Router |
|---|---|
| `/api/v1/auth` | `authRoutes` |
| `/api/v1/users` | `userRoutes` |
| `/api/v1/games` | `gameRoutes` |
| `/api/v1/wallet` | `walletRoutes` |
| `/api/v1/challenges` | `challengeRoutes` |
| `/api/v1/kyc` | `kycRoutes` |
| `/api/v1/tournaments` | `tournamentRoutes` |
| `/api/v1/bets` | `betRoutes` |
| `/api/v1/feedback` | `feedbackRoutes` |
| `/api/v1/notifications` | `notificationRoutes` |
| `/webhooks` | `webhookRoutes` |
| `/pusher` | `pusherRoutes` |

Plus `GET /health` and the OpenAPI surface (`/openapi.json` + Scalar UI at `/docs`).

## Response envelope

Responses use a discriminated union: `{ success: true, data }` or `{ success: false, error }`. The 404 handler returns `{ success: false, error: "Route not found" }`. Domain results flow through a `Result` type (`domain/shared`) so use cases return success/failure explicitly rather than throwing for expected errors.

## OpenAPI & the generated frontend client

The app is built on `@hono/zod-openapi`: every route declares its Zod request/response schemas via `createRoute`, and Hono derives the OpenAPI document at `/openapi.json`. The **frontend (`potlockng`) generates its typed client from this exact document** — so route/schema changes here propagate to the frontend via its `bun run generate-client`. Keep schemas accurate; they are the contract.

A `bearerAuth` security scheme (HTTP bearer, JWT) is registered globally. Protected routes declare `security: [{ bearerAuth: [] }]` and sit behind the `requireAuth` middleware; admin-only actions (e.g. `GET /api/v1/feedback`) additionally call `requireAdmin`.

## Authentication

- **JWT via jose.** Login/register/Google endpoints issue a token; `requireAuth` verifies it and sets `userId` on the context (`c.get("userId")`).
- **Google OAuth** exchanges a Google ID token for a platform session (`infrastructure/auth/GoogleOAuthService`).

## Realtime (Pusher)

`POST /pusher/auth` (behind `requireAuth`) authorizes channel subscriptions. Authorization rules in `pusher.routes.ts`:

- A user may subscribe only to their **own** private channel `private-user.{userId}`.
- Presence channels (`presence-*`) are currently allowed for any authenticated user — the code notes that production should verify challenge/bet participation here. **This is a known TODO worth tightening.**

Server-side events are emitted through `infrastructure/realtime/PusherAdapter`. The event-name list there must stay in sync with the frontend's `NotificationEvents` (there's no shared package between the repos).

## Money & escrow

Wagers move into escrow on join and settle to the winner on result declaration. Amounts are integer minor units (kobo). The revenue model (3% standard wager fee, 5% on sponsorship injections, flat ₦50 withdrawal fee) is applied at settlement/payout.

## Persistence

- **PostgreSQL** via `postgres.js` / Neon serverless, with **Drizzle ORM**.
- Schema and migrations live in `infrastructure/db`. Manage with the `db:*` scripts (`generate`, `migrate`, `push`, `studio`, `seed`).
- **Redis** (ioredis) backs caching and rate limiting.

## External services

| Concern | Adapter | Service |
|---|---|---|
| Payments | `infrastructure/payment` | Paystack |
| Realtime | `infrastructure/realtime` | Pusher |
| File storage | `infrastructure/storage` | Cloudinary |
| Email | `infrastructure/email` | Resend |
| Auth tokens | `infrastructure/auth` | jose (JWT) + Google OAuth |
| Logging | `infrastructure/logger` | Pino |

## Things to watch

- **Env is a hard gate.** `config/env.ts` exits the process on any missing/invalid variable. See `docs/ENV.md` — the committed `.env.example` is incomplete.
- **Presence-channel authorization is permissive** (see above).
- **Two repos, one contract.** Event names and the OpenAPI schema are the coupling points with the frontend; there's no shared package, so changes must be mirrored deliberately.
