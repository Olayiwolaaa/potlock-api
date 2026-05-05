import { describe, it, expect } from "bun:test";
import { BracketGenerator } from "@domain/tournament/BracketGenerator";
import { randomUUID } from "crypto";

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    displayName: `Player ${i + 1}`,
    seed: i + 1,
  }));
}

describe("BracketGenerator", () => {
  describe("generate", () => {
    it("generates correct number of first-round matches for 4 players", () => {
      const players = makePlayers(4);
      const matches = BracketGenerator.generate(players, false);
      expect(matches.length).toBe(2); // 4 players = 2 matches
    });

    it("generates correct number of first-round matches for 5 players", () => {
      // 5 players → padded to 8 → 4 first round matches (3 real + 1 bye)
      const players = makePlayers(5);
      const matches = BracketGenerator.generate(players, false);
      expect(matches.length).toBe(4);
    });

    it("generates a bye match for odd player counts", () => {
      const players = makePlayers(5);
      const matches = BracketGenerator.generate(players, false);
      const byeMatches = matches.filter((m) => m.isBye);
      expect(byeMatches.length).toBeGreaterThan(0);
    });

    it("bye match has a null slot", () => {
      const players = makePlayers(5);
      const matches = BracketGenerator.generate(players, false);
      const byeMatch = matches.find((m) => m.isBye);
      expect(byeMatch?.player1Id === null || byeMatch?.player2Id === null).toBe(true);
    });

    it("all matches are in round 1", () => {
      const players = makePlayers(4);
      const matches = BracketGenerator.generate(players, false);
      expect(matches.every((m) => m.round === 1)).toBe(true);
    });

    it("match numbers are sequential", () => {
      const players = makePlayers(4);
      const matches = BracketGenerator.generate(players, false);
      const numbers = matches.map((m) => m.matchNumber).sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2]);
    });

    it("throws with fewer than 2 players", () => {
      expect(() => BracketGenerator.generate(makePlayers(1), false)).toThrow();
    });

    it("produces different ordering with randomize=true across runs", () => {
      const players = makePlayers(8);
      const run1 = BracketGenerator.generate(players, true).map((m) => m.player1Id);
      const run2 = BracketGenerator.generate(players, true).map((m) => m.player1Id);
      // With 8 players there are 40320 possible orderings
      // chance of collision is negligible
      expect(run1).not.toEqual(run2);
    });

    it("seeded bracket respects seed order", () => {
      const players = makePlayers(4); // seeds 1,2,3,4
      const matches = BracketGenerator.generate(players, false);
      // Seed 1 should be in match 1
      expect(matches[0]?.player1Id).toBe(players[0]?.id);
    });
  });

  describe("getNextRoundMatch", () => {
    it("match 1 advances to round 2 match 1", () => {
      const next = BracketGenerator.getNextRoundMatch(1, 1);
      expect(next.round).toBe(2);
      expect(next.matchNumber).toBe(1);
    });

    it("match 2 advances to round 2 match 1", () => {
      const next = BracketGenerator.getNextRoundMatch(1, 2);
      expect(next.round).toBe(2);
      expect(next.matchNumber).toBe(1);
    });

    it("match 3 advances to round 2 match 2", () => {
      const next = BracketGenerator.getNextRoundMatch(1, 3);
      expect(next.round).toBe(2);
      expect(next.matchNumber).toBe(2);
    });

    it("match 4 advances to round 2 match 2", () => {
      const next = BracketGenerator.getNextRoundMatch(1, 4);
      expect(next.round).toBe(2);
      expect(next.matchNumber).toBe(2);
    });
  });
});