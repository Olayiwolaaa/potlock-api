import { describe, it, expect, beforeEach } from "bun:test";
import {
  MockChallengeRepository,
  MockWalletRepository,
  buildWallet,
} from "@test/helpers/builders";
import { randomUUID } from "crypto";

// We test the domain rules that CreateChallengeUseCase enforces
// without needing the full DB stack

describe("CreateChallenge — wallet debit rules", () => {
  let walletRepo: MockWalletRepository;
  const userId = randomUUID();

  beforeEach(() => {
    walletRepo = new MockWalletRepository();
  });

  it("user with sufficient balance can stake", async () => {
    // 1. Setup: Start with 1,000,000
    const wallet = buildWallet({ userId, balanceKobo: 1_000_000 });
    walletRepo.seed(wallet);

    // 2. Execution: Debit 500,000 ONCE
    const { Money } = await import("@domain/shared/Money");
    const debit = wallet.debit(Money.fromKobo(500_000));

    // 3. Validation
    expect(debit.success).toBe(true);
    expect(wallet.balance.kobo).toBe(500_000); // 1,000,000 - 500,000 = 500,000
  });

  it("user with insufficient balance cannot stake", async () => {
    const wallet = buildWallet({ userId, balanceKobo: 100_000 });
    walletRepo.seed(wallet);

    const { Money } = await import("@domain/shared/Money");
    const debit = wallet.debit(Money.fromKobo(500_000));
    expect(debit.success).toBe(false);
    expect(wallet.balance.kobo).toBe(100_000); // unchanged
  });
});
