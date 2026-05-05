import { Hono } from "hono";
import { createHmac } from "crypto";
import { env } from "@config/env";
import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { FundWalletUseCase } from "@application/wallet/FundWalletUseCase";
import { logger } from "@infrastructure/logger/logger";

const webhookRoutes = new Hono();
const paystack = new PaystackAdapter();
const walletRepo = new WalletRepository();
const fundWallet = new FundWalletUseCase(walletRepo);

webhookRoutes.post("/paystack", async (c) => {
  // Step 1: Verify the request actually came from Paystack
  const signature = c.req.header("x-paystack-signature");
  const rawBody = await c.req.text();

  const expectedSignature = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    logger.warn("Invalid Paystack webhook signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody);

  // Step 2: Only handle the event we care about right now
  if (event.event !== "charge.success") {
    return c.json({ received: true }); // acknowledge but ignore
  }

  const { reference, amount, metadata } = event.data;
  const userId = metadata?.userId;

  if (!userId) {
    logger.error({ reference }, "Webhook missing userId in metadata");
    return c.json({ received: true });
  }

  // Step 3: Call the use case
  const result = await fundWallet.execute({
    userId,
    amountKobo: amount,
    paystackReference: reference,
  });

  if (!result.success) {
    logger.error({ reference, error: result.error }, "Failed to fund wallet");
    // Still return 200 — Paystack will retry on non-200 responses
  }

  // Always return 200 to Paystack immediately
  return c.json({ received: true });
});

export { webhookRoutes };