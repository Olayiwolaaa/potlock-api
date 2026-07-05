import { z } from "@hono/zod-openapi";

export const submitFeedbackBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z.string().min(1).max(500), // matches the UI's maxLength={500}
});

export const errorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
});