import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
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
const fundWallet = new FundWalletUseCase(walletRepo);

webhookRoutes.post("/paystack", async (c) => {
  logger.info("Incoming Paystack webhook");
  const signature = c.req.header("x-paystack-signature");
  if (!signature) {
    logger.warn("Rejected webhook: missing signature header");
    return c.json({ error: "Missing signature" }, 401);
  }

  const rawBody = await c.req.text();

  const expectedSig = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // signature header is attacker-controlled — guard against non-hex input
  // throwing inside Buffer.from before we get a chance to reject it cleanly.
  let sigBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(signature, "hex");
  } catch {
    logger.warn("Rejected webhook: malformed signature header");
    return c.json({ error: "Invalid signature" }, 401);
  }
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    logger.warn("Rejected webhook: invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    logger.warn("Rejected webhook: malformed JSON body");
    return c.json({ error: "Invalid payload" }, 400);
  }

  logger.info({ event: event.event }, "Paystack webhook received");

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
  const { reference } = data;

  const [original] = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, reference))
    .limit(1);

  if (!original) {
    logger.error(
      { reference, amount: data.amount },
      "CRITICAL: Transfer failed but no matching transaction found — manual reconciliation required",
    );
    return;
  }

  if (original.status === "FAILED") {
    logger.info({ reference }, "Transfer failure already reconciled, skipping");
    return;
  }

  // Guard against double-refund
  const refundReference = `refund_${reference}`;
  const existingRefund = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, refundReference))
    .limit(1);

  if (existingRefund[0]) {
    logger.info({ reference, refundReference }, "Refund already issued, skipping");
    return;
  }

  // Look up the wallet to get the userId (we only have walletId from the transaction)
  const wallet = await walletRepo.findById(original.walletId);
  if (!wallet) {
    logger.error(
      { reference, walletId: original.walletId },
      "CRITICAL: Wallet not found for refund — manual reconciliation required",
    );
    return;
  }

  // Atomically credit the user's wallet
  const refunded = await walletRepo.creditAtomic(wallet.userId, original.amountKobo);
  if (!refunded) {
    logger.error(
      { reference, userId: wallet.userId },
      "CRITICAL: Refund credit failed — manual reconciliation required",
    );
    return;
  }

  // Record the refund transaction
  await db.insert(walletTransactions).values({
    id: crypto.randomUUID(),
    walletId: original.walletId,
    amountKobo: original.amountKobo,
    type: "CREDIT",
    status: "SUCCESS",
    purpose: "WITHDRAWAL",
    reference: refundReference,
    note: `Auto-refund for failed transfer: ${reference}`,
  });

  // Mark the original withdrawal as failed
  await db
    .update(walletTransactions)
    .set({ status: "FAILED" })
    .where(eq(walletTransactions.reference, reference));

  logger.warn(
    { reference, refundReference, userId: wallet.userId, amountKobo: original.amountKobo },
    "Transfer failed — wallet automatically refunded",
  );
}

export { webhookRoutes };