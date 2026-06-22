import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { FeeCalculator } from "@domain/settlement/FeeCalculator";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { bankAccounts, walletTransactions } from "@infrastructure/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";
import { kycProfiles } from "@infrastructure/db/schema";
import { getDailyLimit, KycTier } from "@domain/kyc/KycTier";

interface WithdrawInput {
  userId: string;
  amountKobo: number;
  bankAccountId: string;
}

interface WithdrawOutput {
  reference: string;
  amountKobo: number;
  feeKobo: number;
  netAmountKobo: number;
}

export class WithdrawUseCase {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly paystack: PaystackAdapter,
  ) {}

  async execute(input: WithdrawInput): Promise<Result<WithdrawOutput>> {
    const MIN_WITHDRAWAL = Money.fromNaira(500);
    const requestedAmount = Money.fromKobo(input.amountKobo);

    if (requestedAmount.kobo < MIN_WITHDRAWAL.kobo) {
      return err(`Minimum withdrawal is ${MIN_WITHDRAWAL.toString()}`);
    }

    // 1. KYC check FIRST — before any money movement
    const kyc = await db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, input.userId))
      .limit(1);

    const userTier = (kyc[0]?.tier ?? "TIER_0") as KycTier;
    const dailyLimit = getDailyLimit(userTier);

    if (dailyLimit.kobo === 0) {
      return err("Please verify your BVN to enable withdrawals.");
    }

    // 2. Daily limit check BEFORE debiting
    const now = new Date();
    const resetAt = kyc[0]?.dailyLimitResetAt ?? new Date(0);
    const needsReset = now.toDateString() !== resetAt.toDateString();
    const alreadyWithdrawnKobo = needsReset
      ? 0
      : (kyc[0]?.dailyWithdrawnKobo ?? 0);
    const newTotalKobo = alreadyWithdrawnKobo + requestedAmount.kobo;

    if (newTotalKobo > dailyLimit.kobo) {
      const remaining = Money.fromKobo(dailyLimit.kobo - alreadyWithdrawnKobo);
      return err(
        `Daily withdrawal limit reached. You can withdraw ${remaining.toString()} more today. Verify your address to increase your limit.`,
      );
    }

    // 3. Verify bank account belongs to this user
    const bankAccount = await db
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.bankAccountId),
          eq(bankAccounts.userId, input.userId),
        ),
      )
      .limit(1);

    if (!bankAccount[0]) return err("Bank account not found");

    // 4. Calculate fee and total debit
    const fee = FeeCalculator.withdrawalFee();
    const totalDebit = requestedAmount.add(fee);

    // 5. Atomic debit — prevents double-spend race condition
    const wallet = await this.walletRepo.debitAtomic(
      input.userId,
      totalDebit.kobo,
    );
    if (!wallet) {
      return err(
        `Insufficient balance. You need ${totalDebit.toString()} (including ₦50 fee).`,
      );
    }

    // 6. Initiate the Paystack transfer
    const reference = `wd_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const transfer = await this.paystack.initiateTransfer({
      amountKobo: requestedAmount.kobo,
      recipientCode: bankAccount[0].paystackRecipientCode,
      reference,
      reason: "PotLockNg withdrawal",
    });

    if (!transfer) {
      // Paystack failed — reverse the debit atomically
      await this.walletRepo.creditAtomic(input.userId, totalDebit.kobo);
      return err(
        "Transfer failed. Your balance has been restored. Please try again.",
      );
    }

    // 7. Record the transaction
    await db.insert(walletTransactions).values({
      id: randomUUID(),
      walletId: wallet.id,
      amountKobo: totalDebit.kobo,
      type: "DEBIT",
      status: "PENDING",
      purpose: "WITHDRAWAL",
      reference,
      note: `Withdrawal to ${bankAccount[0].bankName} ${bankAccount[0].accountNumber}`,
    });

    // 8. Update daily withdrawal tracker
    await db
      .update(kycProfiles)
      .set({
        dailyWithdrawnKobo: newTotalKobo,
        dailyLimitResetAt: needsReset ? now : resetAt,
        updatedAt: now,
      })
      .where(eq(kycProfiles.userId, input.userId));

    logger.info(
      { userId: input.userId, amountKobo: requestedAmount.kobo, reference },
      "Withdrawal initiated",
    );

    return ok({
      reference,
      amountKobo: requestedAmount.kobo,
      feeKobo: fee.kobo,
      netAmountKobo: requestedAmount.kobo,
    });
  }
}
