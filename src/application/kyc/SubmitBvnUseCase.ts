import { db } from "@infrastructure/db/client";
import { kycProfiles } from "@infrastructure/db/schema";
import { PaystackIdentityAdapter } from "@infrastructure/payment/PaystackIdentityAdapter";
import { Result, ok, err } from "@domain/shared/Result";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

interface SubmitBvnInput {
  userId: string;
  bvn: string;
}

interface SubmitBvnOutput {
  tier: string;
  dailyLimitNaira: number;
  message: string;
}

export class SubmitBvnUseCase {
  constructor(private readonly identity: PaystackIdentityAdapter) {}

  async execute(input: SubmitBvnInput): Promise<Result<SubmitBvnOutput>> {
    // Basic BVN format check — 11 digits
    if (!/^\d{11}$/.test(input.bvn)) {
      return err("BVN must be 11 digits");
    }

    const verified = await this.identity.verifyBvn(input.bvn);
    if (!verified) {
      return err("Could not verify BVN. Please check and try again.");
    }

    // Mask BVN before storing — never store raw BVN
    const maskedBvn = `${input.bvn.slice(0, 2)}*******${input.bvn.slice(-2)}`;

    // Upsert KYC profile
    const existing = await db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, input.userId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(kycProfiles)
        .set({
          bvn: maskedBvn,
          bvnStatus: "VERIFIED",
          tier: "TIER_1",
          updatedAt: new Date(),
        })
        .where(eq(kycProfiles.userId, input.userId));
    } else {
      await db.insert(kycProfiles).values({
        id: randomUUID(),
        userId: input.userId,
        bvn: maskedBvn,
        bvnStatus: "VERIFIED",
        tier: "TIER_1",
        dailyWithdrawnKobo: 0,
        dailyLimitResetAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return ok({
      tier: "TIER_1",
      dailyLimitNaira: 50_000,
      message: `BVN verified. You can now withdraw up to ₦50,000 daily.`,
    });
  }
}