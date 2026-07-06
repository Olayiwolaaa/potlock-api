import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { ListNotificationsUseCase } from "@application/notifications/ListNotificationsUseCase";
import { MarkNotificationsReadUseCase } from "@application/notifications/MarkNotificationsReadUseCase";
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  markReadResponseSchema,
  markAllReadResponseSchema,
  notificationIdParamSchema,
  errorResponse,
} from "@api/schemas/notification.schemas";
import type { AppEnv } from "@api/types";

const listNotifications = new ListNotificationsUseCase();
const markRead = new MarkNotificationsReadUseCase();

const notificationRoutes = new OpenAPIHono<AppEnv>();
notificationRoutes.use("*", requireAuth);

// ── GET / — the notification bell's list + unread badge ───────────────────────
notificationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Notifications"],
    summary: "List the current user's notifications",
    security: [{ bearerAuth: [] }],
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: listNotificationsResponseSchema } },
        description: "Notifications, most recent first",
      },
      500: {
        content: { "application/json": { schema: errorResponse } },
        description: "Internal error",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const { limit, offset, unreadOnly } = c.req.valid("query");

    const result = await listNotifications.execute({ userId, limit, offset, unreadOnly });
    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 500);
    }

    return c.json(
      {
        success: true as const,
        data: {
          items: result.value.items.map((n) => ({
            ...n,
            createdAt: n.createdAt.toISOString(),
          })),
          unreadCount: result.value.unreadCount,
          total: result.value.total,
        },
      },
      200,
    );
  },
);

// ── POST /:id/read — mark one notification read ────────────────────────────────
notificationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/{id}/read",
    tags: ["Notifications"],
    summary: "Mark a single notification as read",
    security: [{ bearerAuth: [] }],
    request: { params: notificationIdParamSchema },
    responses: {
      200: {
        content: { "application/json": { schema: markReadResponseSchema } },
        description: "Marked read",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not found",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");

    const result = await markRead.markOne({ userId, notificationId: id });
    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 404);
    }

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

// ── POST /read-all — mark everything read (bell "clear all") ───────────────────
notificationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/read-all",
    tags: ["Notifications"],
    summary: "Mark all of the current user's notifications as read",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: markAllReadResponseSchema } },
        description: "Marked all read",
      },
      500: {
        content: { "application/json": { schema: errorResponse } },
        description: "Internal error",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const result = await markRead.markAll({ userId });
    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 500);
    }
    return c.json({ success: true as const, data: result.value }, 200);
  },
);

export { notificationRoutes };
