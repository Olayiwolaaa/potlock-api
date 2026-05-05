import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

export interface BvnVerificationResult {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  bvn: string;
}

export class PaystackIdentityAdapter {
  private readonly baseUrl = "https://api.paystack.co";
  private readonly headers = {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };

  async verifyBvn(bvn: string): Promise<BvnVerificationResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/identity/bvn/match`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ bvn }),
      });

      const data = await res.json();
      if (!res.ok || !data.status) {
        logger.error({ message: data.message }, "BVN verification failed");
        return null;
      }

      return {
        firstName: data.data.first_name,
        lastName: data.data.last_name,
        dateOfBirth: data.data.dob,
        phoneNumber: data.data.mobile,
        bvn: data.data.bvn,
      };
    } catch (error) {
      logger.error({ error }, "BVN verification error");
      return null;
    }
  }
}