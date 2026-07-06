import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth, optionalAuth } from "@api/middleware/auth";
import { ChallengeRepository } from "@infrastructure/db/repositories/ChallengeRepository";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { CreateChallengeUseCase } from "@application/challenge/CreateChallengeUseCase";
import { JoinChallengeUseCase } from "@application/challenge/JoinChallengeUseCase";
import { SettleChallengeUseCase } from "@application/challenge/SettleChallengeUseCase";
import {
  createChallengeBodySchema,
  declareWinnerBodySchema,
  challengeResponseSchema,
  settleResponseSchema,
  publicChallengeListSchema,
  cancelResponseSchema,
} from "@api/schemas/challenge.schemas";
import { AppEnv } from "@api/types";
import { successResponse, errorResponse } from "@api/schemas/common.schemas";
import { GetUserChallengesUseCase } from "@application/challenge/GetUserChallengesUseCase";
import { challengeListSchema } from "@api/schemas/challenge.schemas";
import { paginationQuery } from "@api/schemas/wallet.schemas";
import { CancelChallengeUseCase } from "@src/application/challenge/CancelChallengeUseCase";

const challengeRepo = new ChallengeRepository();
const getUserChallenges = new GetUserChallengesUseCase(challengeRepo);
const walletRepo = new WalletRepository();
const createChallenge = new CreateChallengeUseCase(challengeRepo, walletRepo);
const joinChallenge = new JoinChallengeUseCase(challengeRepo, walletRepo);
const settleChallenge = new SettleChallengeUseCase(challengeRepo, walletRepo);
const challengeRoutes = new OpenAPIHono<AppEnv>();

// --- List Open Challenges (public) ---
challengeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Challenges"],
    summary: "List open challenges",
    description: "Public endpoint. Returns all open challenges for the arena page.",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
        offset: z.coerce.number().int().min(0).default(0).optional(),
        game: z.string().optional().openapi({ description: "Filter by game slug" }),
        platform: z.enum(["PS", "XBOX", "MOBILE", "PC"]).optional(),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: publicChallengeListSchema } },
        description: "Open challenges",
      },
    },
  }),
  async (c) => {
    const { limit = 20, offset = 0, game, platform } = c.req.valid("query");

    const result = await challengeRepo.findOpenChallenges({
      limit,
      offset,
      gameSlug: game,
      platform,
    });

    return c.json({ success: true as const, data: result }, 200);
  },
);

// Public, but we still want to know who's asking (if anyone) so we can
// decide whether to reveal the description below.
challengeRoutes.use("/c/:slug", optionalAuth);

challengeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/c/{slug}",
    tags: ["Challenges"],
    summary: "Resolve a shareable challenge link",
    description: "Public endpoint. Returns full challenge, creator, and game details from a short link slug.",
    request: {
      params: z.object({ slug: z.string().openapi({ example: "V1StGXR8" }) }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: successResponse(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().nullable().openapi({
                  description:
                    "Only populated for the challenge's creator, or an opponent who has already joined. Everyone else gets null.",
                }),
                hasDescription: z.boolean().openapi({
                  description: "True if a description exists, even when it's hidden from this viewer.",
                }),
                platform: z.enum(["PS", "XBOX", "MOBILE", "PC"]),
                stakeKobo: z.number(),
                potKobo: z.number(),
                status: z.string(),
                expiresAt: z.string(),
                creator: z.object({
                  username: z.string().nullable(),
                  displayName: z.string().nullable(),
                  isVerified: z.boolean(),
                  profileImageUrl: z.string().nullable(),
                  wins: z.number(),
                  losses: z.number(),
                }),
                game: z
                  .object({
                    name: z.string(),
                    imageUrl: z.string().nullable(),
                    description: z.string().nullable(),
                  })
                  .nullable(),
              }),
            ),
          },
        },
        description: "Challenge details",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not found",
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const viewerId = c.get("userId") as string | undefined;
    const result = await challengeRepo.findBySlugWithDetails(slug);
    if (!result) {
      return c.json({ success: false as const, error: "Challenge not found" }, 404);
    }

    const { challenge, creator, game } = result;

    // Only the creator, or an opponent who has already joined, gets the
    // actual text. A prospective opponent looking at an OPEN challenge
    // hasn't committed anything yet, so opponentId is still null for them —
    // this naturally excludes "about to accept" from "already accepted".
    const isCreator = viewerId === challenge.creatorId;
    const isJoinedOpponent = Boolean(challenge.opponentId) && viewerId === challenge.opponentId;
    const canSeeDescription = isCreator || isJoinedOpponent;

    return c.json(
      {
        success: true as const,
        data: {
          id: challenge.id,
          title: challenge.title,
          description: canSeeDescription ? challenge.description : null,
          hasDescription: Boolean(challenge.description),
          platform: challenge.platform,
          stakeKobo: challenge.stakeKobo,
          potKobo: challenge.potKobo,
          status: challenge.status,
          expiresAt: challenge.expiresAt.toISOString(),
          creator,
          game,
        },
      },
      200,
    );
  },
);

