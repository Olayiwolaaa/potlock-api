import { IUserRepository } from "@domain/user/IUserRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { randomUUID } from "crypto";

interface InitializePaymentInput {
  userId: string;
  amountKobo: number;
}

interface InitializePaymentOutput {
  authorizationUrl: string;  // redirect user here to pay
  reference: string;
}

export class InitializePaymentUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly paystack: PaystackAdapter,
  ) {}

  async execute(input: InitializePaymentInput): Promise<Result<InitializePaymentOutput>> {
    // Minimum funding: ₦1000
    const MIN_AMOUNT = Money.fromNaira(1000);
    if (input.amountKobo < MIN_AMOUNT.kobo) {
      return err(`Minimum funding amount is ${MIN_AMOUNT.toString()}`);
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) return err("User not found");

    // Generate a unique reference for this transaction
    // We'll use this to match the webhook back to this request
    const reference = `fund_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const result = await this.paystack.initializePayment({
      email: user.email,
      amountKobo: input.amountKobo,
      reference,
      metadata: {
        userId: input.userId,
        purpose: "wallet_funding",
      },
    });

    if (!result) return err("Could not initialize payment. Please try again.");

    return ok({
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    });
  }
}