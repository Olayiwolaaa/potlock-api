import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import {
  challengeBets,
  betEntries,
  walletTransactions,
  challenges,
} from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";
import {
  pusher,
  Channels,
  Events,
} from "@infrastructure/realtime/PusherAdapter";
import { notificationService } from "@infrastructure/realtime/NotificationService";

interface SettleBetInput {
  betId: string;
  // The actual match results to evaluate predictions against
  actualResults: Array<{ matchId: string; winnerId: string }>;
  requesterId: string;
}

export class SettleBetUseCase {
  constructor(private readonly walletRepo: IWalletRepository) {}

  async execute(input: SettleBetInput): Promise<
    Result<{
      outcome: "WINNER_FOUND" | "REFUNDED" | "CLOSEST_WINS";
      winnersCount: number;
    }>
  > {
    const bet = await db
      .select()
      .from(challengeBets)
      .where(eq(challengeBets.id, input.betId))
      .limit(1);

    if (!bet[0]) return err("Bet not found");
    if (bet[0].status === "SETTLED" || bet[0].status === "REFUNDED") {
      return err("Bet already settled");
    }

    // Verify requester is challenge creator
    const challenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, bet[0].challengeId))
      .limit(1);

    if (challenge[0]?.creatorId !== input.requesterId) {
      return err("Only the challenge creator can settle the bet");
    }

    const entries = await db
      .select()
      .from(betEntries)
      .where(eq(betEntries.betId, input.betId));

    // Check minimum bettors met
    if (entries.length < bet[0].minBettors) {
      // Not enough participants — refund everyone
      return this.refundAll(bet[0], entries, "Minimum bettors not reached");
    }

    // Build a result lookup map
    const resultMap = new Map(
      input.actualResults.map((r) => [r.matchId, r.winnerId]),
    );

    // Score each entry
    const scored = entries.map((entry) => {
      const predictions: Array<{ matchId: string; predictedWinnerId: string }> =
        JSON.parse(entry.prediction);

      const correctCount = predictions.filter(
        (p) => resultMap.get(p.matchId) === p.predictedWinnerId,
      ).length;

      return { entry, correctCount, totalPredictions: predictions.length };
    });

    const maxCorrect = Math.max(...scored.map((s) => s.correctCount));
    const perfectScore = scored[0]?.totalPredictions ?? 0;
    const winners = scored.filter((s) => s.correctCount === maxCorrect);

    // REFUND_ALL policy: only pay out if someone got everything right
    if (bet[0].noWinnerPolicy === "REFUND_ALL" && maxCorrect < perfectScore) {
      return this.refundAll(bet[0], entries, "No perfect predictions");
    }

    // CLOSEST_WINS or perfect score found — pay winners
    return this.payWinners(
      bet[0],
      winners.map((w) => w.entry),
      challenge[0]!.creatorId,
      entries,
    );
  }

  private async refundAll(
    bet: typeof challengeBets.$inferSelect,
    entries: (typeof betEntries.$inferSelect)[],
    reason: string,
  ): Promise<Result<{ outcome: "REFUNDED"; winnersCount: number }>> {
    const entryFee = Money.fromKobo(Number(bet.entryFeeKobo));

    // Platform takes 1% even on refunds — covers processing costs
    const platformFee = entryFee.percentOf(100);
    const refundAmount = entryFee.subtract(platformFee);

    for (const entry of entries) {
      const wallet = await this.walletRepo.findByUserId(entry.bettorId);
      if (!wallet) continue;

      wallet.credit(refundAmount);
      await this.walletRepo.save(wallet);

      await db
        .update(betEntries)
        .set({ status: "REFUNDED" })
        .where(eq(betEntries.id, entry.id));

      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: wallet.id,
        amountKobo: refundAmount.kobo,
        type: "CREDIT",
        status: "SUCCESS",
        purpose: "CHALLENGE_WINNINGS",
        reference: `bet_refund_${entry.id}`,
        note: `Bet refund: ${reason}`,
      });
    }

    await db
      .update(challengeBets)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(eq(challengeBets.id, bet.id));

    // In refundAll, after updating bet status:
    await pusher.emit(Channels.bet(bet.id), Events.BET_REFUNDED, {
      betId: bet.id,
      reason,
      refundAmountKobo: refundAmount.kobo,
      ts: Date.now(),
    });

    await notificationService.notifyMany(
      entries.map((e) => e.bettorId),
      Events.BET_REFUNDED,
      () => "Bet refunded",
      () => `Your bet was refunded (${reason}). ${refundAmount.toString()} has been credited back.`,
      { betId: bet.id, reason, refundAmountKobo: refundAmount.kobo },
    );

    logger.info({ betId: bet.id, reason }, "Bet refunded");
    return ok({ outcome: "REFUNDED", winnersCount: 0 });
  }

  private async payWinners(
    bet: typeof challengeBets.$inferSelect,
    winnerEntries: (typeof betEntries.$inferSelect)[],
    creatorId: string,
    allEntries: (typeof betEntries.$inferSelect)[],
  ): Promise<
    Result<{ outcome: "WINNER_FOUND" | "CLOSEST_WINS"; winnersCount: number }>
  > {
    const totalPot = Money.fromKobo(Number(bet.potKobo));

    // Platform fee: 3%
    const platformFee = totalPot.percentOf(300);
    const afterPlatform = totalPot.subtract(platformFee);

    // Creator cut
    const creatorCutBps = bet.creatorCutPercent * 100;
    const creatorCut = afterPlatform.percentOf(creatorCutBps);
    const prizePool = afterPlatform.subtract(creatorCut);

    // Split prize pool equally among winners
    const perWinnerKobo = Math.floor(prizePool.kobo / winnerEntries.length);
    const perWinner = Money.fromKobo(perWinnerKobo);

    // Pay winners
    for (const entry of winnerEntries) {
      const wallet = await this.walletRepo.findByUserId(entry.bettorId);
      if (!wallet) continue;

      wallet.credit(perWinner);
      await this.walletRepo.save(wallet);

      await db
        .update(betEntries)
        .set({ status: "WON" })
        .where(eq(betEntries.id, entry.id));

      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: wallet.id,
        amountKobo: perWinner.kobo,
        type: "CREDIT",
        status: "SUCCESS",
        purpose: "CHALLENGE_WINNINGS",
        reference: `bet_win_${entry.id}`,
        note: `Bet winnings`,
      });
    }

    // Pay creator cut
    const creatorWallet = await this.walletRepo.findByUserId(creatorId);
    if (creatorWallet && creatorCut.kobo > 0) {
      creatorWallet.credit(creatorCut);
      await this.walletRepo.save(creatorWallet);

      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: creatorWallet.id,
        amountKobo: creatorCut.kobo,
        type: "CREDIT",
        status: "SUCCESS",
        purpose: "CHALLENGE_WINNINGS",
        reference: `bet_creator_cut_${bet.id}`,
        note: `Creator cut from bet`,
      });
    }

    // Mark remaining entries as lost
    const winnerIds = new Set(winnerEntries.map((e) => e.id));
    for (const entry of allEntries) {
      if (!winnerIds.has(entry.id)) {
        await db
          .update(betEntries)
          .set({ status: "LOST" })
          .where(eq(betEntries.id, entry.id));
      }
    }

    await db
      .update(challengeBets)
      .set({ status: "SETTLED", updatedAt: new Date() })
      .where(eq(challengeBets.id, bet.id));

    const outcome = winnerEntries.length > 1 ? "CLOSEST_WINS" : "WINNER_FOUND";

    // In payWinners, after updating bet status:
    await pusher.emit(Channels.bet(bet.id), Events.BET_SETTLED, {
      betId: bet.id,
      outcome,
      winnersCount: winnerEntries.length,
      perWinnerKobo,
      ts: Date.now(),
    });

    await Promise.all([
      notificationService.notifyMany(
        winnerEntries.map((e) => e.bettorId),
        Events.BET_SETTLED,
        () => "You won your bet! 🏆",
        () => `${perWinner.toString()} has been credited to your wallet.`,
        { betId: bet.id, outcome, perWinnerKobo, result: "WON" },
      ),
      notificationService.notifyMany(
        allEntries.filter((e) => !winnerIds.has(e.id)).map((e) => e.bettorId),
        Events.BET_SETTLED,
        () => "Bet settled",
        () => "Your bet has been settled — this round didn't go your way.",
        { betId: bet.id, outcome, result: "LOST" },
      ),
    ]);

    logger.info(
      { betId: bet.id, winnersCount: winnerEntries.length },
      "Bet settled",
    );
    return ok({ outcome, winnersCount: winnerEntries.length });
  }
}
