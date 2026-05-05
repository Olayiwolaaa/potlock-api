import { env } from "@config/env";

interface PaystackVerifyResponse {
  status: boolean;
  data: {
    status: string;           // "success" | "failed"
    amount: number;           // in kobo already
    reference: string;
    metadata: {
      userId: string;         // we'll pass this when initializing payment
    };
  };
}

export class PaystackAdapter {
  private readonly baseUrl = "https://api.paystack.co";
  private readonly headers = {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse["data"] | null> {
    const res = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
      headers: this.headers,
    });

    if (!res.ok) return null;

    const data: PaystackVerifyResponse = await res.json();
    return data.status ? data.data : null;
  }
}