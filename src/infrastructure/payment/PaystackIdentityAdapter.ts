// infrastructure/payment/PaystackIdentityAdapter.ts
import { PaystackHttpClient } from "./PaystackHttpClient";

export interface BvnVerificationResult {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  bvn: string;
}

interface PaystackBvnResolveResponse {
  bvn: string;
  first_name: string;
  last_name: string;
  dob: string;
  mobile: string;
}

export class PaystackIdentityAdapter extends PaystackHttpClient {
  /**
   * Resolves BVN details directly via Paystack's legacy BVN Resolve endpoint.
   * NOTE: this endpoint is being deprecated in favor of the async
   * "Validate Customer" flow — confirm your Paystack account still has
   * access before relying on this in production.
   */
  async verifyBvn(bvn: string): Promise<BvnVerificationResult | null> {
    const data = await this.request<PaystackBvnResolveResponse>(
      "GET",
      `/bank/resolve_bvn/${bvn}`,
    );

    if (!data) return null;

    return {
      firstName: data.first_name,
      lastName: data.last_name,
      dateOfBirth: data.dob,
      phoneNumber: data.mobile,
      bvn: data.bvn,
    };
  }
}