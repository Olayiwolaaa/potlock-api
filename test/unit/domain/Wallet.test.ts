import { describe, it, expect } from "bun:test";
import { Money } from "@domain/shared/Money";
import { buildWallet } from "@test/helpers/builders";

describe("Wallet", () => {
  describe("credit", () => {
    it("increases balance by credited amount", () => {
      const wallet = buildWallet({ balanceKobo: 0 });
      wallet.credit(Money.fromKobo(500_000));
      expect(wallet.balance.kobo).toBe(500_000);
    });

    it("can credit multiple times", () => {
      const wallet = buildWallet({ balanceKobo: 0 });
      wallet.credit(Money.fromKobo(200_000));
      wallet.credit(Money.fromKobo(300_000));
      expect(wallet.balance.kobo).toBe(500_000);
    });

    it("fails when amount is zero", () => {
      const wallet = buildWallet({ balanceKobo: 100_000 });
      const result = wallet.credit(Money.fromKobo(0));
      expect(result.success).toBe(false);
    });

    it("does not mutate balance on failed credit", () => {
      const wallet = buildWallet({ balanceKobo: 100_000 });
      wallet.credit(Money.fromKobo(0));
      expect(wallet.balance.kobo).toBe(100_000);
    });
  });

  describe("debit", () => {
    it("decreases balance by debited amount", () => {
      const wallet = buildWallet({ balanceKobo: 500_000 });
      const result = wallet.debit(Money.fromKobo(200_000));
      expect(result.success).toBe(true);
      expect(wallet.balance.kobo).toBe(300_000);
    });

    it("allows debiting entire balance", () => {
      const wallet = buildWallet({ balanceKobo: 500_000 });
      const result = wallet.debit(Money.fromKobo(500_000));
      expect(result.success).toBe(true);
      expect(wallet.balance.kobo).toBe(0);
    });

    it("fails when balance is insufficient", () => {
      const wallet = buildWallet({ balanceKobo: 100_000 });
      const result = wallet.debit(Money.fromKobo(200_000));
      expect(result.success).toBe(false);
    });

    it("does not mutate balance on failed debit", () => {
      const wallet = buildWallet({ balanceKobo: 100_000 });
      wallet.debit(Money.fromKobo(200_000));
      expect(wallet.balance.kobo).toBe(100_000);
    });

    it("fails when amount is zero", () => {
      const wallet = buildWallet({ balanceKobo: 100_000 });
      const result = wallet.debit(Money.fromKobo(0));
      expect(result.success).toBe(false);
    });
  });
});