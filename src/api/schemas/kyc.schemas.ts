import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const submitBvnBodySchema = z
  .object({
    bvn: z
      .string()
      .length(11)
      .regex(/^\d+$/, "BVN must be 11 digits")
      .openapi({ example: "12345678901" }),
  })
  .openapi("SubmitBvnBody");

export const kycStatusResponseSchema = successResponse(
  z.object({
    tier: z.enum(["TIER_0", "TIER_1", "TIER_2", "TIER_3"]).openapi({
      example: "TIER_1",
      description: "Current KYC tier",
    }),
    dailyLimitNaira: z.number().openapi({ example: 50_000 }),
    dailyWithdrawnNaira: z.number().openapi({ example: 5_000 }),
    remainingTodayNaira: z.number().openapi({ example: 45_000 }),
    bvnVerified: z.boolean(),
    addressVerified: z.boolean(),
    nextTierRequirement: z
      .string()
      .nullable()
      .openapi({ example: "Submit address proof to unlock ₦200,000/day" }),
  }),
).openapi("KycStatusResponse");

export const submitBvnResponseSchema = successResponse(
  z.object({
    tier: z.string().openapi({ example: "TIER_1" }),
    dailyLimitNaira: z.number().openapi({ example: 50_000 }),
    message: z.string().openapi({
      example: "BVN verified. You can now withdraw up to ₦50,000 daily.",
    }),
  }),
).openapi("SubmitBvnResponse");

export { errorResponse };