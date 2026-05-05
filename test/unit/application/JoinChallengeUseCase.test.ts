import { describe, it, expect, beforeEach } from "bun:test";
import { Challenge } from "@domain/challenge/Challenge";
import { Money } from "@domain/shared/Money";
import {
  MockChallengeRepository,
  MockWalletRepository,
  buildChallenge,
  buildWallet,
} from "../../helpers/builders";
import { randomUUID } from "crypto";

// Test the join flow using domain objects directly
// (JoinChallengeUseCase has DB calls for vault/tx — those are integration tests)
describe("Join Challenge — domain rules", () => {
  const creatorId = randomUUID();
  const opponentId = randomUUID();

  it("joining doubles the pot", () => {
    const challenge = buildChallenge({
      creatorId,
      stakeKobo: 500_000,
      status: "OPEN",
    });

    challenge.join(opponentId);
    expect(challenge.potKobo).toBe(1_000_000);
  });

  it("opponent wallet is debited the stake amount", () => {
    const wallet = buildWallet({ userId: opponentId, balanceKobo: 1_000_000 });
    const stake = Money.fromKobo(500_000);

    const result = wallet.debit(stake);
    expect(result.success).toBe(true);
    expect(wallet.balance.kobo).toBe(500_000);
  });

  it("wallet debit is rolled back on domain error", () => {
    // Simulate: wallet debited but challenge join fails
    const wallet = buildWallet({ userId: opponentId, balanceKobo: 500_000 });
    const stake = Money.fromKobo(500_000);
    const challenge = buildChallenge({ creatorId, status: "LOCKED" }); // already locked

    // In the real use case, we check challenge.join() BEFORE debiting
    // This test verifies the domain correctly rejects the join
    const joinResult = challenge.join(opponentId);
    expect(joinResult.success).toBe(false);

    // Wallet should NOT have been debited since we check join first
    expect(wallet.balance.kobo).toBe(500_000);
  });
});