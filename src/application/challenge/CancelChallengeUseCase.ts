import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Result, ok, err } from "@domain/shared/Result";
import { Money } from "@domain/shared/Money";
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

interface CancelChallengeInput {
  challengeId: string;
  requesterId: string;
}

export class CancelChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly walletRepo: IWalletRepository,
  ) {}

  async execute(input: CancelChallengeInput): Promise<Result<void>> {
    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");

    // Domain enforces: only creator can cancel, only OPEN challenges
    const cancelResult = challenge.cancel(input.requesterId);
    if (!cancelResult.success) return err(cancelResult.error.message);

    // Refund creator's stake
    const creatorWallet = await this.walletRepo.findByUserId(
      challenge.creatorId,
    );
    if (!creatorWallet) return err("Creator wallet not found");

    const stake = Money.fromKobo(challenge.stakeKobo);
    creatorWallet.credit(stake);
    await this.walletRepo.save(creatorWallet);

    // Save the cancelled challenge
    await this.challengeRepo.save(challenge);

    // Update vault to refunded
    await db
      .update(vaults)
      .set({ status: "REFUNDED", balanceKobo: 0, updatedAt: new Date() })
      .where(eq(vaults.challengeId, challenge.id));

    // Record refund transaction
    await db.insert(walletTransactions).values({
      id: randomUUID(),
      walletId: creatorWallet.id,
      amountKobo: stake.kobo,
      type: "CREDIT",
      status: "SUCCESS",
      purpose: "WALLET_FUNDING",
      reference: `refund_cancel_${challenge.id}`,
      note: `Refund: cancelled challenge "${challenge.title}"`,
    });

    await pusher.emit(
      Channels.user(challenge.creatorId),
      Events.CHALLENGE_CANCELLED,
      {
        challengeId: challenge.id,
        refundedKobo: stake.kobo,
        message: "Challenge cancelled. Your stake has been refunded.",
        ts: Date.now(),
      },
    );

    logger.info(
      { challengeId: challenge.id },
      "Challenge cancelled and refunded",
    );
    return ok(undefined);
  }
}
