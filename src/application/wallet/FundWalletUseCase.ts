import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { walletTransactions } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@infrastructure/logger/logger";
import { Events } from "@infrastructure/realtime/PusherAdapter";
import { notificationService } from "@infrastructure/realtime/NotificationService";

interface FundWalletInput {
  userId: string;
  amountKobo: number;
  paystackReference: string;
}

interface FundWalletOutput {
  newBalanceKobo: number;
  transactionId: string;
}

export class FundWalletUseCase {
  constructor(private readonly walletRepo: IWalletRepository) {}

  async execute(input: FundWalletInput): Promise<Result<FundWalletOutput>> {
    const { userId, amountKobo, paystackReference } = input;

    // Idempotency: check if this reference was already processed
    const existing = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.reference, paystackReference))
      .limit(1);

    if (existing[0]) {
      logger.info({ reference: paystackReference }, "Funding already processed, skipping");
      return err("Payment already processed");
    }

    // Atomic credit — prevents double-credit race condition
    const wallet = await this.walletRepo.creditAtomic(userId, amountKobo);
    if (!wallet) return err("Wallet not found for user");

    // Record the transaction for audit trail
    const txId = crypto.randomUUID();
    await db.insert(walletTransactions).values({
      id: txId,
      walletId: wallet.id,
      amountKobo,
      type: "CREDIT",
      status: "SUCCESS",
      purpose: "WALLET_FUNDING",
      reference: paystackReference,
      note: `Wallet funded via Paystack`,
    });

    await notificationService.notify({
      userId,
      event: Events.WALLET_CREDITED,
      title: "Wallet funded",
      message: `Your wallet has been credited ${Money.fromKobo(amountKobo).toString()}`,
      data: { amountKobo, newBalanceKobo: wallet.balance.kobo, purpose: "WALLET_FUNDING" },
    });

    logger.info(
      { userId, amountKobo, reference: paystackReference },
      "Wallet funded",
    );

    return ok({
      newBalanceKobo: wallet.balance.kobo,
      transactionId: txId,
    });
  }
}
