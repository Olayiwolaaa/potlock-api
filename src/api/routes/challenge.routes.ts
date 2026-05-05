import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { ChallengeRepository } from "@infrastructure/db/repositories/ChallengeRepository";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { CreateChallengeUseCase } from "@application/challenge/CreateChallengeUseCase";
import { JoinChallengeUseCase } from "@application/challenge/JoinChallengeUseCase";
import { SettleChallengeUseCase } from "@application/challenge/SettleChallengeUseCase";
import { NotFoundError } from "@domain/shared/DomainError";
import {
  createChallengeBodySchema,
  declarWinnerBodySchema,
  challengeResponseSchema,
  settleResponseSchema,
} from "@api/schemas/challenge.schemas";
import { AppEnv } from "@api/types";
import { successResponse, errorResponse } from "@api/schemas/common.schemas";

const challengeRepo = new ChallengeRepository();
const walletRepo = new WalletRepository();
const createChallenge = new CreateChallengeUseCase(challengeRepo, walletRepo);
const joinChallenge = new JoinChallengeUseCase(challengeRepo, walletRepo);
const settleChallenge = new SettleChallengeUseCase(challengeRepo, walletRepo);
const challengeRoutes = new OpenAPIHono<AppEnv>();
challengeRoutes.use("*", requireAuth);

// --- Create Challenge ---
challengeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Challenges"],
    summary: "Create a new challenge",
    description: "Stakes are immediately locked from your wallet. Share the link to invite an opponent.",
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { "application/json": { schema: createChallengeBodySchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: challengeResponseSchema } }, description: "Challenge created" },
      400: { content: { "application/json": { schema: errorResponse } }, description: "Validation or insufficient funds" },
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

// --- Get Challenge by Slug (public — no auth needed for shareable link) ---
challengeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/c/{slug}",
    tags: ["Challenges"],
    summary: "Resolve a shareable challenge link",
    description: "Public endpoint. Returns challenge details from a short link slug.",
    request: {
      params: z.object({ slug: z.string().openapi({ example: "V1StGXR8" }) }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: successResponse(z.object({
              id: z.string(),
              title: z.string(),
              stakeKobo: z.number(),
              status: z.string(),
              creatorId: z.string(),
              expiresAt: z.string(),
            })),
          },
        },
        description: "Challenge details",
      },
      404: { content: { "application/json": { schema: errorResponse } }, description: "Not found" },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const challenge = await challengeRepo.findBySlug(slug);
    if (!challenge) throw new NotFoundError("Challenge");

    return c.json({
      success: true,
      data: {
        id: challenge.id,
        title: challenge.title,
        stakeKobo: challenge.stakeKobo,
        status: challenge.status,
        creatorId: challenge.creatorId,
        expiresAt: challenge.expiresAt.toISOString(),
      },
    });
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
            schema: successResponse(z.object({
              challengeId: z.string(),
              potKobo: z.number(),
            })),
          },
        },
        description: "Joined successfully",
      },
      400: { content: { "application/json": { schema: errorResponse } }, description: "Cannot join" },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const opponentId = c.get("userId");

    const result = await joinChallenge.execute({ opponentId, linkSlug: slug });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true, data: result.value });
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
      body: { content: { "application/json": { schema: declarWinnerBodySchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: settleResponseSchema } }, description: "Declaration recorded" },
      400: { content: { "application/json": { schema: errorResponse } }, description: "Invalid declaration" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { winnerId } = c.req.valid("json");
    const declarerId = c.get("userId");

    const result = await settleChallenge.execute({ challengeId: id, declarerId, winnerId });
    if (!result.success) return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true, data: result.value });
  },
);

export { challengeRoutes };