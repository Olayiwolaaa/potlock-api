import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { errorHandler } from "@api/middleware/errorHandler";
import { requestId } from "@api/middleware/requestId";
import { sanitizeBody } from "@api/middleware/sanitize";
import {
  apiRateLimit,
  authRateLimit,
  paymentRateLimit,
} from "./middleware/rateLimiter";
import { authRoutes } from "@api/routes/auth.routes";
import { walletRoutes } from "@api/routes/wallet.routes";
import { webhookRoutes } from "@api/routes/webhook.routes";
import { challengeRoutes } from "@api/routes/challenge.routes";
import { env } from "@config/env";
import { kycRoutes } from "@api/routes/kyc.routes";
import { tournamentRoutes } from "@api/routes/tournament.routes";
import { betRoutes } from "@api/routes/bet.routes";

export function createApp() {
  const app = new OpenAPIHono();

  // ── Security & Observability ──────────────────────────────
  app.use("*", requestId);
  app.use("*", secureHeaders());
  app.use("*", errorHandler());
  app.use(
    "*",
    cors({
      origin: env.APP_ENV === "production" ? "https://potlockng.com" : "*",
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use("*", sanitizeBody);

  // ── Health ────────────────────────────────────────────────
  app.get("/health", (c) =>
    c.json({ status: "ok", env: env.APP_ENV, ts: Date.now() }),
  );

  // ── Routes with targeted rate limits ─────────────────────
  app.use("/api/v1/auth/*", authRateLimit);
  app.use("/api/v1/wallet/fund", paymentRateLimit);
  app.use("/api/v1/wallet/withdraw", paymentRateLimit);
  app.use("/api/v1/*", apiRateLimit);

  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1/wallet", walletRoutes);
  app.route("/api/v1/challenges", challengeRoutes);
  app.route("/webhooks", webhookRoutes);

  app.route("/api/v1/kyc", kycRoutes);
  app.route("/api/v1/tournaments", tournamentRoutes);
  app.route("/api/v1/bets", betRoutes);

  // ── Docs (non-production only) ────────────────────────────
  if (env.APP_ENV !== "production") {
    app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Paste your JWT from POST /api/v1/auth/login",
    });

    app.doc("/openapi.json", {
      openapi: "3.0.0",
      info: {
        title: "PotLockNg API",
        version: "1.0.0",
        description:
          "Social wagering escrow engine for the Nigerian creator economy",
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: "Local" }],
      tags: [
        { name: "Auth", description: "Registration and login" },
        { name: "Wallet", description: "Funding, withdrawals, history" },
        { name: "Challenges", description: "Create, join, settle" },
      ],
    });

    app.get("/docs", Scalar({ theme: "saturn", url: "/openapi.json" }));
  }

  app.notFound((c) =>
    c.json({ success: false as const, error: "Route not found" }, 404),
  );

  return app;
}
