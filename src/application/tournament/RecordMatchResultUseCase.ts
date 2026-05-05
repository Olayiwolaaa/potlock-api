import { Result, ok, err } from "@domain/shared/Result";
import { BracketGenerator } from "@domain/tournament/BracketGenerator";
import { db } from "@infrastructure/db/client";
import {
  tournaments, tournamentMatches, tournamentParticipants, challenges,
} from "@infrastructure/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface RecordMatchResultInput {
  tournamentId: string;
  matchId: string;
  winnerId: string;   // participantId of the winner
  requesterId: string; // must be challenge creator
}

export class RecordMatchResultUseCase {
  async execute(input: RecordMatchResultInput): Promise<Result<{ advancedTo: string | null }>> {
    // Verify tournament exists and requester is challenge creator
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, input.tournamentId))
      .limit(1);

    if (!tournament[0]) return err("Tournament not found");

    // Verify via challenge
    const challenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, tournament[0].challengeId))
      .limit(1);

    if (challenge[0]?.creatorId !== input.requesterId) {
      return err("Only the challenge creator can record results");
    }

    // Get the match
    const match = await db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, input.matchId))
      .limit(1);

    if (!match[0]) return err("Match not found");
    if (match[0].status === "COMPLETED") return err("Match already completed");

    // Validate winner is a participant in this match
    if (match[0].player1Id !== input.winnerId && match[0].player2Id !== input.winnerId) {
      return err("Winner must be a participant in this match");
    }

    // Record result
    await db
      .update(tournamentMatches)
      .set({ winnerId: input.winnerId, status: "COMPLETED", updatedAt: new Date() })
      .where(eq(tournamentMatches.id, input.matchId));

    // Check if there are more matches in this round
    const nextRoundInfo = BracketGenerator.getNextRoundMatch(
      match[0].round,
      match[0].matchNumber,
    );

    // Find the paired match (the other match that feeds into the same next-round slot)
    const pairedMatchNumber = match[0].matchNumber % 2 === 1
      ? match[0].matchNumber + 1
      : match[0].matchNumber - 1;

    const pairedMatch = await db
      .select()
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.tournamentId, input.tournamentId),
          eq(tournamentMatches.round, match[0].round),
        ),
      );

    const paired = pairedMatch.find((m) => m.matchNumber === pairedMatchNumber);

    // If paired match is also complete, create the next round match
    if (paired?.status === "COMPLETED" && paired.winnerId) {
      const nextMatchId = randomUUID();
      await db.insert(tournamentMatches).values({
        id: nextMatchId,
        tournamentId: input.tournamentId,
        round: nextRoundInfo.round,
        matchNumber: nextRoundInfo.matchNumber,
        player1Id: input.winnerId,
        player2Id: paired.winnerId,
        isBye: false,
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return ok({ advancedTo: nextMatchId });
    }

    return ok({ advancedTo: null });
  }
}