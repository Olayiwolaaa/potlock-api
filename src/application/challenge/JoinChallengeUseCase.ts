import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
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

interface JoinChallengeInput {
  opponentId: string;
  linkSlug: string;
}

interface JoinChallengeOutput {
  challengeId: string;
  potKobo: number;
  opponentId: string;
}

export interface JoinChallengeError {
  message: string;
  code: string;
}

export class JoinChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly walletRepo: IWalletRepository,
  ) {}

  async execute(
    input: JoinChallengeInput,
  ): Promise<Result<JoinChallengeOutput, JoinChallengeError>> {
    // 1. Resolve the link to a challenge
    const challenge = await this.challengeRepo.findBySlug(input.linkSlug);
    if (!challenge) {
      return err({ message: "Challenge not found", code: "NOT_FOUND" });
    }

    // 2. Run domain validation (expiry, self-join, already-locked-in-memory).
    // This does NOT guarantee exclusivity under concurrency — that's what
    // tryLockForJoin's DB-level WHERE clause is for, below. This step exists
    // to reject obviously-invalid joins before we touch any money at all.
    const joinResult = challenge.join(input.opponentId);
    if (!joinResult.success) {
      return err({ message: joinResult.error.message, code: joinResult.error.code });
    }

    const stake = Money.fromKobo(challenge.stakeKobo);
    
    const wallet = await this.walletRepo.debitAtomic(
      input.opponentId,
      stake.kobo,
    );
    if (!wallet) {
      return err({
        message: "Insufficient wallet balance to join this challenge",
        code: "INSUFFICIENT_FUNDS",
      });
    }
    
    const won = await this.challengeRepo.tryLockForJoin(
      challenge.id,
      input.opponentId,
      challenge.potKobo,
    );
    if (!won) {
      const refunded = await this.walletRepo.creditAtomic(input.opponentId, stake.kobo);
      if (!refunded) {
        
        logger.error(
          { challengeId: challenge.id, opponentId: input.opponentId, amountKobo: stake.kobo },
          "CRITICAL: lost join race but failed to refund opponent's debited stake",
        );
      }
      return err({
        message: "This challenge was just taken by someone else.",
        code: "CHALLENGE_NOT_OPEN",
      });
    }

    // 5. Update vault balance and lock it
    await db
      .update(vaults)
      .set({
        balanceKobo: challenge.potKobo,
        status: "LOCKED",
        updatedAt: new Date(),
      })
      .where(eq(vaults.challengeId, challenge.id));

    // 6. Record transaction
    await db.insert(walletTransactions).values({
      id: randomUUID(),
      walletId: wallet.id,
      amountKobo: stake.kobo,
      type: "DEBIT",
      status: "SUCCESS",
      purpose: "CHALLENGE_STAKE",
      reference: `stake_opponent_${challenge.id}`,
      note: `Stake locked for challenge: ${challenge.title}`,
    });

    await pusher.emitToMany(
      [
        Channels.challenge(challenge.id),
        Channels.user(challenge.creatorId),
      ],
      Events.CHALLENGE_JOINED,
      {
        challengeId: challenge.id,
        opponentId: input.opponentId,
        potKobo: challenge.potKobo,
        status: "LOCKED",
        message: "An opponent has joined. The challenge is now locked.",
        ts: Date.now(),
      },
    );

    return ok({
      challengeId: challenge.id,
      potKobo: challenge.potKobo,
      opponentId: input.opponentId,
    });
  }
}