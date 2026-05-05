import { describe, it, expect, beforeEach } from "bun:test";
import {
  MockChallengeRepository,
  MockWalletRepository,
  buildWallet,
} from "../../helpers/builders";
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
    const wallet = buildWallet({ userId, balanceKobo: 1_000_000 });
    walletRepo.seed(wallet);

    const result = wallet.debit({ kobo: 500_000 } as never);
    // We test the wallet domain rule directly
    const debit = wallet.debit(
      (await import("@domain/shared/Money")).Money.fromKobo(500_000),
    );
    expect(debit.success).toBe(true);
    expect(wallet.balance.kobo).toBe(500_000);
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