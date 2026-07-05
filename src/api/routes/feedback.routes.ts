// src/api/routes/feedback.routes.ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth, requireAdmin } from "@api/middleware/auth";
import { FeedbackRepository } from "@infrastructure/db/repositories/FeedbackRepository";
import { ResendEmailService } from "@infrastructure/email/ResendEmailService";
import { SubmitFeedbackUseCase } from "@application/feedback/SubmitFeedbackUseCase";
import { ListFeedbackUseCase } from "@application/feedback/ListFeedbackUseCase";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import {
    submitFeedbackBodySchema,
    errorResponse,
} from "@api/schemas/feedback.schemas";
import type { AppEnv } from "@api/types";

const feedbackRepo = new FeedbackRepository();
const emailService = new ResendEmailService();
const submitFeedback = new SubmitFeedbackUseCase(feedbackRepo, emailService);
const listFeedback = new ListFeedbackUseCase(feedbackRepo);

const feedbackRoutes = new OpenAPIHono<AppEnv>();

feedbackRoutes.use("/", requireAuth);

// ── POST / — any authed user ──────────────────────────────────────────────────
feedbackRoutes.openapi(
    createRoute({
        method: "post",
        path: "/",
        tags: ["Feedback"],
        summary: "Submit feedback",
        security: [{ bearerAuth: [] }],
        request: {
            body: {
                content: { "application/json": { schema: submitFeedbackBodySchema } },
                required: true,
            },
        },
        responses: {
            201: {
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.literal(true),
                            data: z.object({ id: z.string() }),
                        }),
                    },
                },
                description: "Feedback submitted",
            },
            400: {
                content: { "application/json": { schema: errorResponse } },
                description: "Validation error",
            },
        },
    }),
    async (c) => {
        const body = c.req.valid("json");
        const userId = c.get("userId");


        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) {
            return c.json({ success: false as const, error: "User not found" }, 400);
        }

        const result = await submitFeedback.execute({
            userId,
            userEmail: user.email,
            displayName: user.displayName,
            message: body.message,
            rating: body.rating,
        });

        return c.json({ success: true as const, data: result.value }, 201);
    },
);

// ── GET / — admin only ────────────────────────────────────────────────────────
feedbackRoutes.openapi(
    createRoute({
        method: "get",
        path: "/",
        tags: ["Feedback"],
        summary: "List submitted feedback (admin)",
        security: [{ bearerAuth: [] }],
        request: {
            query: z.object({
                rating: z.coerce.number().int().min(1).max(5).optional(),
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
                                    userId: z.string(),
                                    message: z.string(),
                                    rating: z.number(),
                                    createdAt: z.string(),
                                }),
                            ),
                        }),
                    },
                },
                description: "Feedback list",
            },
            403: {
                content: { "application/json": { schema: errorResponse } },
                description: "Admin only",
            },
        },
    }),
    async (c) => {
        await requireAdmin(c);

        const { rating } = c.req.valid("query");
        const result = await listFeedback.execute({ rating });

        return c.json({
            success: true as const,
            data: result.value.map((f) => ({
                id: f.id,
                userId: f.userId,
                message: f.message,
                rating: f.rating,
                createdAt: f.createdAt.toISOString(),
            })),
        }, 200);
    },
);

export { feedbackRoutes };