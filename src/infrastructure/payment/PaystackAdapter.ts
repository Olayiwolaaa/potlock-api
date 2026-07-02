// infrastructure/payment/PaystackAdapter.ts
import { PaystackHttpClient } from "./PaystackHttpClient";

interface PaystackBank {
  name: string;
  code: string;
  slug: string;
  longcode: string;
  active: boolean;
  country: string;
  currency: string;
  type: string;
}

// --- Types ---
export interface InitializePaymentParams {
  email: string;
  amountKobo: number;
  reference: string;
  metadata: {
    userId: string;
    purpose: "wallet_funding";
  };
  callbackUrl?: string;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface VerifyPaymentResult {
  status: "success" | "failed" | "abandoned";
  amountKobo: number;
  reference: string;
  metadata: {
    userId: string;
    purpose: string;
  };
}

export interface VerifyAccountResult {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

export interface CreateRecipientResult {
  recipientCode: string;
  accountName: string;
}

export interface InitiateTransferResult {
  transferCode: string;
  status: "pending" | "success" | "failed";
}

// --- Adapter ---
export class PaystackAdapter extends PaystackHttpClient {
  // Step 1 of funding: create a checkout session
  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult | null> {
    const data = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>("POST", "/transaction/initialize", {
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      metadata: params.metadata,
      callback_url: params.callbackUrl,
    });

    if (!data) return null;

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  // Verify a payment (called in webhook handler)
  async verifyPayment(reference: string): Promise<VerifyPaymentResult | null> {
    const data = await this.request<{
      status: string;
      amount: number;
      reference: string;
      metadata: { userId: string; purpose: string };
    }>("GET", `/transaction/verify/${reference}`);

    if (!data) return null;

    return {
      status: data.status as VerifyPaymentResult["status"],
      amountKobo: data.amount,
      reference: data.reference,
      metadata: data.metadata,
    };
  }

  // Verify bank account before saving it
  async verifyAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<VerifyAccountResult | null> {
    const data = await this.request<{
      account_name: string;
      account_number: string;
    }>(
      "GET",
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    );

    if (!data) return null;

    return {
      accountName: data.account_name,
      accountNumber: data.account_number,
      bankCode,
    };
  }

  async listBanks(): Promise<PaystackBank[]> {
    const data = await this.request<PaystackBank[]>(
      "GET",
      "/bank?country=nigeria&currency=NGN&type=nuban",
    );

    if (!data) return [];

    return data.filter((b) => b.active);
  }

  // Create a transfer recipient (required before sending money)
  async createRecipient(params: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<CreateRecipientResult | null> {
    const data = await this.request<{
      recipient_code: string;
      details: { account_name: string };
    }>("POST", "/transferrecipient", {
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    });

    if (!data) return null;

    return {
      recipientCode: data.recipient_code,
      accountName: data.details.account_name,
    };
  }

  // Send money to a recipient
  async initiateTransfer(params: {
    amountKobo: number;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<InitiateTransferResult | null> {
    const data = await this.request<{
      transfer_code: string;
      status: string;
    }>("POST", "/transfer", {
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    });

    if (!data) return null;

    return {
      transferCode: data.transfer_code,
      status: data.status as InitiateTransferResult["status"],
    };
  }
}