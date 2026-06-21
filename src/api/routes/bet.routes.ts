import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { ChallengeRepository } from "@infrastructure/db/repositories/ChallengeRepository";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { CreateBetUseCase } from "@application/bet/CreateBetUseCase";
import { PlaceBetEntryUseCase } from "@application/bet/PlaceBetEntryUseCase";
import { SettleBetUseCase } from "@application/bet/SettleBetUseCase";
import type { AppEnv } from "@api/types";
import { db } from "@infrastructure/db/client";
import { challengeBets, betEntries } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import {
  createBetBodySchema,
  placeBetEntryBodySchema,
  settleBetBodySchema,
  betDetailsResponseSchema,
  betEntryResponseSchema,
  settleBetResponseSchema,
  errorResponse,
} from "@api/schemas/bet.schemas";

const challengeRepo = new ChallengeRepository();
const walletRepo = new WalletRepository();
const createBetUseCase = new CreateBetUseCase(challengeRepo);
const placeBetEntryUseCase = new PlaceBetEntryUseCase(walletRepo);
const settleBetUseCase = new SettleBetUseCase(walletRepo);

const betRoutes = new OpenAPIHono<AppEnv>();
betRoutes.use("*", requireAuth);

// ── POST /bets/challenges/:challengeId ────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "post",
    path: "/challenges/:challengeId",
    tags: ["Bets"],
    summary: "Create a bet pool for a challenge",
    description:
      "Only the challenge creator can attach a bet. Sets the entry fee, participant limits, creator cut (max 20%), and the no-winner policy. The bet stays OPEN until the challenge is settled.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        challengeId: z.string().uuid().openapi({
          example: "550e8400-e29b-41d4-a716-446655440000",
        }),
      }),
      body: {
        content: { "application/json": { schema: createBetBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: successResponse(
              z.object({ betId: z.string().uuid() }),
            ),
          },
        },
        description: "Bet created",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation error",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not the challenge creator",
      },
    },
  }),
  async (c) => {
    const { challengeId } = c.req.valid("param");
    const body = c.req.valid("json");
    const creatorId = c.get("userId");

    const result = await createBetUseCase.execute({
      challengeId,
      creatorId,
      ...body,
    });

    if (!result.success) {
      if (result.error.includes("creator")) {
        return c.json({ success: false as const, error: result.error }, 403);
      }
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 201);
  },
);

// ── GET /bets/:betId ──────────────────────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:betId",
    tags: ["Bets"],
    summary: "Get bet details",
    description:
      "Returns the bet configuration, current pot size, entry count, and status.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ betId: z.string().uuid() }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: betDetailsResponseSchema } },
        description: "Bet details",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Bet not found",
      },
    },
  }),
  async (c) => {
    const { betId } = c.req.valid("param");

    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.id, betId))
      .limit(1);

    if (!bet[0]) {
      return c.json({ success: false as const, error: "Bet not found" }, 404);
    }

    const entries = await db
      .select()
      .from(betEntries)
      .where(eq(betEntries.betId, betId));

    return c.json({
      success: true as const,
      data: {
        id: bet[0].id,
        challengeId: bet[0].challengeId,
        entryFeeKobo: Number(bet[0].entryFeeKobo),
        potKobo: Number(bet[0].potKobo),
        minBettors: bet[0].minBettors,
        maxBettors: bet[0].maxBettors,
        currentEntries: entries.length,
        creatorCutPercent: bet[0].creatorCutPercent,
        noWinnerPolicy: bet[0].noWinnerPolicy,
        status: bet[0].status,
      },
    }, 200);
  },
);

// ── GET /bets/challenges/:challengeId ─────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "get",
    path: "/challenges/:challengeId",
    tags: ["Bets"],
    summary: "Get bet for a challenge",
    description: "Looks up the bet attached to a specific challenge, if any.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ challengeId: z.string().uuid() }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: betDetailsResponseSchema } },
        description: "Bet details",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "No bet found for this challenge",
      },
    },
  }),
  async (c) => {
    const { challengeId } = c.req.valid("param");

    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.challengeId, challengeId))
      .limit(1);

    if (!bet[0]) {
      return c.json({ success: false as const, error: "Bet not found" }, 404);
    }

    const entries = await db
      .select()
      .from(betEntries)
      .where(eq(betEntries.betId, bet[0].id));

    return c.json({
      success: true as const,
      data: {
        id: bet[0].id,
        challengeId: bet[0].challengeId,
        entryFeeKobo: Number(bet[0].entryFeeKobo),
        potKobo: Number(bet[0].potKobo),
        minBettors: bet[0].minBettors,
        maxBettors: bet[0].maxBettors,
        currentEntries: entries.length,
        creatorCutPercent: bet[0].creatorCutPercent,
        noWinnerPolicy: bet[0].noWinnerPolicy,
        status: bet[0].status,
      },
    }, 200);
  },
);