// --- Everything below requires auth ---
challengeRoutes.use("*", requireAuth);

// --- Create Challenge ---
challengeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Challenges"],
    summary: "Create a new challenge",
    description:
      "Stakes are immediately locked from your wallet. Share the link to invite an opponent.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createChallengeBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: challengeResponseSchema } },
        description: "Challenge created",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation or insufficient funds",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId");

    const result = await createChallenge.execute({ creatorId: userId, ...body });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 201);
  },
);

// --- Join Challenge ---
challengeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/c/{slug}/join",
    tags: ["Challenges"],
    summary: "Join a challenge via shareable link",
    description: "Locks your matching stake and moves the challenge to LOCKED state.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ slug: z.string().openapi({ example: "V1StGXR8" }) }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: successResponse(
              z.object({
                challengeId: z.string(),
                potKobo: z.number(),
              }),
            ),
          },
        },
        description: "Joined successfully",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Cannot join",
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const opponentId = c.get("userId");

    const result = await joinChallenge.execute({ opponentId, linkSlug: slug });
    if (!result.success) {
      return c.json(
        { success: false as const, error: result.error.message, code: result.error.code },
        400,
      );
    }

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

const cancelChallenge = new CancelChallengeUseCase(challengeRepo, walletRepo);

// --- Cancel Challenge ---
challengeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/{id}/cancel",
    tags: ["Challenges"],
    summary: "Cancel an open challenge",
    description: "Only the creator can cancel, and only while the challenge is still OPEN. Stake is refunded.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: cancelResponseSchema } },
        description: "Challenge cancelled and refunded",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Cannot cancel",
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const requesterId = c.get("userId");

    const result = await cancelChallenge.execute({ challengeId: id, requesterId });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: { challengeId: id } }, 200);
  },
);

// --- Declare Winner ---
challengeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/{id}/declare",
    tags: ["Challenges"],
    summary: "Declare the winner of a challenge",
    description: "Both participants must call this. If both agree → SETTLED. If not → DISPUTED.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: declareWinnerBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: settleResponseSchema } },
        description: "Declaration recorded",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Invalid declaration",
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { winnerId } = c.req.valid("json");
    const declarerId = c.get("userId");

    const result = await settleChallenge.execute({ challengeId: id, declarerId, winnerId });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

// --- Get My Challenges ---
challengeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/my",
    tags: ["Challenges"],
    summary: "Get my challenges",
    description: "All challenges you created or joined, newest first.",
    security: [{ bearerAuth: [] }],
    request: { query: paginationQuery },
    responses: {
      200: {
        content: { "application/json": { schema: challengeListSchema } },
        description: "Your challenges",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Bad request",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const { limit, offset } = c.req.valid("query");

    const result = await getUserChallenges.execute({ userId, limit, offset });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

export { challengeRoutes };