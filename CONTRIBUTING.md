# Contributing to PotLock API

## Local setup

Prerequisites: [Bun](https://bun.sh) v1+, Docker & Docker Compose.

```bash
git clone https://github.com/Olayiwolaaa/potlock-api.git
cd potlock-api
bun install
cp .env.example .env          # then fill in ALL values — see docs/ENV.md
docker compose up postgres redis -d
bun run db:push               # push schema to the dev DB
bun run dev                   # hot-reload server at http://localhost:3000
```

> The server validates env vars on boot and exits if any required one is missing or malformed. The committed `.env.example` is incomplete — use the corrected list in [`docs/ENV.md`](./ENV.md), especially the three required `RESEND_*` / email variables.

Full stack via Docker: `docker compose up -d`, then `docker compose logs -f api`.

## Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | Dev server, hot reload (`--watch`) |
| `bun run start` | Run `src/main.ts` directly |
| `bun run build` | Minified build to `dist/` |
| `bun test` | Run tests |
| `bun run db:generate` | Generate Drizzle migrations from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:push` | Push schema directly (dev only) |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:seed` | Seed the database |

## Branch & PR workflow

- `main` is the source of truth; `dev` is the integration branch for features. PRs merge `dev` → `main` (history shows PRs #6–#21).
- Branch off `dev`, open a PR back into `dev`.
- **CI runs on merge** (`.github/workflows`) and the latest `main` deployment shows a failure — check the Actions tab and get the pipeline green before relying on a deploy.

## Commit messages

Conventional Commits with scopes, matching the existing history:

- `feat(challenge): ...`, `feat(web): ...`, `feat: add email service and feedback module`
- `fix: resolve all TypeScript strict typing errors`
- `chore: update env example and docker-compose config`

## Conventions

- **Layered architecture.** Keep HTTP concerns in `api/`, orchestration in `application/` (one use case per action), business rules in `domain/`, and all external-service code in `infrastructure/`. Routes wire use cases and inject repositories/services — don't call the DB or third-party SDKs directly from a route handler.
- **Every route declares Zod schemas** via `@hono/zod-openapi` `createRoute`. This is what generates `/openapi.json` and, downstream, the frontend's typed client. Adding an endpoint without schemas breaks that contract.
- **Auth:** put protected routes behind `requireAuth`; admin actions behind `requireAdmin`. Declare `security: [{ bearerAuth: [] }]` on the route.
- **Response envelope:** always return `{ success: true, data }` or `{ success: false, error }`. Use the domain `Result` type for expected failures instead of throwing.
- **Money in kobo** (integer minor units). Never use floating-point Naira.
- **Realtime event names** in `infrastructure/realtime/PusherAdapter` must be mirrored in the frontend's `NotificationEvents` list — there's no shared package.
- **After schema changes:** run `bun run db:generate` and commit the migration; don't rely on `db:push` for anything but local dev.

## When you change the API contract

Changing a route path, method, or schema affects the frontend, which generates its client from `/openapi.json`. After merging, regenerate the frontend client (`bun run generate-client` in `potlock`) and commit the result there.

## Known TODOs worth addressing

- **Presence-channel authorization** in `pusher.routes.ts` allows any authenticated user; production should verify challenge/bet participation.
- **`/docs` and `/openapi.json` are exposed unconditionally** — the non-production guard in `app.ts` is commented out. Decide whether the schema should be public in production.
