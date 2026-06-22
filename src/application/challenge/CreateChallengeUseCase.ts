import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Challenge } from "@domain/challenge/Challenge";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { vaults, walletTransactions } from "@infrastructure/db/schema";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";
import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys, CacheTTL } from "@infrastructure/cache/CacheKeys";

interface CreateChallengeInput {
  creatorId: string;
  title: string;
  description?: string;
  stakeKobo: number;
  expiresInHours: number;
  gameId?: string;
  coverImageBuffer?: Buffer;
  coverImageMimeType?: string;
}

interface CreateChallengeOutput {
  challengeId: string;
  linkSlug: string;
  shareUrl: string;
  stakeKobo: number;
}

export class CreateChallengeUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly storage?: CloudinaryAdapter,
  ) {}

  async execute(
    input: CreateChallengeInput,
  ): Promise<Result<CreateChallengeOutput>> {
    // 1. Validate stake amount
    const MIN_STAKE = Money.fromNaira(100);
    const stake = Money.fromKobo(input.stakeKobo);

    if (stake.kobo < MIN_STAKE.kobo) {
      return err(`Minimum stake is ${MIN_STAKE.toString()}`);
    }

    // 2. Upload cover image before touching money (fail fast)
    let coverImageUrl: string | null = null;
    let coverImagePublicId: string | null = null;

    if (input.coverImageBuffer && input.coverImageMimeType && this.storage) {
      const validation = CloudinaryAdapter.validateImage(
        input.coverImageBuffer,
        input.coverImageMimeType,
      );
      if (!validation.valid) return err(validation.error!);

      const uploaded = await this.storage.uploadBuffer(
        input.coverImageBuffer,
        "potlockng/challenges",
        { maxWidth: 1200, maxHeight: 630 },
      );

      if (!uploaded) return err("Cover image upload failed");
      coverImageUrl = uploaded.url;
      coverImagePublicId = uploaded.publicId;
    }

    // 3. Atomic debit — prevents double-spend if user spams create
    const wallet = await this.walletRepo.debitAtomic(
      input.creatorId,
      stake.kobo,
    );
    if (!wallet) {
      return err("Insufficient wallet balance to create this challenge");
    }

    // 4. Create the challenge
    const challengeId = randomUUID();
    const linkSlug = nanoid(8);
    const expiresAt = new Date(
      Date.now() + input.expiresInHours * 60 * 60 * 1000,
    );

    const challenge = Challenge.create({
      id: challengeId,
      creatorId: input.creatorId,
      opponentId: null,
      stakeKobo: stake.kobo,
      potKobo: stake.kobo,
      status: "OPEN",
      linkSlug,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      expiresAt,
      declaredWinnerId: null,
      opponentDeclaredWinnerId: null,
      createdAt: new Date(),
    });

    await this.challengeRepo.create(challenge);

    // 5. Create the vault to hold the escrowed funds
    await db.insert(vaults).values({
      id: randomUUID(),
      challengeId,
      balanceKobo: stake.kobo,
      status: "ACCUMULATING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Record the wallet transaction
    await db.insert(walletTransactions).values({
      id: randomUUID(),
      walletId: wallet.id,
      amountKobo: stake.kobo,
      type: "DEBIT",
      status: "SUCCESS",
      purpose: "CHALLENGE_STAKE",
      reference: `stake_${challengeId}`,
      note: `Stake locked for challenge: ${input.title}`,
    });

    return ok({
      challengeId,
      linkSlug,
      shareUrl: `/c/${linkSlug}`,
      stakeKobo: stake.kobo,
    });
  }
}
