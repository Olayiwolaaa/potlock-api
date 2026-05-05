import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const createBetBodySchema = z
  .object({
    entryFeeKobo: z.number().int().min(10_000).openapi({
      example: 100_000,
      description: "Entry fee per bettor in kobo. ₦1,000 = 100000",
    }),
    minBettors: z.number().int().min(2).max(1000).default(2).openapi({
      example: 2,
      description: "Minimum bettors for the bet to be valid",
    }),
    maxBettors: z.number().int().min(2).max(1000).default(100).openapi({
      example: 100,
    }),
    creatorCutPercent: z.number().int().min(0).max(20).default(10).openapi({
      example: 10,
      description: "% of prize pool the challenge creator earns. Max 20%",
    }),
    noWinnerPolicy: z
      .enum(["REFUND_ALL", "CLOSEST_WINS"])
      .default("REFUND_ALL")
      .openapi({
        description:
          "REFUND_ALL: refund everyone if no perfect prediction. CLOSEST_WINS: person with most correct picks wins.",
      }),
  })
  .openapi("CreateBetBody");

const matchPredictionSchema = z.object({
  matchId: z.string().uuid().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
  }),
  predictedWinnerId: z.string().uuid().openapi({
    example: "660e8400-e29b-41d4-a716-446655440001",
    description: "participantId of who you think wins this match",
  }),
});

export const placeBetEntryBodySchema = z
  .object({
    predictions: z
      .array(matchPredictionSchema)
      .min(1)
      .openapi({
        description:
          "One prediction per match. Must be unique across all entries for this bet.",
      }),
  })
  .openapi("PlaceBetEntryBody");

export const settleBetBodySchema = z
  .object({
    actualResults: z
      .array(
        z.object({
          matchId: z.string().uuid(),
          winnerId: z.string().uuid(),
        }),
      )
      .min(1)
      .openapi({ description: "The real match outcomes to score predictions against" }),
  })
  .openapi("SettleBetBody");

export const betDetailsResponseSchema = successResponse(
  z.object({
    id: z.string().uuid(),
    challengeId: z.string().uuid(),
    entryFeeKobo: z.number(),
    potKobo: z.number(),
    minBettors: z.number(),
    maxBettors: z.number(),
    currentEntries: z.number(),
    creatorCutPercent: z.number(),
    noWinnerPolicy: z.enum(["REFUND_ALL", "CLOSEST_WINS"]),
    status: z.enum(["OPEN", "CLOSED", "SETTLED", "REFUNDED"]),
  }),
).openapi("BetDetailsResponse");

export const betEntryResponseSchema = successResponse(
  z.object({
    entryId: z.string().uuid(),
    betId: z.string().uuid(),
    predictions: z.array(matchPredictionSchema),
    status: z.enum(["ACTIVE", "WON", "LOST", "REFUNDED"]),
    entryFeeKobo: z.number(),
  }),
).openapi("BetEntryResponse");

export const settleBetResponseSchema = successResponse(
  z.object({
    outcome: z.enum(["WINNER_FOUND", "REFUNDED", "CLOSEST_WINS"]),
    winnersCount: z.number(),
  }),
).openapi("SettleBetResponse");

export { errorResponse };