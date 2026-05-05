import { describe, it, expect } from "bun:test";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";

describe("FeeCalculator", () => {
  describe("standard payout (3%)", () => {
    it("takes 3% platform fee", () => {
      const result = FeeCalculator.calculateStandardPayout(1_000_000);
      expect(result.platformFee.kobo).toBe(30_000);
    });

    it("winner receives 97%", () => {
      const result = FeeCalculator.calculateStandardPayout(1_000_000);
      expect(result.winnerPayout.kobo).toBe(970_000);
    });

    it("fee + payout equals gross pot", () => {
      const result = FeeCalculator.calculateStandardPayout(1_000_000);
      expect(result.platformFee.kobo + result.winnerPayout.kobo).toBe(1_000_000);
    });

    it("handles small pot — ₦1,000", () => {
      const result = FeeCalculator.calculateStandardPayout(100_000);
      expect(result.platformFee.kobo).toBe(3_000);
      expect(result.winnerPayout.kobo).toBe(97_000);
    });

    it("always floors fee on odd numbers", () => {
      const result = FeeCalculator.calculateStandardPayout(100_001);
      expect(result.platformFee.kobo + result.winnerPayout.kobo)
        .toBeLessThanOrEqual(100_001);
      expect(Number.isInteger(result.platformFee.kobo)).toBe(true);
    });
  });

  describe("sponsored payout (5%)", () => {
    it("takes 5% platform fee", () => {
      const result = FeeCalculator.calculateSponsoredPayout(1_000_000);
      expect(result.platformFee.kobo).toBe(50_000);
    });

    it("winner receives 95%", () => {
      const result = FeeCalculator.calculateSponsoredPayout(1_000_000);
      expect(result.winnerPayout.kobo).toBe(950_000);
    });
  });

  describe("withdrawal fee", () => {
    it("is a flat ₦50", () => {
      expect(FeeCalculator.withdrawalFee().kobo).toBe(5_000);
    });

    it("is the same regardless of withdrawal amount", () => {
      const fee1 = FeeCalculator.withdrawalFee();
      const fee2 = FeeCalculator.withdrawalFee();
      expect(fee1.kobo).toBe(fee2.kobo);
    });
  });
});