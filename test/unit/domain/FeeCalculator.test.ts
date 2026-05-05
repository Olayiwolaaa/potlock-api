import { describe, it, expect } from "bun:test";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";

describe("FeeCalculator", () => {
  it("takes 3% for standard challenges", () => {
    // ₦10,000 pot = 1,000,000 kobo
    const result = FeeCalculator.calculateStandardPayout(1_000_000);
    expect(result.platformFee.kobo).toBe(30_000);   // ₦300
    expect(result.winnerPayout.kobo).toBe(970_000); // ₦9,700
  });

  it("takes 5% for sponsored challenges", () => {
    const result = FeeCalculator.calculateSponsoredPayout(1_000_000);
    expect(result.platformFee.kobo).toBe(50_000);   // ₦500
    expect(result.winnerPayout.kobo).toBe(950_000); // ₦9,500
  });

  it("always floors — never overpays winner", () => {
    // odd number that doesn't divide cleanly
    const result = FeeCalculator.calculateStandardPayout(100_001);
    expect(result.platformFee.kobo + result.winnerPayout.kobo)
      .toBeLessThanOrEqual(100_001);
  });

  it("charges ₦50 flat withdrawal fee", () => {
    expect(FeeCalculator.withdrawalFee().kobo).toBe(5_000);
  });
});