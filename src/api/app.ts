import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { authRoutes } from "./routes/auth.routes";
import { walletRoutes } from "./routes/wallet.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { env } from "@config/env";
import { challengeRoutes } from "./routes/challenge.routes";

export function createApp() {
  const app = new OpenAPIHono();

  // Global middleware
  app.use("*", errorHandler());
  app.use("*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

  // Routes
  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1/wallet", walletRoutes);
  app.route("/webhooks", webhookRoutes);
  app.route("/api/v1/challenges", challengeRoutes);

  // Only expose docs in non-production environments
  if (env.APP_ENV !== "production") {
    // Generates the raw OpenAPI JSON spec
    app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Paste your JWT token from /api/v1/auth/login",
    });

    app.doc("/openapi.json", {
      openapi: "3.0.0",
      info: {
        title: "PotLockNg API",
        version: "1.0.0",
        description:
          "Social wagering escrow engine for the Nigerian creator economy",
        contact: {
          name: "PotLockNg",
        },
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: "Local" }],
      tags: [
        { name: "Auth", description: "Registration and login" },
        { name: "Wallet", description: "Internal wallet management" },
        {
          name: "Challenges",
          description: "Challenge creation and participation",
        },
        {
          name: "Settlements",
          description: "Challenge resolution and payouts",
        },
      ],
    });

    // Renders the interactive Scalar UI
    app.get(
      "/docs",
      Scalar({
        url: "/openapi.json",
        theme: "saturn",
      }),
    );
  }

  app.notFound((c) =>
    c.json({ success: false, error: "Route not found" }, 404),
  );

  return app;
}
