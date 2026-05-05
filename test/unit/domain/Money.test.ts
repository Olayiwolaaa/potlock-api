import { describe, it, expect } from "bun:test";
import { Money } from "@domain/shared/Money";

describe("Money", () => {
  describe("creation", () => {
    it("creates from kobo", () => {
      const m = Money.fromKobo(500_000);
      expect(m.kobo).toBe(500_000);
      expect(m.naira).toBe(5_000);
    });

    it("creates from naira", () => {
      const m = Money.fromNaira(5_000);
      expect(m.kobo).toBe(500_000);
    });

    it("rounds naira to nearest kobo", () => {
      const m = Money.fromNaira(5_000.005);
      expect(Number.isInteger(m.kobo)).toBe(true);
    });

    it("throws on negative amount", () => {
      expect(() => Money.fromKobo(-1)).toThrow();
    });

    it("throws on non-integer kobo", () => {
      expect(() => Money.fromKobo(100.5)).toThrow();
    });

    it("allows zero", () => {
      const m = Money.fromKobo(0);
      expect(m.kobo).toBe(0);
    });
  });

  describe("arithmetic", () => {
    it("adds two amounts", () => {
      const a = Money.fromKobo(300_000);
      const b = Money.fromKobo(200_000);
      expect(a.add(b).kobo).toBe(500_000);
    });

    it("subtracts two amounts", () => {
      const a = Money.fromKobo(500_000);
      const b = Money.fromKobo(200_000);
      expect(a.subtract(b).kobo).toBe(300_000);
    });

    it("throws when subtracting more than available", () => {
      const a = Money.fromKobo(100_000);
      const b = Money.fromKobo(200_000);
      expect(() => a.subtract(b)).toThrow("Insufficient funds");
    });

    it("allows subtracting exact amount", () => {
      const a = Money.fromKobo(500_000);
      const b = Money.fromKobo(500_000);
      expect(a.subtract(b).kobo).toBe(0);
    });
  });

  describe("percentOf", () => {
    it("calculates 3% correctly", () => {
      const pot = Money.fromKobo(1_000_000); // ₦10,000
      expect(pot.percentOf(300).kobo).toBe(30_000); // ₦300
    });

    it("calculates 5% correctly", () => {
      const pot = Money.fromKobo(1_000_000);
      expect(pot.percentOf(500).kobo).toBe(50_000);
    });

    it("always floors — never rounds up", () => {
      // 3% of 100,001 kobo = 3000.03 → should floor to 3000
      const pot = Money.fromKobo(100_001);
      const fee = pot.percentOf(300);
      expect(fee.kobo).toBe(3_000);
      expect(Number.isInteger(fee.kobo)).toBe(true);
    });

    it("fee + remainder never exceeds original", () => {
      const pot = Money.fromKobo(100_001);
      const fee = pot.percentOf(300);
      const remainder = pot.subtract(fee);
      expect(fee.kobo + remainder.kobo).toBeLessThanOrEqual(pot.kobo);
    });
  });

  describe("comparison", () => {
    it("isGreaterThan returns true when larger", () => {
      expect(Money.fromKobo(500).isGreaterThan(Money.fromKobo(400))).toBe(true);
    });

    it("isGreaterThan returns false when equal", () => {
      expect(Money.fromKobo(500).isGreaterThan(Money.fromKobo(500))).toBe(false);
    });

    it("equals returns true for same amount", () => {
      expect(Money.fromKobo(500).equals(Money.fromKobo(500))).toBe(true);
    });
  });

  describe("toString", () => {
    it("formats as naira with symbol", () => {
      expect(Money.fromNaira(5_000).toString()).toBe("₦5,000");
    });
  });
});