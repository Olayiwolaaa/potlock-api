# Environment variables — corrections

Your committed `.env.example` is **missing several variables that `src/config/env.ts` requires**. That file validates `process.env` with Zod on boot and calls `process.exit(1)` if anything is missing or malformed — so the API **will not start** without them. This file lists exactly what the schema demands.

## Complete, corrected `.env.example`

```dotenv
# ── App ──────────────────────────────────────────────────────
APP_ENV=development                 # development | staging | production
APP_URL=http://localhost:3000       # used as the OpenAPI server URL (was missing)
PORT=3000

# ── CORS (all have defaults in env.ts, but document them) ────
CORS_ALLOWED_ORIGINS=http://localhost:3001,https://potlock.vercel.app
CORS_ALLOWED_METHODS=GET, POST, PUT, DELETE, OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization
CORS_ALLOW_CREDENTIALS=false        # "true" | "false"
CORS_MAX_AGE=86400

# ── Database ─────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root
POSTGRES_DB=potlockng
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET=your-secret-here         # min 32 chars (enforced by env schema)

# ── Paystack ─────────────────────────────────────────────────
PAYSTACK_BASE_URL=https://api.paystack.co   # (was missing)
PAYSTACK_SECRET_KEY=sk_test_xxx             # must start with "sk_"
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_WEBHOOK_SECRET=your-webhook-secret

# ── Pusher ───────────────────────────────────────────────────
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
PUSHER_CLUSTER=mt1

# ── Cloudinary ───────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Google OAuth 2.0 ─────────────────────────────────────────
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# ── Email (Resend) — REQUIRED, all were missing ──────────────
RESEND_API_KEY=re_xxx               # must start with "re_"
EMAIL_FROM=noreply@yourdomain.com   # must be a valid email
FEEDBACK_TO_EMAIL=team@yourdomain.com   # where feedback submissions are sent
```

## What was missing / wrong in the current file

| Variable | Status in committed `.env.example` | Reality per `env.ts` |
|---|---|---|
| `APP_URL` | missing | used for OpenAPI `servers` URL; defaults to `http://localhost:3000` |
| `PAYSTACK_BASE_URL` | missing | defaults to `https://api.paystack.co` |
| `CORS_ALLOWED_ORIGINS` | missing | has default incl. `https://potlock.vercel.app` |
| `CORS_ALLOWED_METHODS` | missing | has default |
| `CORS_ALLOWED_HEADERS` | missing | has default |
| `CORS_ALLOW_CREDENTIALS` | missing | `"true"`/`"false"`, default `false` |
| `CORS_MAX_AGE` | missing | default `86400` |
| `RESEND_API_KEY` | missing (noted only) | **required**, must start with `re_` |
| `EMAIL_FROM` | missing | **required**, valid email |
| `FEEDBACK_TO_EMAIL` | missing | **required**, valid email |

The three email variables have **no defaults** and are strictly validated, so a fresh clone following the current `.env.example` will fail to boot with `Invalid environment variables`. This is the single most important fix.

## Validation rules enforced on boot (`env.ts`)

- `JWT_SECRET` — minimum 32 characters.
- `PAYSTACK_SECRET_KEY` — must start with `sk_`.
- `RESEND_API_KEY` — must start with `re_`.
- `EMAIL_FROM`, `FEEDBACK_TO_EMAIL` — must be valid emails.
- `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `PAYSTACK_BASE_URL` — must be valid URLs.
- Missing/invalid values → the process logs the field errors and exits with code 1.
