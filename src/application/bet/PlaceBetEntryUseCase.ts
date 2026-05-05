import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { challengeBets, betEntries, walletTransactions } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";

// A prediction is an array of match picks
export interface MatchPrediction {
  matchId: string;
  predictedWinnerId: string;
}

interface PlaceBetEntryInput {
  betId: string;
  bettorId: string;
  predictions: MatchPrediction[];
}

export class PlaceBetEntryUseCase {
  constructor(private readonly walletRepo: IWalletRepository) {}

  async execute(input: PlaceBetEntryInput): Promise<Result<{ entryId: string }>> {
    // Get the bet
    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.id, input.betId))
      .limit(1);

    if (!bet[0]) return err("Bet not found");
    if (bet[0].status !== "OPEN") return err("This bet is no longer accepting entries");

    // Check max bettors not exceeded
    const existingEntries = await db
      .select()
      .from(betEntries)
      .where(eq(betEntries.betId, input.betId));

    if (existingEntries.length >= bet[0].maxBettors) {
      return err("This bet is full");
    }

    // Check bettor hasn't already entered
    const alreadyEntered = existingEntries.find((e) => e.bettorId === input.bettorId);
    if (alreadyEntered) return err("You have already placed a bet on this challenge");

    // Hash the prediction for uniqueness check
    // Sorted by matchId so order doesn't matter
    const sortedPredictions = [...input.predictions].sort((a, b) =>
      a.matchId.localeCompare(b.matchId),
    );
    const predictionJson = JSON.stringify(sortedPredictions);
    const predictionHash = createHash("sha256").update(predictionJson).digest("hex");

    // Check prediction uniqueness across all entries for this bet
    const duplicatePrediction = existingEntries.find(
      (e) => e.predictionHash === predictionHash,
    );
    if (duplicatePrediction) {
      return err(
        "This exact prediction has already been taken. Please choose different outcomes.",
      );
    }

    // Debit bettor's wallet
    const wallet = await this.walletRepo.findByUserId(input.bettorId);
    if (!wallet) return err("Wallet not found");

    const entryFee = Money.fromKobo(Number(bet[0].entryFeeKobo));
    const debitResult = wallet.debit(entryFee);
    if (!debitResult.success) {
      return err(`Insufficient balance. Entry fee is ${entryFee.toString()}`);
    }

    await this.walletRepo.save(wallet);

    // Update bet pot
    await db
      .update(challengeBets)
      .set({
        potKobo: Number(bet[0].potKobo) + entryFee.kobo,
        updatedAt: new Date(),
      })
      .where(eq(challengeBets.id, input.betId));

    // Record entry
    const entryId = randomUUID();
    await db.insert(betEntries).values({
      id: entryId,
      betId: input.betId,
      bettorId: input.bettorId,
      prediction: predictionJson,
      predictionHash,
      status: "ACTIVE",
      createdAt: new Date(),
    });

    // Record wallet transaction
    await db.insert(walletTransactions).values({
      id: randomUUID(),
      walletId: wallet.id,
      amountKobo: entryFee.kobo,
      type: "DEBIT",
      status: "SUCCESS",
      purpose: "CHALLENGE_STAKE",
      reference: `bet_entry_${entryId}`,
      note: `Bet entry fee`,
    });

    return ok({ entryId });
  }
}