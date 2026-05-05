import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { challengeBets } from "@infrastructure/db/schema";
import { randomUUID } from "crypto";

interface CreateBetInput {
  challengeId: string;
  creatorId: string;
  entryFeeKobo: number;
  minBettors: number;
  maxBettors: number;
  creatorCutPercent: number;
  noWinnerPolicy: "REFUND_ALL" | "CLOSEST_WINS";
}

export class CreateBetUseCase {
  constructor(private readonly challengeRepo: IChallengeRepository) {}

  async execute(input: CreateBetInput): Promise<Result<{ betId: string }>> {
    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");
    if (challenge.creatorId !== input.creatorId) return err("Only the creator can create a bet");
    if (challenge.status === "SETTLED" || challenge.status === "CANCELLED") {
      return err("Cannot add a bet to a finished challenge");
    }

    // Validate cut percentage — cap at 20% to protect bettors
    if (input.creatorCutPercent < 0 || input.creatorCutPercent > 20) {
      return err("Creator cut must be between 0% and 20%");
    }

    if (input.minBettors < 2) return err("Minimum 2 bettors required");
    if (input.maxBettors > 1000) return err("Maximum 1000 bettors");
    if (input.minBettors > input.maxBettors) return err("Min bettors cannot exceed max");

    const betId = randomUUID();
    await db.insert(challengeBets).values({
      id: betId,
      challengeId: input.challengeId,
      entryFeeKobo: input.entryFeeKobo,
      minBettors: input.minBettors,
      maxBettors: input.maxBettors,
      creatorCutPercent: input.creatorCutPercent,
      noWinnerPolicy: input.noWinnerPolicy,
      status: "OPEN",
      potKobo: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return ok({ betId });
  }
}