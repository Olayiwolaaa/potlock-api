import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { PaystackIdentityAdapter } from "@infrastructure/payment/PaystackIdentityAdapter";
import { SubmitBvnUseCase } from "@application/kyc/SubmitBvnUseCase";
import type { AppEnv } from "@api/types";
import { db } from "@infrastructure/db/client";
import { kycProfiles } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { getDailyLimit, KycTier } from "@domain/kyc/KycTier";
import { Money } from "@domain/shared/Money";
import {
  submitBvnBodySchema,
  submitBvnResponseSchema,
  kycStatusResponseSchema,
  errorResponse,
} from "@api/schemas/kyc.schemas";

const identity = new PaystackIdentityAdapter();
const submitBvnUseCase = new SubmitBvnUseCase(identity);

const kycRoutes = new OpenAPIHono<AppEnv>();
kycRoutes.use("*", requireAuth);

// ── GET /kyc/status ───────────────────────────────────────────────────────────
kycRoutes.openapi(
  createRoute({
    method: "get",
    path: "/status",
    tags: ["KYC"],
    summary: "Get KYC status and withdrawal limits",
    description:
      "Returns your current tier, daily withdrawal limit, how much you have withdrawn today, and what is needed to upgrade.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: kycStatusResponseSchema } },
        description: "KYC status",
      },
      401: {
        content: { "application/json": { schema: errorResponse } },
        description: "Unauthorized",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");

    const profile = await db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, userId))
      .limit(1);

    const tier = (profile[0]?.tier ?? "TIER_0") as KycTier;
    const dailyLimit = getDailyLimit(tier);

    const now = new Date();
    const resetAt = profile[0]?.dailyLimitResetAt ?? new Date(0);
    const isNewDay = now.toDateString() !== resetAt.toDateString();
    const withdrawnKobo = isNewDay ? 0 : (profile[0]?.dailyWithdrawnKobo ?? 0);

    const remainingKobo = Math.max(0, dailyLimit.kobo - withdrawnKobo);

    const nextTierMap: Record<KycTier, string | null> = {
      TIER_0: "Verify your BVN to unlock ₦50,000/day withdrawals",
      TIER_1: "Submit your address to unlock ₦200,000/day withdrawals",
      TIER_2: "Contact support for full KYC to unlock ₦5,000,000/day withdrawals",
      TIER_3: null,
    };

    return c.json({
      success: true as const,
      data: {
        tier,
        dailyLimitNaira: dailyLimit.naira,
        dailyWithdrawnNaira: Money.fromKobo(withdrawnKobo).naira,
        remainingTodayNaira: Money.fromKobo(remainingKobo).naira,
        bvnVerified: profile[0]?.bvnStatus === "VERIFIED",
        addressVerified: profile[0]?.addressStatus === "VERIFIED",
        nextTierRequirement: nextTierMap[tier],
      },
    }, 200);
  },
);

// ── POST /kyc/bvn ─────────────────────────────────────────────────────────────
kycRoutes.openapi(
  createRoute({
    method: "post",
    path: "/bvn",
    tags: ["KYC"],
    summary: "Submit BVN for Tier 1 verification",
    description:
      "Verifies your BVN with Paystack Identity. On success, your daily withdrawal limit increases to ₦50,000. Your BVN is masked before storage — we never store the raw value.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: submitBvnBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: submitBvnResponseSchema } },
        description: "BVN verified successfully",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Invalid BVN or verification failed",
      },
      401: {
        content: { "application/json": { schema: errorResponse } },
        description: "Unauthorized",
      },
    },
  }),
  async (c) => {
    const { bvn } = c.req.valid("json");
    const userId = c.get("userId");

    const existing = await db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, userId))
      .limit(1);

    if (existing[0]?.bvnStatus === "VERIFIED") {
      return c.json({
        success: false as const,
        error: "BVN already verified for this account",
      }, 400);
    }

    const result = await submitBvnUseCase.execute({ userId, bvn });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

export { kycRoutes };