import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const createChallengeBodySchema = z.object({
  title: z.string().min(3).max(100).openapi({ example: "1v1 FIFA match — first to 3 goals" }),
  description: z.string().max(500).optional().openapi({ example: "No pausing, standard rules" }),
  stakeKobo: z.number().int().min(10_000).openapi({ example: 500_000, description: "Amount in kobo. ₦5,000 = 500000" }),
  expiresInHours: z.number().int().min(1).max(72).default(24).openapi({ example: 24 }),
}).openapi("CreateChallengeBody");

export const declarWinnerBodySchema = z.object({
  winnerId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
}).openapi("DeclareWinnerBody");

export const challengeResponseSchema = successResponse(
  z.object({
    challengeId: z.string().uuid(),
    linkSlug: z.string().openapi({ example: "V1StGXR8" }),
    shareUrl: z.string().openapi({ example: "/c/V1StGXR8" }),
    stakeKobo: z.number(),
  }),
).openapi("ChallengeResponse");

export const settleResponseSchema = successResponse(
  z.object({
    outcome: z.enum(["SETTLED", "DISPUTED", "WAITING"]),
    winnerPayout: z.number().optional(),
    platformFee: z.number().optional(),
  }),
).openapi("SettleResponse");

export { errorResponse };