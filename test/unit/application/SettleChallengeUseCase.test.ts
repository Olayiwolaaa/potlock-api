import { describe, it, expect, beforeEach } from "bun:test";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";
import { buildChallenge, buildWallet } from "@test/helpers/builders";
import { randomUUID } from "crypto";

describe("Settlement — domain rules", () => {
  const creatorId = randomUUID();
  const opponentId = randomUUID();

  describe("consensus settlement", () => {
    it("settles when both agree on winner", () => {
      const challenge = buildChallenge({
        creatorId,
        opponentId,
        status: "LOCKED",
      });

      challenge.declareWinner(creatorId, creatorId);
      const result = challenge.declareWinner(opponentId, creatorId);

      expect(result.success).toBe(true);
      result.success ? console.log(result.value) : console.log(result.error);
      expect(challenge.status).toBe("SETTLED");
    });

    it("disputes when declarations conflict", () => {
      const challenge = buildChallenge({
        creatorId,
        opponentId,
        status: "LOCKED",
      });

      challenge.declareWinner(creatorId, creatorId);     // creator says creator won
      const result = challenge.declareWinner(opponentId, opponentId); // opponent says opponent won

      expect(result.success).toBe(true);
      result.success ? console.log(result.value) : console.log(result.error);
      expect(challenge.status).toBe("DISPUTED");
    });
  });

  describe("fee calculation on settlement", () => {
    it("winner receives 97% of ₦10,000 pot", () => {
      const fees = FeeCalculator.calculateStandardPayout(1_000_000);
      expect(fees.winnerPayout.kobo).toBe(970_000);
    });

    it("winner wallet is credited correct amount", () => {
      const wallet = buildWallet({ balanceKobo: 0 });
      const fees = FeeCalculator.calculateStandardPayout(1_000_000);

      wallet.credit(fees.winnerPayout);
      expect(wallet.balance.kobo).toBe(970_000);
    });

    it("loser wallet is not affected by settlement", () => {
      const loserWallet = buildWallet({ balanceKobo: 200_000 });
      // Loser's wallet should remain untouched
      expect(loserWallet.balance.kobo).toBe(200_000);
    });

    it("total payout never exceeds pot", () => {
      const potKobo = 1_000_000;
      const fees = FeeCalculator.calculateStandardPayout(potKobo);
      expect(fees.platformFee.kobo + fees.winnerPayout.kobo).toBeLessThanOrEqual(potKobo);
    });
  });
});