import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const createChallengeBodySchema = z
  .object({
    title: z
      .string()
      .min(3)
      .max(100)
      .openapi({ example: "1v1 FIFA match — first to 3 goals" }),
    description: z
      .string()
      .max(500)
      .optional()
      .openapi({ example: "No pausing, standard rules" }),
    stakeKobo: z
      .number()
      .int()
      .min(10_000)
      .openapi({ example: 500_000, description: "Amount in kobo. ₦5,000 = 500000" }),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(72)
      .default(24)
      .openapi({ example: 24 }),
    // Fix 1: platform and gameId were missing — the route spreads
    // body directly into the use case so these are required
    platform: z.enum(["PS", "XBOX", "MOBILE", "PC"]).openapi({ example: "PS" }),
    gameId: z.string().uuid().optional().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
      description: "Optional — link to a specific game",
    }),
  })
  .openapi("CreateChallengeBody");

// Fix 2: corrected typo declareWinnerBodySchema (was declarWinnerBodySchema)
export const declareWinnerBodySchema = z
  .object({
    winnerId: z
      .string()
      .uuid()
      .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  })
  .openapi("DeclareWinnerBody");

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

export const challengeListSchema = successResponse(
  z.object({
    challenges: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        platform: z.enum(["PS", "XBOX", "MOBILE", "PC"]),
        stakeKobo: z.number(),
        potKobo: z.number(),
        status: z.string(),
        linkSlug: z.string(),
        role: z.enum(["CREATOR", "OPPONENT"]),
        creatorId: z.string(),
        opponentId: z.string().nullable(),
        expiresAt: z.string(),
        createdAt: z.string(),
        game: z.object({
          name: z.string(),
          imageUrl: z.string().nullable(),
        }),
        creator: z.object({
          displayName: z.string(),
          isVerified: z.boolean(),
          wins: z.number(),
          losses: z.number(),
        }),
        myReport: z.enum(["WON", "LOST"]).nullable(),
        winnerId: z.string().nullable(),
      }),
    ),
    total: z.number(),
  }),
).openapi("ChallengeList");

export const publicChallengeListSchema = successResponse(
  z.object({
    challenges: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        hasDescription: z.boolean().openapi({
          description: "True if the creator set a description — content is hidden until someone joins.",
        }),
        platform: z.enum(["PS", "XBOX", "MOBILE", "PC"]),
        stakeKobo: z.number(),
        potKobo: z.number(),
        status: z.string(),
        linkSlug: z.string(),
        // Fix 3: nullable to match what the repo can return on a
        // missed join (even with coalesce, defensive here is fine)
        creatorUsername: z.string().nullable(),
        gameName: z.string().nullable(),
        gameImageUrl: z.string().nullable(),
        expiresAt: z.string(),
        createdAt: z.string(),
      }),
    ),
    total: z.number(),
  }),
).openapi("PublicChallengeList");

export const cancelResponseSchema = successResponse(
  z.object({
    challengeId: z.uuid(),
  }),
).openapi("CancelResponse");

export const disputeEvidenceItemSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string().uuid(),
  submittedBy: z.string().uuid(),
  submitterName: z.string(),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  mediaUrl: z.string(),
  fileSizeBytes: z.number(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const submitDisputeEvidenceResponseSchema = successResponse(
  z.object({
    uploaded: z.array(
      z.object({
        id: z.string().uuid(),
        mediaType: z.enum(["IMAGE", "VIDEO"]),
        mediaUrl: z.string(),
      }),
    ),
  }),
).openapi("SubmitDisputeEvidenceResponse");

export const listDisputeEvidenceResponseSchema = successResponse(
  z.array(disputeEvidenceItemSchema),
).openapi("ListDisputeEvidenceResponse");

export const listDisputedChallengesResponseSchema = successResponse(
  z.object({
    challenges: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        stakeKobo: z.number(),
        potKobo: z.number(),
        creator: z.object({
          id: z.string().uuid(),
          name: z.string(),
          claimedWinnerId: z.string().uuid().nullable(),
        }),
        opponent: z
          .object({
            id: z.string().uuid(),
            name: z.string(),
            claimedWinnerId: z.string().uuid().nullable(),
          })
          .nullable(),
        evidenceCount: z.number(),
        updatedAt: z.string(),
      }),
    ),
    total: z.number(),
  }),
).openapi("ListDisputedChallengesResponse");

export { errorResponse };