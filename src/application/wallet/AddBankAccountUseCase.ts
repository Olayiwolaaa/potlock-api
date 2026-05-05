import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { db } from "@infrastructure/db/client";
import { bankAccounts } from "@infrastructure/db/schema";
import { eq, and } from "drizzle-orm";
import { Result, ok, err } from "@domain/shared/Result";
import { randomUUID } from "crypto";

interface AddBankAccountInput {
  userId: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  setAsDefault: boolean;
}

interface AddBankAccountOutput {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isDefault: boolean;
}

export class AddBankAccountUseCase {
  constructor(private readonly paystack: PaystackAdapter) {}

  async execute(input: AddBankAccountInput): Promise<Result<AddBankAccountOutput>> {
    // 1. Verify the account actually exists with the bank
    const verified = await this.paystack.verifyAccount(
      input.accountNumber,
      input.bankCode,
    );
    if (!verified) {
      return err("Could not verify bank account. Check the details and try again.");
    }

    // 2. Create a Paystack transfer recipient
    // This is required to send money to this account later
    const recipient = await this.paystack.createRecipient({
      accountName: verified.accountName,
      accountNumber: verified.accountNumber,
      bankCode: input.bankCode,
    });
    if (!recipient) return err("Failed to register bank account. Please try again.");

    // 3. If this is their first/default account, unset any existing default
    if (input.setAsDefault) {
      await db
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(eq(bankAccounts.userId, input.userId));
    }

    // 4. Save the bank account
    const id = randomUUID();
    await db.insert(bankAccounts).values({
      id,
      userId: input.userId,
      bankCode: input.bankCode,
      bankName: input.bankName,
      accountNumber: verified.accountNumber,
      accountName: verified.accountName,
      paystackRecipientCode: recipient.recipientCode,
      isDefault: input.setAsDefault,
      createdAt: new Date(),
    });

    return ok({
      id,
      accountName: verified.accountName,
      accountNumber: verified.accountNumber,
      bankName: input.bankName,
      isDefault: input.setAsDefault,
    });
  }
}