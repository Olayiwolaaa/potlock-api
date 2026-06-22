import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { vaults, walletTransactions } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
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

export class JoinChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly walletRepo: IWalletRepository,
  ) {}

  async execute(
    input: JoinChallengeInput,
  ): Promise<Result<JoinChallengeOutput>> {
    // 1. Resolve the link to a challenge
    const challenge = await this.challengeRepo.findBySlug(input.linkSlug);
    if (!challenge) return err("Challenge not found");

    // 2. Attempt to join — domain enforces all rules
    const joinResult = challenge.join(input.opponentId);
    if (!joinResult.success) return err(joinResult.error.message);

    const stake = Money.fromKobo(challenge.stakeKobo);

    // 3. Atomic debit — prevents double-spend if two opponents click join simultaneously
    const wallet = await this.walletRepo.debitAtomic(
      input.opponentId,
      stake.kobo,
    );
    if (!wallet) {
      return err("Insufficient wallet balance to join this challenge");
    }

    // 4. Save the updated challenge (now LOCKED with opponentId set)
    await this.challengeRepo.save(challenge);

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
