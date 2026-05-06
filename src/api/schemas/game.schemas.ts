import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const gameSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const listGamesResponseSchema = successResponse(
  z.array(gameSchema),
).openapi("ListGamesResponse");

export const requestGameBodySchema = z.object({
  name: z.string().min(2).max(80).openapi({ example: "8-Ball Pool" }),
  description: z.string().max(300).optional(),
  reason: z.string().min(10).max(500).openapi({
    example: "Very popular in Nigeria — iMessage and 8 Ball Pool app",
  }),
}).openapi("RequestGameBody");

export const reviewGameRequestBodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]).openapi({ example: "APPROVED" }),
  reviewNote: z.string().max(300).optional().openapi({
    example: "Great suggestion, added to the library",
  }),
}).openapi("ReviewGameRequestBody");

export { errorResponse };