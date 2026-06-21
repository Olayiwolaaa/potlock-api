import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { ChallengeRepository } from "@infrastructure/db/repositories/ChallengeRepository";
import { CreateTournamentUseCase } from "@application/tournament/CreateTournamentUseCase";
import { RecordMatchResultUseCase } from "@application/tournament/RecordMatchResultUseCase";
import type { AppEnv } from "@api/types";
import { db } from "@infrastructure/db/client";
import {
  tournaments,
  tournamentMatches,
  tournamentParticipants,
} from "@infrastructure/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  createTournamentBodySchema,
  createTournamentResponseSchema,
  recordMatchResultBodySchema,
  recordMatchResultResponseSchema,
  tournamentResponseSchema,
  errorResponse,
} from "@api/schemas/tournament.schemas";

const challengeRepo = new ChallengeRepository();
const createTournamentUseCase = new CreateTournamentUseCase(challengeRepo);
const recordMatchResultUseCase = new RecordMatchResultUseCase();

const tournamentRoutes = new OpenAPIHono<AppEnv>();
tournamentRoutes.use("*", requireAuth);

// ── POST /tournaments/challenges/:challengeId ─────────────────────────────────
tournamentRoutes.openapi(
  createRoute({
    method: "post",
    path: "/challenges/:challengeId",
    tags: ["Tournaments"],
    summary: "Create a tournament for a challenge",
    description:
      "Sets up players and generates the bracket. Use autoGenerateBracket=true for a randomized draw or false to use seed values for a seeded bracket. Supports 2–32 players.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        challengeId: z.string().uuid().openapi({
          example: "550e8400-e29b-41d4-a716-446655440000",
        }),
      }),
      body: {
        content: { "application/json": { schema: createTournamentBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: createTournamentResponseSchema },
        },
        description: "Tournament created with bracket",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation error or insufficient players",
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

    const result = await createTournamentUseCase.execute({
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

// ── GET /tournaments/:tournamentId ────────────────────────────────────────────
tournamentRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:tournamentId",
    tags: ["Tournaments"],
    summary: "Get full tournament bracket",
    description:
      "Returns the tournament with all rounds and matches, grouped by round. Match status shows which games are pending, in progress, or completed.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        tournamentId: z.string().uuid().openapi({
          example: "550e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: tournamentResponseSchema },
        },
        description: "Tournament bracket",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Tournament not found",
      },
    },
  }),
  async (c) => {
    const { tournamentId } = c.req.valid("param");

    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament[0]) {
      return c.json({ success: false as const, error: "Tournament not found" }, 404);
    }

    const [matches, participants] = await Promise.all([
      db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, tournamentId))
        .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.matchNumber)),
      db
        .select()
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, tournamentId)),
    ]);

    const nameMap = new Map(participants.map((p) => [p.id, p.displayName]));

    const roundMap = new Map<number, typeof matches>();
    for (const match of matches) {
      const existing = roundMap.get(match.round) ?? [];
      existing.push(match);
      roundMap.set(match.round, existing);
    }

    const rounds = Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, roundMatches]) => ({
        round,
        matches: roundMatches.map((m) => ({
          id: m.id,
          round: m.round,
          matchNumber: m.matchNumber,
          player1Name: m.player1Id ? (nameMap.get(m.player1Id) ?? null) : null,
          player2Name: m.player2Id ? (nameMap.get(m.player2Id) ?? null) : null,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
          winnerId: m.winnerId,
          isBye: m.isBye,
          status: m.status,
        })),
      }));

    return c.json({
      success: true as const,
      data: {
        tournamentId: tournament[0].id,
        title: tournament[0].title,
        status: tournament[0].status,
        bracketType: tournament[0].bracketType,
        rounds,
      },
    }, 200);
  },
);

// ── POST /tournaments/:tournamentId/matches/:matchId/result ───────────────────
tournamentRoutes.openapi(
  createRoute({
    method: "post",
    path: "/:tournamentId/matches/:matchId/result",
    tags: ["Tournaments"],
    summary: "Record a match result",
    description:
      "Only the challenge creator can record results. When both matches feeding into a next-round slot are complete, the next round match is automatically created and its ID is returned in advancedTo.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        tournamentId: z.string().uuid(),
        matchId: z.string().uuid(),
      }),
      body: {
        content: {
          "application/json": { schema: recordMatchResultBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: recordMatchResultResponseSchema },
        },
        description: "Result recorded",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Invalid winner or match already complete",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not the challenge creator",
      },
    },
  }),
  async (c) => {
    const { tournamentId, matchId } = c.req.valid("param");
    const { winnerId } = c.req.valid("json");
    const requesterId = c.get("userId");

    const result = await recordMatchResultUseCase.execute({
      tournamentId,
      matchId,
      winnerId,
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

// ── PATCH /tournaments/:tournamentId/status ───────────────────────────────────
tournamentRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/:tournamentId/status",
    tags: ["Tournaments"],
    summary: "Update tournament status",
    description: "Move tournament from DRAFT → ACTIVE → COMPLETED. Only challenge creator can do this.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ tournamentId: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                status: z.enum(["ACTIVE", "COMPLETED"]).openapi({
                  description: "DRAFT is the starting state and cannot be set manually",
                }),
              })
              .openapi("UpdateTournamentStatusBody"),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: successResponse(z.object({ status: z.string() })),
          },
        },
        description: "Status updated",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not the challenge creator",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Tournament not found",
      },
    },
  }),
  async (c) => {
    const { tournamentId } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const requesterId = c.get("userId");

    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament[0]) {
      return c.json({ success: false as const, error: "Tournament not found" }, 404);
    }

    const { challenges } = await import("@infrastructure/db/schema");
    const challenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, tournament[0].challengeId))
      .limit(1);

    if (challenge[0]?.creatorId !== requesterId) {
      return c.json(
        { success: false as const, error: "Only the challenge creator can update tournament status" },
        403,
      );
    }

    await db
      .update(tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    return c.json({ success: true as const, data: { status } }, 200);
  },
);

function successResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ success: z.literal(true), data: schema });
}

export { tournamentRoutes };