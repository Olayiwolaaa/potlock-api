import { z } from "@hono/zod-openapi";

// Every success response wraps data in { success: true, data: ... }
export const successResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// Every error response looks the same
export const errorResponse = z.object({
  success: z.literal(false),
  error: z.string().openapi({ example: "Something went wrong" }),
  code: z.string().optional().openapi({ example: "VALIDATION_ERROR" }),
});

// Reusable param schemas
export const uuidParam = z.object({
  id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
});