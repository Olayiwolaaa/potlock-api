import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { vaults, walletTransactions } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";
import {
  pusher,
  Channels,
  Events,
} from "@infrastructure/realtime/PusherAdapter";

interface SettleInput {
  challengeId: string;
  declarerId: string; // who is submitting the result
  winnerId: string; // who they say won
}

interface SettleOutput {
  outcome: "SETTLED" | "DISPUTED" | "WAITING";
  winnerPayout?: number;
  platformFee?: number;
}

export class SettleChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly walletRepo: IWalletRepository,
  ) {}

  async execute(input: SettleInput): Promise<Result<SettleOutput>> {
    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");

    // Domain enforces who can declare and validates the winner
    const declareResult = challenge.declareWinner(
      input.declarerId,
      input.winnerId,
    );
    if (!declareResult.success) return err(declareResult.error.message);

    const outcome = declareResult.value;

    // Save the updated declaration state regardless of outcome
    await this.challengeRepo.save(challenge);

    // Both declared the same winner — settle immediately
    if (outcome === "SETTLED") {
      const fees = FeeCalculator.calculateStandardPayout(challenge.potKobo);

      // Credit winner's wallet
      const winnerWallet = await this.walletRepo.findByUserId(input.winnerId);
      if (!winnerWallet) return err("Winner wallet not found");

      winnerWallet.credit(fees.winnerPayout);
      await this.walletRepo.save(winnerWallet);

      // Release the vault
      await db
        .update(vaults)
        .set({ status: "RELEASED", updatedAt: new Date() })
        .where(eq(vaults.challengeId, challenge.id));

      // Record payout transaction
      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: winnerWallet.id,
        amountKobo: fees.winnerPayout.kobo,
        type: "CREDIT",
        status: "SUCCESS",
        purpose: "CHALLENGE_WINNINGS",
        reference: `payout_${challenge.id}`,
        note: `Won challenge: ${challenge.title}`,
      });

      // Record platform fee transaction (for accounting)
      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: winnerWallet.id, // placeholder — in prod this goes to a platform wallet
        amountKobo: fees.platformFee.kobo,
        type: "DEBIT",
        status: "SUCCESS",
        purpose: "PLATFORM_FEE",
        reference: `fee_${challenge.id}`,
        note: `Platform fee for challenge: ${challenge.title}`,
      });

      // After crediting winner and updating vault (in the SETTLED branch):
      await pusher.emitToMany(
        [
          Channels.challenge(challenge.id),
          Channels.user(input.winnerId), // winner gets personal notification
          Channels.user(
            input.winnerId === challenge.creatorId // notify the loser too
              ? challenge.opponentId!
              : challenge.creatorId,
          ),
        ],
        Events.CHALLENGE_SETTLED,
        {
          challengeId: challenge.id,
          winnerId: input.winnerId,
          winnerPayout: fees.winnerPayout.kobo,
          platformFee: fees.platformFee.kobo,
          ts: Date.now(),
        },
      );

      logger.info(
        { challengeId: challenge.id, winnerId: input.winnerId },
        "Challenge settled",
      );

      return ok({
        outcome: "SETTLED",
        winnerPayout: fees.winnerPayout.kobo,
        platformFee: fees.platformFee.kobo,
      });
    }

    // Both declared different winners — freeze vault
    if (outcome === "DISPUTED") {
      await db
        .update(vaults)
        .set({ status: "FROZEN", updatedAt: new Date() })
        .where(eq(vaults.challengeId, challenge.id));

      await pusher.emit(
        Channels.challenge(challenge.id),
        Events.CHALLENGE_DISPUTED,
        {
          challengeId: challenge.id,
          message:
            "Declarations conflict. The vault is frozen pending resolution.",
          ts: Date.now(),
        },
      );

      logger.warn({ challengeId: challenge.id }, "Challenge disputed");
      return ok({ outcome: "DISPUTED" });
    }

    // Only one person declared so far
    return ok({ outcome: "WAITING" });
  }
}
