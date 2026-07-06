import { z } from "@hono/zod-openapi";

export const errorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const notificationItemSchema = z.object({
  id: z.string().uuid(),
  type: z.string().openapi({ example: "challenge.joined" }),
  title: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()),
  read: z.boolean(),
  createdAt: z.string(),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const listNotificationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(notificationItemSchema),
    unreadCount: z.number(),
    total: z.number(),
  }),
});

export const markReadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string().uuid() }),
});

export const markAllReadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ updated: z.number() }),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
