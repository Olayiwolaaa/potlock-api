import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { walletTransactions } from "@infrastructure/db/schema";
import { logger } from "@infrastructure/logger/logger";

interface FundWalletInput {
  userId: string;
  amountKobo: number;
  paystackReference: string; // the unique ref from Paystack
}

interface FundWalletOutput {
  newBalanceKobo: number;
  transactionId: string;
}

export class FundWalletUseCase {
  constructor(private readonly walletRepo: IWalletRepository) {}

  async execute(input: FundWalletInput): Promise<Result<FundWalletOutput>> {
    const { userId, amountKobo, paystackReference } = input;

    // 1. Find the user's wallet
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) return err("Wallet not found for user");

    const amount = Money.fromKobo(amountKobo);

    // 2. Credit the wallet (business rule enforced by domain)
    const creditResult = wallet.credit(amount);
    if (!creditResult.success) return err(creditResult.error);

    // 3. Persist the updated wallet balance
    await this.walletRepo.save(wallet);

    // 4. Record the transaction for audit trail
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

    logger.info({ userId, amountKobo, reference: paystackReference }, "Wallet funded");

    return ok({
      newBalanceKobo: wallet.balance.kobo,
      transactionId: txId,
    });
  }
}