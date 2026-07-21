# API endpoint corrections

The README's endpoint tables are mostly accurate, but three sections were marked "inferred — verify" and one was incomplete. Here are the **verified** routes read directly from the route files. Apply these edits to the README.

## Notifications — corrected

The README guessed `GET /api/v1/notifications` and `PATCH /api/v1/notifications/:id/read`. The actual routes (`notification.routes.ts`, all behind `requireAuth`):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/notifications` | List current user's notifications (query: `limit`, `offset`, `unreadOnly`); returns `items`, `unreadCount`, `total` |
| `POST` | `/api/v1/notifications/:id/read` | Mark a single notification read |
| `POST` | `/api/v1/notifications/read-all` | Mark all notifications read (bell "clear all") |

Differences from the README: the mark-read verb is **`POST`, not `PATCH`**, and there's a **third route** (`/read-all`) that wasn't listed.

## Feedback — corrected

The README listed only `POST /api/v1/feedback`. There are **two** routes (`feedback.routes.ts`):

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/feedback` | any authed user | Submit feedback (`message`, `rating` 1–5); emails `FEEDBACK_TO_EMAIL` via Resend; returns `201 { id }` |
| `GET` | `/api/v1/feedback` | **admin only** (`requireAdmin`) | List submitted feedback, optional `rating` filter |

The admin list route was missing from the README.

## Pusher — confirmed

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/pusher/auth` | `requireAuth` (JWT) | Authorizes a Pusher channel subscription. Allows only `private-user.{userId}` and `presence-*` channels; returns the signed Pusher auth token. |

The "inferred" tag can be removed. Note the authorization caveat: presence channels are open to any authenticated user (documented as a production TODO in the code).

## Everything else

The Auth, Users, Wallet, Challenges, Bets, Tournaments, KYC, webhook, `/health`, and `/docs` tables match the mounted routers in `app.ts` and can stay as-is. Suggested cleanup:

- Remove all "_(inferred — verify)_" annotations now that they're confirmed.
- Under **Other**, note that `/docs` (Scalar UI) and `/openapi.json` are currently registered unconditionally — the `if (env.APP_ENV !== "production")` guard around them is **commented out** in `app.ts`. The README says "non-production," but as written the docs are exposed in every environment. Either re-enable the guard or update the README to match reality. (Flagging as a security consideration — exposing the full API schema in production may or may not be intended.)
