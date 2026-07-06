import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { vaults, walletTransactions, users } from "@infrastructure/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";
import {
  pusher,
  Channels,
  Events,
} from "@infrastructure/realtime/PusherAdapter";
import { notificationService } from "@infrastructure/realtime/NotificationService";

interface SettleInput {
  challengeId: string;
  declarerId: string;
  winnerId: string;
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

    const declareResult = challenge.declareWinner(
      input.declarerId,
      input.winnerId,
    );
    if (!declareResult.success) return err(declareResult.error.message);

    const outcome = declareResult.value;

    await this.challengeRepo.save(challenge);

    if (outcome === "SETTLED") {
      const fees = FeeCalculator.calculateStandardPayout(challenge.potKobo);

      // Atomic credit — prevents double-payout race condition
      const winnerWallet = await this.walletRepo.creditAtomic(
        input.winnerId,
        fees.winnerPayout.kobo,
      );
      if (!winnerWallet) return err("Winner wallet not found");

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

      // Record platform fee transaction
      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: winnerWallet.id,
        amountKobo: fees.platformFee.kobo,
        type: "DEBIT",
        status: "SUCCESS",
        purpose: "PLATFORM_FEE",
        reference: `fee_${challenge.id}`,
        note: `Platform fee for challenge: ${challenge.title}`,
      });

      // Update denormalized win/loss counters. Done here, in the same
      // settlement step as the payout, so the stats shown on profile
      // cards and challenge lists can never drift from actual outcomes.
      const loserId =
        input.winnerId === challenge.creatorId
          ? challenge.opponentId!
          : challenge.creatorId;

      await Promise.all([
        db
          .update(users)
          .set({ wins: sql`${users.wins} + 1`, updatedAt: new Date() })
          .where(eq(users.id, input.winnerId)),
        db
          .update(users)
          .set({ losses: sql`${users.losses} + 1`, updatedAt: new Date() })
          .where(eq(users.id, loserId)),
      ]);

      await pusher.emit(Channels.challenge(challenge.id), Events.CHALLENGE_SETTLED, {
        challengeId: challenge.id,
        winnerId: input.winnerId,
        winnerPayout: fees.winnerPayout.kobo,
        platformFee: fees.platformFee.kobo,
        ts: Date.now(),
      });

      await Promise.all([
        notificationService.notify({
          userId: input.winnerId,
          event: Events.CHALLENGE_SETTLED,
          title: "You won! 🏆",
          message: `You won the challenge "${challenge.title}". ${Money.fromKobo(fees.winnerPayout.kobo).toString()} has been credited.`,
          data: {
            challengeId: challenge.id,
            winnerId: input.winnerId,
            winnerPayout: fees.winnerPayout.kobo,
            outcome: "WON",
          },
        }),
        notificationService.notify({
          userId: loserId,
          event: Events.CHALLENGE_SETTLED,
          title: "Challenge settled",
          message: `You lost the challenge "${challenge.title}".`,
          data: {
            challengeId: challenge.id,
            winnerId: input.winnerId,
            outcome: "LOST",
          },
        }),
      ]);

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

      const participantIds = [challenge.creatorId, challenge.opponentId].filter(
        (id): id is string => Boolean(id),
      );
      await notificationService.notifyMany(
        participantIds,
        Events.CHALLENGE_DISPUTED,
        () => "Challenge disputed",
        () => `Declarations conflict on "${challenge.title}". The vault is frozen pending resolution.`,
        { challengeId: challenge.id },
      );

      logger.warn({ challengeId: challenge.id }, "Challenge disputed");
      return ok({ outcome: "DISPUTED" });
    }

    return ok({ outcome: "WAITING" });
  }
}