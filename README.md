# PotLock API

The backend API for **PotLock** — a wagering and escrow engine for the Nigerian content creator economy.

PotLock lets TikTok streamers, iMessage gamers, and tournament organizers create secure "Challenge Vaults" where participants lock in wagers and sponsors boost prize pools. Funds move into escrow, removing trust-based payment risk between players.

- **Frontend:** [potlock](https://github.com/Olayiwolaaa/potlock) (Next.js PWA) — generates its typed client from this API's OpenAPI schema
- **API docs:** Scalar UI at `/docs`, OpenAPI JSON at `/openapi.json`
- **License:** [MIT](./LICENSE)

---

## Tech Stack

- **Runtime:** Bun
- **Framework:** Hono (OpenAPI via `@hono/zod-openapi` + `hono-openapi`)
- **Database:** PostgreSQL (postgres.js / Neon serverless) + Drizzle ORM
- **Cache:** Redis (via ioredis)
- **Auth:** JWT (jose) + Google OAuth
- **Payments:** Paystack
- **Email:** Resend
- **Real-time:** Pusher
- **File Storage:** Cloudinary
- **IDs / slugs:** nanoid
- **Docs:** Scalar API Reference
- **Logging:** Pino
- **Validation:** Zod

## Architecture

A layered / clean architecture: HTTP concerns, application use cases, domain models, and infrastructure adapters are kept separate so business rules don't depend on frameworks. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the request lifecycle, middleware order, and the OpenAPI→frontend-client contract.

```
src/
├── api/                  # HTTP layer
│   ├── middleware/       # Auth, rate limiting, error handling, sanitization
│   ├── routes/           # Route definitions (OpenAPI)
│   │                     #   auth, user, wallet, challenge, bet, game,
│   │                     #   tournament, kyc, feedback, notification,
│   │                     #   pusher, webhook
│   ├── schemas/          # Zod request/response schemas
│   ├── validators/       # Input validators
│   ├── app.ts            # Hono app assembly
│   └── types.ts
├── application/          # Use cases
│   ├── auth/             # Register, Login, Google OAuth
│   ├── bet/              # Betting logic
│   ├── challenge/        # Challenge lifecycle
│   ├── feedback/         # User feedback submission
│   ├── games/            # Game management
│   ├── kyc/              # KYC / BVN verification
│   ├── notifications/    # Persistent notification service
│   ├── tournament/       # Tournament brackets
│   ├── user/             # Profile management
│   └── wallet/           # Funding, withdrawals, banks
├── config/               # Environment validation (Zod)
├── domain/               # Domain models, interfaces, value objects
│   ├── challenge/
│   ├── shared/           # Result type, Money, DomainError
│   ├── user/
│   └── wallet/
├── infrastructure/       # External services
│   ├── auth/             # TokenService, GoogleOAuthService
│   ├── cache/            # Redis client
│   ├── db/               # Drizzle schema, migrations, repositories, seed
│   ├── email/            # Resend email service
│   ├── logger/           # Pino logger
│   ├── payment/          # Paystack integration
│   ├── realtime/         # Pusher
│   └── storage/          # Cloudinary
└── main.ts               # Entrypoint
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1+
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose

### Setup

```bash
git clone https://github.com/Olayiwolaaa/potlock-api.git
cd potlock-api
bun install
cp .env.example .env
# Fill in ALL values — see the Environment Variables section below
docker compose up postgres redis -d
bun run db:push
bun run dev
```

The API runs at `http://localhost:3000`.

> The server validates its environment on boot (`src/config/env.ts`) and **exits immediately if any required variable is missing or malformed**. Make sure every variable below is set before starting.

### Docker (Full Stack)

```bash
docker compose up -d
docker compose logs -f api
docker compose down
```

## Environment Variables

Copy `.env.example` and fill in values. Every variable below is read by `src/config/env.ts`; those without a default are **required** and the process will not start without them.

### App

| Variable | Required | Description |
|---|---|---|
| `APP_ENV` | default `development` | `development`, `staging`, or `production` |
| `APP_URL` | default `http://localhost:3000` | Base URL, used as the OpenAPI server URL |
| `PORT` | default `3000` | Server port |

### CORS

| Variable | Default | Description |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3001,https://potlock.vercel.app` | Comma-separated allowed origins |
| `CORS_ALLOWED_METHODS` | `GET, POST, PUT, DELETE, OPTIONS` | Allowed methods |
| `CORS_ALLOWED_HEADERS` | `Content-Type,Authorization` | Allowed headers |
| `CORS_ALLOW_CREDENTIALS` | `false` | `"true"` or `"false"` |
| `CORS_MAX_AGE` | `86400` | Preflight cache seconds |

### Database

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_USER` | — | Postgres user (local Docker DB) |
| `POSTGRES_PASSWORD` | — | Postgres password (local Docker DB) |
| `POSTGRES_DB` | — | Postgres database name |
| `DATABASE_URL` | **yes** | PostgreSQL connection string (valid URL) |

### Auth

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **yes** | Secret for signing JWTs (**min 32 chars**) |
| `GOOGLE_CLIENT_ID` | **yes** | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | **yes** | Google OAuth client secret |

### Paystack

| Variable | Required | Description |
|---|---|---|
| `PAYSTACK_BASE_URL` | default `https://api.paystack.co` | Paystack API base URL |
| `PAYSTACK_SECRET_KEY` | **yes** | Secret key (must start with `sk_`) |
| `PAYSTACK_PUBLIC_KEY` | — | Public key |
| `PAYSTACK_WEBHOOK_SECRET` | **yes** | Webhook signing secret |

### Pusher

| Variable | Required | Description |
|---|---|---|
| `PUSHER_APP_ID` | **yes** | Pusher app ID |
| `PUSHER_KEY` | **yes** | Pusher key |
| `PUSHER_SECRET` | **yes** | Pusher secret |
| `PUSHER_CLUSTER` | default `mt1` | Pusher cluster |

### Cloudinary

| Variable | Required | Description |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | **yes** | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | **yes** | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **yes** | Cloudinary API secret |

### Redis

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | **yes** | Redis connection URL |

### Email (Resend)

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | **yes** | Resend API key (must start with `re_`) |
| `EMAIL_FROM` | **yes** | Sender address (valid email) |
| `FEEDBACK_TO_EMAIL` | **yes** | Where feedback submissions are emailed |

> The three email variables have **no defaults** and are strictly validated. A `.env` without them will fail to boot with `Invalid environment variables`.

## API Endpoints

Interactive docs (Scalar) are served at `/docs`, backed by `/openapi.json`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Create account (email + password) |
| `POST` | `/api/v1/auth/login` | Login with email + password |
| `POST` | `/api/v1/auth/google` | Sign in with Google (ID token) |

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update profile (name, avatar) |

### Wallet

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/wallet/balance` | Get wallet balance |
| `GET` | `/api/v1/wallet/transactions` | Transaction history |
| `GET` | `/api/v1/wallet/banks` | List supported banks (Paystack) |
| `POST` | `/api/v1/wallet/fund` | Initialize Paystack payment |
| `POST` | `/api/v1/wallet/withdraw` | Withdraw to bank account |

### Challenges

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/challenges` | Create a challenge |
| `GET` | `/api/v1/challenges/c/:slug` | Get challenge by link |
| `POST` | `/api/v1/challenges/c/:slug/join` | Join a challenge |
| `POST` | `/api/v1/challenges/:id/declare` | Declare winner |
| `POST` | `/api/v1/challenges/:id/cancel` | Cancel an open challenge |
| `GET` | `/api/v1/challenges/my` | List your challenges |

### Bets

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/bets` | Create a bet |
| `GET` | `/api/v1/bets/:betId` | Get bet details |
| `POST` | `/api/v1/bets/:betId/enter` | Enter a bet |
| `POST` | `/api/v1/bets/:betId/settle` | Settle a bet |

### Tournaments

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/tournaments` | Create tournament |
| `GET` | `/api/v1/tournaments/:id` | Get bracket + matches |
| `POST` | `/api/v1/tournaments/:id/matches/:matchId/result` | Submit match result |
| `PATCH` | `/api/v1/tournaments/:id/status` | Update tournament status |

### KYC

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/kyc/status` | Get KYC tier + limits |
| `POST` | `/api/v1/kyc/bvn` | Submit BVN verification (async) |

### Notifications

All require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/notifications` | List notifications (`limit`, `offset`, `unreadOnly`); returns items + `unreadCount` + `total` |
| `POST` | `/api/v1/notifications/:id/read` | Mark a single notification read |
| `POST` | `/api/v1/notifications/read-all` | Mark all notifications read |

### Feedback

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/feedback` | any authed user | Submit feedback (`message`, `rating` 1–5); emails `FEEDBACK_TO_EMAIL` |
| `GET` | `/api/v1/feedback` | **admin only** | List submitted feedback (optional `rating` filter) |

### Other

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/paystack` | Paystack webhook handler |
| `POST` | `/pusher/auth` | Pusher channel auth (JWT; own `private-user.*` and `presence-*` channels) |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Scalar API docs |
| `GET` | `/openapi.json` | OpenAPI 3.0 document |

## Scripts

```bash
bun run dev          # Start dev server with hot reload
bun run start        # Start production server
bun run build        # Build for production (minified, to dist/)
bun test             # Run tests
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema directly (dev)
bun run db:studio    # Open Drizzle Studio
bun run db:seed      # Seed the database
```

## Revenue Model

- **Standard Wagers:** 3% platform fee on settlement
- **Sponsored Events:** 5% fee on sponsorship injections
- **Withdrawals:** Flat ₦50 processing fee per payout

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, the branch/PR workflow, commit conventions, and architectural guidelines.

## License

[MIT](./LICENSE) © 2026 Karaole Olayiwola Muizz
