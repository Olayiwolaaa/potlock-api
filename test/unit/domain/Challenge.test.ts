import { describe, it, expect, beforeEach } from "bun:test";
import { Challenge } from "@domain/challenge/Challenge";
import { buildChallenge } from "@test/helpers/builders";
import { randomUUID } from "crypto";

describe("Challenge", () => {
  const creatorId = randomUUID();
  const opponentId = randomUUID();

  describe("join", () => {
    it("opponent can join an open challenge", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      const result = challenge.join(opponentId);
      expect(result.success).toBe(true);
    });

    it("status becomes LOCKED after joining", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      challenge.join(opponentId);
      expect(challenge.status).toBe("LOCKED");
    });

    it("opponentId is set after joining", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      challenge.join(opponentId);
      expect(challenge.opponentId).toBe(opponentId);
    });

    it("pot doubles after joining", () => {
      const challenge = buildChallenge({ creatorId, stakeKobo: 500_000, status: "OPEN" });
      challenge.join(opponentId);
      expect(challenge.potKobo).toBe(1_000_000);
    });

    it("fails when challenge is already locked", () => {
      const challenge = buildChallenge({ status: "LOCKED", opponentId });
      const result = challenge.join(randomUUID());
      expect(result.success).toBe(false);
    });

    it("fails when challenge is settled", () => {
      const challenge = buildChallenge({ status: "SETTLED" });
      const result = challenge.join(randomUUID());
      expect(result.success).toBe(false);
    });

    it("fails when challenge is cancelled", () => {
      const challenge = buildChallenge({ status: "CANCELLED" });
      const result = challenge.join(randomUUID());
      expect(result.success).toBe(false);
    });

    it("fails when creator tries to join own challenge", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      const result = challenge.join(creatorId);
      expect(result.success).toBe(false);
    });

    it("fails when challenge has expired", () => {
      const challenge = buildChallenge({
        creatorId,
        status: "OPEN",
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      });
      const result = challenge.join(opponentId);
      expect(result.success).toBe(false);
    });
  });

  describe("cancel", () => {
    it("creator can cancel an open challenge", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      const result = challenge.cancel(creatorId);
      expect(result.success).toBe(true);
      expect(challenge.status).toBe("CANCELLED");
    });

    it("non-creator cannot cancel", () => {
      const challenge = buildChallenge({ creatorId, status: "OPEN" });
      const result = challenge.cancel(randomUUID());
      expect(result.success).toBe(false);
    });

    it("cannot cancel a locked challenge", () => {
      const challenge = buildChallenge({
        creatorId,
        opponentId,
        status: "LOCKED",
      });
      const result = challenge.cancel(creatorId);
      expect(result.success).toBe(false);
    });

    it("cannot cancel an already cancelled challenge", () => {
      const challenge = buildChallenge({ creatorId, status: "CANCELLED" });
      const result = challenge.cancel(creatorId);
      expect(result.success).toBe(false);
    });
  });

  describe("declareWinner", () => {
    let challenge: Challenge;

    beforeEach(() => {
      challenge = buildChallenge({
        creatorId,
        opponentId,
        status: "LOCKED",
      });
    });

    it("returns WAITING when only one side has declared", () => {
      const result = challenge.declareWinner(creatorId, creatorId);
      expect(result.success).toBe(true);
    });

    it("returns SETTLED when both declare the same winner", () => {
      challenge.declareWinner(creatorId, creatorId);
      const result = challenge.declareWinner(opponentId, creatorId);
      expect(result.success).toBe(true);
      expect(result.value).toBe("SETTLED");
      expect(challenge.status).toBe("SETTLED");
    });

    it("returns DISPUTED when both declare different winners", () => {
      challenge.declareWinner(creatorId, creatorId);
      const result = challenge.declareWinner(opponentId, opponentId);
      expect(result.success).toBe(true);
      expect(result.value).toBe("DISPUTED");
      expect(challenge.status).toBe("DISPUTED");
    });

    it("fails for non-participant", () => {
      const result = challenge.declareWinner(randomUUID(), creatorId);
      expect(result.success).toBe(false);
    });

    it("fails when declared winner is not a participant", () => {
      const result = challenge.declareWinner(creatorId, randomUUID());
      expect(result.success).toBe(false);
    });

    it("fails when challenge is not locked", () => {
      const openChallenge = buildChallenge({ status: "OPEN" });
      const result = openChallenge.declareWinner(creatorId, creatorId);
      expect(result.success).toBe(false);
    });

    it("fails when challenge is already settled", () => {
      const settled = buildChallenge({ status: "SETTLED", creatorId, opponentId });
      const result = settled.declareWinner(creatorId, creatorId);
      expect(result.success).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("returns false for a future challenge", () => {
      const challenge = buildChallenge({
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(challenge.isExpired).toBe(false);
    });

    it("returns true for a past challenge", () => {
      const challenge = buildChallenge({
        expiresAt: new Date(Date.now() - 60_000),
      });
      expect(challenge.isExpired).toBe(true);
    });
  });
});