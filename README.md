# PotLockNg API

The backend API for PotLockNg — a wagering and escrow engine for the Nigerian content creator economy.

PotLockNg lets TikTok streamers, iMessage gamers, and tournament organizers create secure "Challenge Vaults" where participants lock in wagers and sponsors boost prize pools. Funds move into escrow, removing trust-based payment risk between players.

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

## Project Structure

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
├── config/               # Environment validation
├── domain/               # Domain models, interfaces, value objects
│   ├── challenge/
│   ├── shared/           # Result type, Money, DomainError
│   ├── user/
│   └── wallet/
├── infrastructure/       # External services
│   ├── auth/             # TokenService, GoogleOAuthService
│   ├── cache/            # Redis client
│   ├── db/               # Drizzle schema, migrations, repositories, seed
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
git clone https://github.com/Olayiwolaaa/potlockng-api.git
cd potlockng-api
bun install
cp .env.example .env
# Fill in your actual values in .env
docker compose up postgres redis -d
bun run db:push
bun run dev
```

The API runs at `http://localhost:3000`.

### Docker (Full Stack)

```bash
docker compose up -d
docker compose logs -f api
docker compose down
```

## Environment Variables

Copy `.env.example` and fill in values:

| Variable | Description |
| --- | --- |
| `APP_ENV` | `development`, `staging`, or `production` |
| `PORT` | Server port (default: 3000) |
| `POSTGRES_USER` | Postgres user (for local Docker DB) |
| `POSTGRES_PASSWORD` | Postgres password (for local Docker DB) |
| `POSTGRES_DB` | Postgres database name |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook secret |
| `PUSHER_APP_ID` | Pusher app ID |
| `PUSHER_KEY` | Pusher key |
| `PUSHER_SECRET` | Pusher secret |
| `PUSHER_CLUSTER` | Pusher cluster (default: mt1) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `REDIS_URL` | Redis connection URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

> Note: The code depends on `resend` for transactional email. If email is enabled, add your `RESEND_API_KEY` (and any sender config) to `.env` — this key is not yet in `.env.example`.

## API Endpoints

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Create account (email + password) |
| `POST` | `/api/v1/auth/login` | Login with email + password |
| `POST` | `/api/v1/auth/google` | Sign in with Google (ID token) |

### Users

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update profile (name, avatar) |

### Wallet

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/wallet/balance` | Get wallet balance |
| `GET` | `/api/v1/wallet/transactions` | Transaction history |
| `GET` | `/api/v1/wallet/banks` | List supported banks (Paystack) |
| `POST` | `/api/v1/wallet/fund` | Initialize Paystack payment |
| `POST` | `/api/v1/wallet/withdraw` | Withdraw to bank account |

### Challenges

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/challenges` | Create a challenge |
| `GET` | `/api/v1/challenges/c/:slug` | Get challenge by link |
| `POST` | `/api/v1/challenges/c/:slug/join` | Join a challenge |
| `POST` | `/api/v1/challenges/:id/declare` | Declare winner |
| `POST` | `/api/v1/challenges/:id/cancel` | Cancel an open challenge |
| `GET` | `/api/v1/challenges/my` | List your challenges |

### Bets

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/bets` | Create a bet |
| `GET` | `/api/v1/bets/:betId` | Get bet details |
| `POST` | `/api/v1/bets/:betId/enter` | Enter a bet |
| `POST` | `/api/v1/bets/:betId/settle` | Settle a bet |

### Tournaments

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/tournaments` | Create tournament |
| `GET` | `/api/v1/tournaments/:id` | Get bracket + matches |
| `POST` | `/api/v1/tournaments/:id/matches/:matchId/result` | Submit match result |
| `PATCH` | `/api/v1/tournaments/:id/status` | Update tournament status |

### KYC

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/kyc/status` | Get KYC tier + limits |
| `POST` | `/api/v1/kyc/bvn` | Submit BVN verification (async) |

### Notifications

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/notifications` | List notifications *(inferred — verify)* |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark notification read *(inferred — verify)* |

### Feedback

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/feedback` | Submit user feedback *(inferred — verify)* |

### Other

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/webhooks/paystack` | Paystack webhook handler |
| `POST` | `/pusher/auth` | Pusher channel auth *(inferred — verify)* |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Scalar API docs (non-production) |

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

## License

Private — all rights reserved.
