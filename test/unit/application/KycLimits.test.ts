import { describe, it, expect } from "bun:test";
import { getDailyLimit } from "@domain/kyc/KycTier";
import { Money } from "@domain/shared/Money";

describe("KYC daily limits", () => {
  it("TIER_0 has zero withdrawal limit", () => {
    expect(getDailyLimit("TIER_0").kobo).toBe(0);
  });

  it("TIER_1 allows ₦50,000 per day", () => {
    expect(getDailyLimit("TIER_1").naira).toBe(50_000);
  });

  it("TIER_2 allows ₦200,000 per day", () => {
    expect(getDailyLimit("TIER_2").naira).toBe(200_000);
  });

  it("TIER_3 allows ₦5,000,000 per day", () => {
    expect(getDailyLimit("TIER_3").naira).toBe(5_000_000);
  });

  it("each tier limit is greater than the previous", () => {
    const tiers = ["TIER_0", "TIER_1", "TIER_2", "TIER_3"] as const;
    for (let i = 1; i < tiers.length; i++) {
      expect(getDailyLimit(tiers[i]!).kobo).toBeGreaterThan(
        getDailyLimit(tiers[i - 1]!).kobo,
      );
    }
  });

  it("withdrawal of ₦60,000 exceeds TIER_1 limit", () => {
    const limit = getDailyLimit("TIER_1");
    const requested = Money.fromNaira(60_000);
    expect(requested.isGreaterThan(limit)).toBe(true);
  });

  it("withdrawal of ₦40,000 is within TIER_1 limit", () => {
    const limit = getDailyLimit("TIER_1");
    const requested = Money.fromNaira(40_000);
    expect(requested.isGreaterThan(limit)).toBe(false);
  });
});