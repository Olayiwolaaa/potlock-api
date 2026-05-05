import { db } from "@infrastructure/db/client";
import { challenges, vaults, walletTransactions, wallets } from "@infrastructure/db/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";

export class ExpireChallengesUseCase {
  async execute(): Promise<{ expired: number; refunded: number }> {
    const now = new Date();

    // Find all OPEN challenges past their expiry
    const expiredOpen = await db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.status, "OPEN"),
          lt(challenges.expiresAt, now),
        ),
      );

    if (expiredOpen.length === 0) return { expired: 0, refunded: 0 };

    let refunded = 0;

    for (const challenge of expiredOpen) {
      // Get creator's wallet
      const creatorWallet = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, challenge.creatorId))
        .limit(1);

      if (!creatorWallet[0]) continue;

      const stakeKobo = Number(challenge.stakeKobo);

      // Refund creator
      await db
        .update(wallets)
        .set({
          balanceKobo: Number(creatorWallet[0].balanceKobo) + stakeKobo,
          updatedAt: now,
        })
        .where(eq(wallets.id, creatorWallet[0].id));

      // Mark challenge cancelled
      await db
        .update(challenges)
        .set({ status: "CANCELLED", updatedAt: now })
        .where(eq(challenges.id, challenge.id));

      // Mark vault refunded
      await db
        .update(vaults)
        .set({ status: "REFUNDED", balanceKobo: 0, updatedAt: now })
        .where(eq(vaults.challengeId, challenge.id));

      // Record transaction
      await db.insert(walletTransactions).values({
        id: randomUUID(),
        walletId: creatorWallet[0].id,
        amountKobo: stakeKobo,
        type: "CREDIT",
        status: "SUCCESS",
        purpose: "WALLET_FUNDING",
        reference: `refund_expire_${challenge.id}`,
        note: `Refund: challenge expired "${challenge.title}"`,
      });

      refunded++;
    }

    logger.info({ expired: expiredOpen.length, refunded }, "Expired challenges processed");
    return { expired: expiredOpen.length, refunded };
  }
}