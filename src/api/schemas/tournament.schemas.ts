import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

const playerSchema = z.object({
  displayName: z.string().min(1).max(50).openapi({ example: "Emeka" }),
  userId: z.string().uuid().optional().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "Optional — link to a registered user",
  }),
  seed: z.number().int().min(1).optional().openapi({
    example: 1,
    description: "Manual seeding. Lower seed = better ranked",
  }),
});

export const createTournamentBodySchema = z
  .object({
    title: z.string().min(3).max(100).openapi({
      example: "iMessage 8-Ball Pool — 5 Man Tournament",
    }),
    players: z
      .array(playerSchema)
      .min(2)
      .max(32)
      .openapi({ description: "2–32 players" }),
    autoGenerateBracket: z.boolean().default(true).openapi({
      description:
        "true = random bracket. false = use seed values for seeded bracket.",
    }),
  })
  .openapi("CreateTournamentBody");

export const recordMatchResultBodySchema = z
  .object({
    winnerId: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
      description: "participantId of the winner",
    }),
  })
  .openapi("RecordMatchResultBody");

const matchSchema = z.object({
  id: z.string().uuid(),
  round: z.number().openapi({ example: 1 }),
  matchNumber: z.number().openapi({ example: 1 }),
  player1Name: z.string().nullable(),
  player2Name: z.string().nullable(),
  player1Id: z.string().nullable(),
  player2Id: z.string().nullable(),
  winnerId: z.string().nullable(),
  isBye: z.boolean(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
});

export const tournamentResponseSchema = successResponse(
  z.object({
    tournamentId: z.string().uuid(),
    title: z.string(),
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
    bracketType: z.string(),
    rounds: z.array(
      z.object({
        round: z.number(),
        matches: z.array(matchSchema),
      }),
    ),
  }),
).openapi("TournamentResponse");

export const createTournamentResponseSchema = successResponse(
  z.object({
    tournamentId: z.string().uuid(),
    matches: z.array(
      z.object({
        round: z.number(),
        matchNumber: z.number(),
        player1Name: z.string().nullable(),
        player2Name: z.string().nullable(),
        isBye: z.boolean(),
      }),
    ),
  }),
).openapi("CreateTournamentResponse");

export const recordMatchResultResponseSchema = successResponse(
  z.object({
    advancedTo: z.string().uuid().nullable().openapi({
      description: "ID of the next-round match created, if any",
    }),
  }),
).openapi("RecordMatchResultResponse");

export { errorResponse };