// ── POST /bets/:betId/entries ─────────────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "post",
    path: "/:betId/entries",
    tags: ["Bets"],
    summary: "Place a bet entry",
    description:
      "Submit your predictions and pay the entry fee. Predictions must be unique — if your exact combination has already been taken, you will need to pick differently. One entry per user per bet.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ betId: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: placeBetEntryBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: betEntryResponseSchema } },
        description: "Entry placed",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Duplicate prediction, full bet, or insufficient funds",
      },
    },
  }),
  async (c) => {
    const { betId } = c.req.valid("param");
    const { predictions } = c.req.valid("json");
    const bettorId = c.get("userId");

    const result = await placeBetEntryUseCase.execute({
      betId,
      bettorId,
      predictions,
    });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.id, betId))
      .limit(1);

    return c.json({
      success: true as const,
      data: {
        entryId: result.value.entryId,
        betId,
        predictions,
        status: "ACTIVE" as const,
        entryFeeKobo: Number(bet[0]?.entryFeeKobo ?? 0),
      },
    }, 201);
  },
);

// ── GET /bets/:betId/entries ──────────────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:betId/entries",
    tags: ["Bets"],
    summary: "List all entries for a bet",
    description:
      "Returns all bettors and their predictions. Useful for the challenge creator to see participation before settling.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ betId: z.string().uuid() }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: successResponse(
              z.object({
                entries: z.array(
                  z.object({
                    id: z.string(),
                    bettorId: z.string(),
                    predictions: z.array(
                      z.object({
                        matchId: z.string(),
                        predictedWinnerId: z.string(),
                      }),
                    ),
                    status: z.string(),
                    createdAt: z.string(),
                  }),
                ),
                total: z.number(),
              }),
            ),
          },
        },
        description: "All entries",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Bet not found",
      },
    },
  }),
  async (c) => {
    const { betId } = c.req.valid("param");

    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.id, betId))
      .limit(1);

    if (!bet[0]) {
      return c.json({ success: false as const, error: "Bet not found" }, 404);
    }

    const entries = await db
      .select()
      .from(betEntries)
      .where(eq(betEntries.betId, betId));

    return c.json({
      success: true as const,
      data: {
        entries: entries.map((e) => ({
          id: e.id,
          bettorId: e.bettorId,
          predictions: JSON.parse(e.prediction),
          status: e.status,
          createdAt: e.createdAt.toISOString(),
        })),
        total: entries.length,
      },
    }, 200);
  },
);

// ── GET /bets/:betId/my-entry ─────────────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:betId/my-entry",
    tags: ["Bets"],
    summary: "Get your entry for a bet",
    description: "Returns your own entry and predictions for a specific bet.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ betId: z.string().uuid() }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: betEntryResponseSchema } },
        description: "Your entry",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "You have not entered this bet",
      },
    },
  }),
  async (c) => {
    const { betId } = c.req.valid("param");
    const bettorId = c.get("userId");

    const [entry, bet] = await Promise.all([
      db
        .select()
        .from(betEntries)
        .where(eq(betEntries.betId, betId))
        .limit(100)
        .then((rows) => rows.find((r) => r.bettorId === bettorId)),
      db
        .select()
        .from(challengeBets)
        .where(eq(challengeBets.id, betId))
        .limit(1),
    ]);

    if (!entry) {
      return c.json({ success: false as const, error: "Bet entry not found" }, 404);
    }

    return c.json({
      success: true as const,
      data: {
        entryId: entry.id,
        betId,
        predictions: JSON.parse(entry.prediction),
        status: entry.status,
        entryFeeKobo: Number(bet[0]?.entryFeeKobo ?? 0),
      },
    }, 200);
  },
);

// ── POST /bets/:betId/settle ──────────────────────────────────────────────────
betRoutes.openapi(
  createRoute({
    method: "post",
    path: "/:betId/settle",
    tags: ["Bets"],
    summary: "Settle the bet",
    description:
      "Only the challenge creator can settle. Provide the actual match results. The system scores every entry, applies the no-winner policy, and pays out automatically. Creator cut and platform fee are deducted before payout.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ betId: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: settleBetBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: settleBetResponseSchema } },
        description: "Bet settled",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Already settled or invalid results",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not the challenge creator",
      },
    },
  }),
  async (c) => {
    const { betId } = c.req.valid("param");
    const { actualResults } = c.req.valid("json");
    const requesterId = c.get("userId");

    const result = await settleBetUseCase.execute({
      betId,
      actualResults,
      requesterId,
    });

    if (!result.success) {
      if (result.error.includes("creator")) {
        return c.json({ success: false as const, error: result.error }, 403);
      }
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

function successResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ success: z.literal(true), data: schema });
}

export { betRoutes };