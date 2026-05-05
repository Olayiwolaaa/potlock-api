import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { BracketGenerator, Player } from "@domain/tournament/BracketGenerator";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import {
  tournaments,
  tournamentParticipants,
  tournamentMatches,
} from "@infrastructure/db/schema";
import { randomUUID } from "crypto";

interface CreateTournamentInput {
  challengeId: string;
  creatorId: string;
  title: string;
  players: Array<{ displayName: string; userId?: string; seed?: number }>;
  autoGenerateBracket: boolean;
}

interface CreateTournamentOutput {
  tournamentId: string;
  matches: Array<{
    round: number;
    matchNumber: number;
    player1Name: string | null;
    player2Name: string | null;
    isBye: boolean;
  }>;
}

export class CreateTournamentUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: CreateTournamentInput): Promise<Result<CreateTournamentOutput>> {
    if (input.players.length < 2) return err("Need at least 2 players");
    if (input.players.length > 32) return err("Maximum 32 players per tournament");

    // Verify the challenge exists and belongs to requester
    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");
    if (challenge.creatorId !== input.creatorId) return err("Only the creator can set up the tournament");

    const tournamentId = randomUUID();

    // Create tournament record
    await db.insert(tournaments).values({
      id: tournamentId,
      challengeId: input.challengeId,
      title: input.title,
      bracketType: "SINGLE_ELIMINATION",
      status: "DRAFT",
      bracketGenerated: input.autoGenerateBracket,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create participant records
    const participantMap = new Map<string, string>(); // displayName → participantId

    for (const player of input.players) {
      const participantId = randomUUID();
      await db.insert(tournamentParticipants).values({
        id: participantId,
        tournamentId,
        userId: player.userId ?? null,
        displayName: player.displayName,
        seed: player.seed ?? null,
        createdAt: new Date(),
      });
      participantMap.set(player.displayName, participantId);
    }

    // Generate bracket
    const players: Player[] = input.players.map((p) => ({
      id: participantMap.get(p.displayName)!,
      displayName: p.displayName,
      seed: p.seed,
    }));

    const generatedMatches = BracketGenerator.generate(
      players,
      input.autoGenerateBracket,
    );

    // Persist matches
    for (const match of generatedMatches) {
      await db.insert(tournamentMatches).values({
        id: randomUUID(),
        tournamentId,
        round: match.round,
        matchNumber: match.matchNumber,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winnerId: match.isBye ? match.player1Id : null,
        isBye: match.isBye,
        status: match.isBye ? "COMPLETED" : "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Map back to display names for response
    const participantNames = new Map<string, string>();
    for (const [name, id] of participantMap) {
      participantNames.set(id, name);
    }

    return ok({
      tournamentId,
      matches: generatedMatches.map((m) => ({
        round: m.round,
        matchNumber: m.matchNumber,
        player1Name: m.player1Id ? (participantNames.get(m.player1Id) ?? null) : null,
        player2Name: m.player2Id ? (participantNames.get(m.player2Id) ?? null) : null,
        isBye: m.isBye,
      })),
    });
  }
}