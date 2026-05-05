import { Hono } from "hono";
import { createHmac } from "crypto";
import { env } from "@config/env";
import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { UserRepository } from "@infrastructure/db/repositories/UserRepository";
import { FundWalletUseCase } from "@application/wallet/FundWalletUseCase";
import { logger } from "@infrastructure/logger/logger";
import { db } from "@infrastructure/db/client";
import { walletTransactions } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";

const webhookRoutes = new Hono();
const paystack = new PaystackAdapter();
const walletRepo = new WalletRepository();
const userRepo = new UserRepository();
const fundWallet = new FundWalletUseCase(walletRepo);

webhookRoutes.post("/paystack", async (c) => {
  logger.info("Incoming Paystack webhook");
  const signature = c.req.header("x-paystack-signature");
  const rawBody = await c.req.text();

  const expectedSig = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // TEMP DEBUG — remove after fixing
  logger.info({
    receivedSig: signature,
    expectedSig,
    secret: env.PAYSTACK_WEBHOOK_SECRET,
    match: signature === expectedSig,
  }, "Webhook signature debug");

  if (signature !== expectedSig) {
    logger.warn("Rejected webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody);
  logger.info({ event: event.event }, "Paystack webhook received");

  // 2. Route to the right handler
  switch (event.event) {
    case "charge.success":
      await handleChargeSuccess(event.data);
      break;

    case "transfer.success":
      await handleTransferSuccess(event.data);
      break;

    case "transfer.failed":
    case "transfer.reversed":
      await handleTransferFailed(event.data);
      break;

    default:
      // Acknowledge but ignore events we don't handle yet
      logger.info({ event: event.event }, "Unhandled webhook event");
  }

  // Always return 200 immediately — Paystack retries on non-200
  return c.json({ received: true });
});

async function handleChargeSuccess(data: {
  reference: string;
  amount: number;
  metadata: { userId: string; purpose: string };
}) {
  const { reference, amount, metadata } = data;

  // Idempotency: check if we already processed this reference
  const existing = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, reference))
    .limit(1);

  if (existing[0]) {
    logger.info({ reference }, "Webhook already processed, skipping");
    return;
  }

  if (metadata?.purpose !== "wallet_funding") return;

  // Verify independently — never trust webhook data alone
  const verified = await paystack.verifyPayment(reference);
  if (!verified || verified.status !== "success") {
    logger.error({ reference }, "Payment verification failed");
    return;
  }

  const result = await fundWallet.execute({
    userId: metadata.userId,
    amountKobo: verified.amountKobo,
    paystackReference: reference,
  });

  if (!result.success) {
    logger.error({ reference, error: result.error }, "Failed to fund wallet");
  }
}

async function handleTransferSuccess(data: { reference: string }) {
  // Mark the withdrawal transaction as confirmed
  await db
    .update(walletTransactions)
    .set({ status: "SUCCESS" })
    .where(eq(walletTransactions.reference, data.reference));

  logger.info({ reference: data.reference }, "Transfer confirmed");
}

async function handleTransferFailed(data: { reference: string; amount: number }) {
  // Transfer failed after we already debited the wallet — we need to refund
  // In production this would trigger a careful reconciliation process
  // For now we log it clearly so you can handle it manually
  logger.error(
    { reference: data.reference, amount: data.amount },
    "CRITICAL: Transfer failed — manual reconciliation required",
  );

  await db
    .update(walletTransactions)
    .set({ status: "FAILED" })
    .where(eq(walletTransactions.reference, data.reference));
}

export { webhookRoutes };