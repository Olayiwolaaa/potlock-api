import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { requireAdmin } from "@api/middleware/requireAdmin";
import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { CreateGameUseCase } from "@application/games/CreateGameUseCase";
import { ListGamesUseCase } from "@application/games/ListGamesUseCase";
import { RequestGameUseCase } from "@application/games/RequestGameUseCase";
import { ReviewGameRequestUseCase } from "@application/games/ReviewGameRequestUseCase";
import { db } from "@infrastructure/db/client";
import { gameRequests, games } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import {
  listGamesResponseSchema,
  requestGameBodySchema,
  reviewGameRequestBodySchema,
  errorResponse,
} from "@api/schemas/game.schemas";
import type { AppEnv } from "@api/types";

const storage = new CloudinaryAdapter();
const listGames = new ListGamesUseCase();
const createGame = new CreateGameUseCase(storage);
const requestGame = new RequestGameUseCase();
const reviewRequest = new ReviewGameRequestUseCase(storage);

const gameRoutes = new OpenAPIHono<AppEnv>();

// ── GET /games ── public ──────────────────────────────────────────────────────
gameRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Games"],
    summary: "List all active game categories",
    description: "Cached for 1 hour. Used to populate the game selector when creating a challenge.",
    responses: {
      200: {
        content: { "application/json": { schema: listGamesResponseSchema } },
        description: "Active games",
      },
      500: {
        content: { "application/json": { schema: errorResponse } },
        description: "Internal error",
      },
    },
  }),
  async (c) => {
    const result = await listGames.execute();
    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 500);
    }
    return c.json({ success: true as const, data: result.value }, 200);
  },
);

// ── POST /games — admin only ──────────────────────────────────────────────────
gameRoutes.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Games"],
    summary: "Create a game category (admin)",
    description: "Send as multipart/form-data with name, optional description, and image.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              name: z.string().min(2).max(80),
              description: z.string().max(300).optional(),
              image: z.string().openapi({ type: "string", format: "binary", description: "Game image file" }),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              data: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string(),
                imageUrl: z.string(),
              }),
            }),
          },
        },
        description: "Game created",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation error",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Admin only",
      },
    },
  }),
  async (c) => {
    await requireAuth(c, async () => { });
    await requireAdmin(c, async () => { });

    const formData = await c.req.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string | null;
    const imageFile = formData.get("image") as File;

    if (!imageFile) {
      return c.json({ success: false as const, error: "Image is required" }, 400);
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const result = await createGame.execute({
      name,
      description: description ?? undefined,
      imageBuffer,
      imageMimeType: imageFile.type,
    });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 201);
  },
);

// ── POST /games/requests — auth users ────────────────────────────────────────
gameRoutes.use("/requests*", requireAuth);

gameRoutes.openapi(
  createRoute({
    method: "post",
    path: "/requests",
    tags: ["Games"],
    summary: "Request a new game category",
    description: "Any user can request a new game. Admins review and approve or reject.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: requestGameBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              data: z.object({ requestId: z.string() }),
            }),
          },
        },
        description: "Request submitted",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation or duplicate request",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId");

    const result = await requestGame.execute({ userId, ...body });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 201);
  },
);

// ── GET /games/requests — admin ───────────────────────────────────────────────
gameRoutes.openapi(
  createRoute({
    method: "get",
    path: "/requests",
    tags: ["Games"],
    summary: "List pending game requests (admin)",
    security: [{ bearerAuth: [] }],
    request: {
      query: z.object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING").optional(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              data: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  description: z.string().nullable(),
                  reason: z.string(),
                  status: z.string(),
                  requestedById: z.string(),
                  createdAt: z.string(),
                }),
              ),
            }),
          },
        },
        description: "Game requests",
      },
    },
  }),
  async (c) => {
    await requireAdmin(c, async () => { });

    const { status } = c.req.valid("query");

    const rows = await db
      .select()
      .from(gameRequests)
      .where(eq(gameRequests.status, (status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED"));

    return c.json({
      success: true as const,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        reason: r.reason,
        status: r.status,
        requestedById: r.requestedById,
        createdAt: r.createdAt.toISOString(),
      })),
    }, 200);
  },
);

// ── POST /games/requests/:requestId/review — admin ────────────────────────────
gameRoutes.openapi(
  createRoute({
    method: "post",
    path: "/requests/:requestId/review",
    tags: ["Games"],
    summary: "Approve or reject a game request (admin)",
    description:
      "If approving, send as multipart/form-data with decision, optional reviewNote, and image. If rejecting, send as JSON.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ requestId: z.string().uuid() }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ success: z.literal(true), data: z.object({}) }),
          },
        },
        description: "Decision recorded",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Already reviewed or missing image",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Admin only",
      },
    },
  }),
  async (c) => {
    await requireAdmin(c, async () => { });

    const { requestId } = c.req.valid("param");
    const adminId = c.get("userId");

    const contentType = c.req.header("content-type") ?? "";
    let decision: "APPROVED" | "REJECTED";
    let reviewNote: string | undefined;
    let imageBuffer: Buffer | undefined;
    let imageMimeType: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      decision = formData.get("decision") as "APPROVED" | "REJECTED";
      reviewNote = (formData.get("reviewNote") as string) ?? undefined;
      const imageFile = formData.get("image") as File | null;

      if (imageFile) {
        const ab = await imageFile.arrayBuffer();
        imageBuffer = Buffer.from(ab);
        imageMimeType = imageFile.type;
      }
    } else {
      const body = await c.req.json();
      decision = body.decision;
      reviewNote = body.reviewNote;
    }

    const result = await reviewRequest.execute({
      requestId,
      adminId,
      decision,
      reviewNote,
      imageBuffer,
      imageMimeType,
    });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: {} }, 200);
  },
);

export { gameRoutes };