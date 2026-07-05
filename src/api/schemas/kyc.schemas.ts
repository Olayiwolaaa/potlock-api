import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const submitBvnBodySchema = z
  .object({
    bvn: z
      .string()
      .length(11)
      .regex(/^\d+$/, "BVN must be 11 digits")
      .openapi({ example: "12345678901" }),
    bankAccountId: z
      .string()
      .uuid()
      .openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description:
          "One of your saved bank accounts. Paystack validates the BVN against this specific account, not standalone — add and verify a bank account first via POST /wallet/bank-accounts.",
      }),
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
    bvnPending: z.boolean().openapi({
      description: "True while Paystack is still processing BVN validation asynchronously",
    }),
    bvnFailureReason: z.string().nullable().openapi({
      example: "Account name or BVN is incorrect",
    }),
    addressVerified: z.boolean(),
    nextTierRequirement: z
      .string()
      .nullable()
      .openapi({ example: "Submit address proof to unlock ₦200,000/day" }),
  }),
).openapi("KycStatusResponse");

export const submitBvnResponseSchema = successResponse(
  z.object({
    status: z.literal("PENDING").openapi({ example: "PENDING" }),
    message: z.string().openapi({
      example:
        "BVN submitted for verification. This usually completes within a few minutes — check /kyc/status for the result.",
    }),
  }),
).openapi("SubmitBvnResponse");

export { errorResponse };