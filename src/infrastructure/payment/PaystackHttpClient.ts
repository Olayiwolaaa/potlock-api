// infrastructure/payment/PaystackHttpClient.ts
import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

export class PaystackHttpClient {
  protected readonly baseUrl = env.PAYSTACK_BASE_URL;
  protected readonly headers = {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();

      if (!res.ok || !data.status) {
        logger.error(
          { path, status: res.status, message: data.message },
          "Paystack error",
        );
        return null;
      }

      return data.data as T;
    } catch (error) {
      logger.error({ path, error }, "Paystack request failed");
      return null;
    }
  }
}