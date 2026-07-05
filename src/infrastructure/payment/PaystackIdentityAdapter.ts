// infrastructure/payment/PaystackIdentityAdapter.ts
import { PaystackHttpClient } from "./PaystackHttpClient";

/**
 * BVN identity verification via Paystack.
 *
 * Paystack no longer offers a standalone BVN lookup for new integrations
 * (the old GET /bank/resolve_bvn/:bvn and /bank/match_bvn endpoints are gone
 * from the current API). The supported replacement is the "Validate Customer"
 * flow: https://paystack.com/docs/identity-verification/validate-customer/
 *
 * That flow:
 *  1. Requires a Paystack Customer object (POST /customer) — created once
 *     per user and reused.
 *  2. Validates the BVN against a *specific bank account* — not standalone.
 *     You must already have a resolved account_number + bank_code.
 *  3. Is asynchronous. The POST call only acknowledges that verification has
 *     started ("Customer Identification in progress"). The actual result
 *     arrives later via a `customeridentification.success` or
 *     `customeridentification.failed` webhook event.
 *
 * Paystack's docs explicitly call this out as required for Betting,
 * Financial Services, and General Services merchants — i.e. this app.
 */

interface PaystackCustomerResponse {
  id: number;
  customer_code: string;
  email: string;
  identified: boolean;
}

export interface PaystackCustomer {
  id: number;
  customerCode: string;
  email: string;
}

export class PaystackIdentityAdapter extends PaystackHttpClient {
  /**
   * Creates a Paystack customer for this user.
   * A customer is required before you can call the identification endpoint.
   */
  async createCustomer(params: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<PaystackCustomer | null> {
    const data = await this.request<PaystackCustomerResponse>(
      "POST",
      "/customer",
      {
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        phone: params.phone,
      },
    );

    if (!data) return null;

    return {
      id: data.id,
      customerCode: data.customer_code,
      email: data.email,
    };
  }

  /**
   * Kicks off BVN validation against a specific bank account.
   *
   * IMPORTANT: this does NOT return whether the BVN is valid. It only
   * confirms that Paystack accepted the request ("in progress"). The real
   * result comes later via the customeridentification.success/failed
   * webhook — the caller must handle that separately.
   *
   * Returns true if Paystack accepted the request, false otherwise
   * (e.g. malformed input, rejected before the async check even started).
   */
  async submitBankAccountIdentification(params: {
    customerCode: string;
    bvn: string;
    bankCode: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
  }): Promise<boolean> {
    // Note: this response has no `data` payload — just { status, message } —
    // so we only care whether the call was accepted (non-null), not its shape.
    const data = await this.request<unknown>(
      "POST",
      `/customer/${params.customerCode}/identification`,
      {
        country: "NG",
        type: "bank_account",
        bvn: params.bvn,
        bank_code: params.bankCode,
        account_number: params.accountNumber,
        first_name: params.firstName,
        last_name: params.lastName,
      },
    );

    return data !== null;
  }
}
