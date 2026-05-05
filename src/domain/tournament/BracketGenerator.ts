// Pure domain logic — generates a single elimination bracket
// No DB, no HTTP. Just math.

export interface Player {
  id: string;
  displayName: string;
  seed?: number;
}

export interface GeneratedMatch {
  round: number;
  matchNumber: number;
  player1Id: string | null;  // null = bye slot
  player2Id: string | null;
  isBye: boolean;
}

export class BracketGenerator {
  // Shuffle array randomly (Fisher-Yates)
  private static shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  // Pad players array to next power of 2 with null (bye) slots
  private static padToPowerOfTwo(players: (Player | null)[]): (Player | null)[] {
    const n = players.length;
    const next = Math.pow(2, Math.ceil(Math.log2(n)));
    const padded = [...players];
    while (padded.length < next) padded.push(null);
    return padded;
  }

  static generate(players: Player[], randomize: boolean): GeneratedMatch[] {
    if (players.length < 2) throw new Error("Need at least 2 players");

    const seeded = randomize
      ? this.shuffle(players)
      : [...players].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));

    const padded = this.padToPowerOfTwo(seeded);
    const totalRounds = Math.log2(padded.length);
    const matches: GeneratedMatch[] = [];
    let matchNumber = 1;

    // Generate Round 1 only — subsequent rounds are created
    // as match results come in
    for (let i = 0; i < padded.length; i += 2) {
      const p1 = padded[i];
      const p2 = padded[i + 1];
      const isBye = p1 === null || p2 === null;

      matches.push({
        round: 1,
        matchNumber: matchNumber++,
        player1Id: p1?.id ?? null,
        player2Id: p2?.id ?? null,
        isBye,
      });
    }

    return matches;
  }

  // Call this after a match result is recorded to create next-round match
  static getNextRoundMatch(
    currentRound: number,
    currentMatchNumber: number,
  ): { round: number; matchNumber: number } {
    return {
      round: currentRound + 1,
      matchNumber: Math.ceil(currentMatchNumber / 2),
    };
  }
}