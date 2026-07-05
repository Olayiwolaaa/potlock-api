import { db } from "@infrastructure/db/client";
import { kycProfiles, bankAccounts, users } from "@infrastructure/db/schema";
import { PaystackIdentityAdapter } from "@infrastructure/payment/PaystackIdentityAdapter";
import { Result, ok, err } from "@domain/shared/Result";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface SubmitBvnInput {
  userId: string;
  bvn: string;
  bankAccountId: string; // BVN is validated against a specific saved bank account
}

interface SubmitBvnOutput {
  status: "PENDING";
  message: string;
}

// Paystack validates a BVN against a specific bank account name, so we split
// the bank's own account name (not the app's free-text display name) into
// first/last — it's the closest thing we have to the name on file with the BVN.
function splitAccountName(accountName: string): { firstName: string; lastName: string } {
  const parts = accountName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? accountName.trim();
  const lastName = parts.length > 1 ? parts[parts.length - 1] ?? firstName : firstName;
  return { firstName, lastName };
}

export class SubmitBvnUseCase {
  constructor(private readonly identity: PaystackIdentityAdapter) {}

  async execute(input: SubmitBvnInput): Promise<Result<SubmitBvnOutput>> {
    // Basic BVN format check — 11 digits
    if (!/^\d{11}$/.test(input.bvn)) {
      return err("BVN must be 11 digits");
    }

    // The bank account must belong to this user and already be verified
    // (added via AddBankAccountUseCase, which resolves it with Paystack).
    const [bankAccount] = await db
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.bankAccountId),
          eq(bankAccounts.userId, input.userId),
        ),
      )
      .limit(1);

    if (!bankAccount) {
      return err("Bank account not found. Add and verify a bank account first.");
    }

    // Fetch the user for email (needed to create/reuse a Paystack customer)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!user) {
      return err("User not found");
    }

    const existing = await db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, input.userId))
      .limit(1);

    // Reuse an existing Paystack customer code if we already created one for this user
    let customerCode = existing[0]?.paystackCustomerCode ?? null;

    if (!customerCode) {
      const { firstName, lastName } = splitAccountName(bankAccount.accountName);
      const customer = await this.identity.createCustomer({
        email: user.email,
        firstName,
        lastName,
        phone: user.phoneNumber ?? undefined,
      });

      if (!customer) {
        return err("Could not start BVN verification. Please try again.");
      }

      customerCode = customer.customerCode;
    }

    const { firstName, lastName } = splitAccountName(bankAccount.accountName);

    const accepted = await this.identity.submitBankAccountIdentification({
      customerCode,
      bvn: input.bvn,
      bankCode: bankAccount.bankCode,
      accountNumber: bankAccount.accountNumber,
      firstName,
      lastName,
    });

    if (!accepted) {
      return err("Could not submit BVN for verification. Please check the number and try again.");
    }

    // Mask BVN before storing — never store raw BVN
    const maskedBvn = `${input.bvn.slice(0, 2)}*******${input.bvn.slice(-2)}`;

    // Verification is async — status stays PENDING until the
    // customeridentification.success/failed webhook arrives.
    if (existing[0]) {
      await db
        .update(kycProfiles)
        .set({
          bvn: maskedBvn,
          bvnStatus: "PENDING",
          bvnFailureReason: null,
          paystackCustomerCode: customerCode,
          bvnBankAccountId: input.bankAccountId,
          updatedAt: new Date(),
        })
        .where(eq(kycProfiles.userId, input.userId));
    } else {
      await db.insert(kycProfiles).values({
        id: randomUUID(),
        userId: input.userId,
        bvn: maskedBvn,
        bvnStatus: "PENDING",
        paystackCustomerCode: customerCode,
        bvnBankAccountId: input.bankAccountId,
        tier: "TIER_0",
        dailyWithdrawnKobo: 0,
        dailyLimitResetAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return ok({
      status: "PENDING",
      message:
        "BVN submitted for verification. This usually completes within a few minutes — check /kyc/status for the result.",
    });
  }
}
