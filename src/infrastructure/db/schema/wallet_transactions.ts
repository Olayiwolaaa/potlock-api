import { pgTable, uuid, bigint, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { wallets } from "./wallets";

// These are the only valid transaction types
export const transactionTypeEnum = pgEnum("transaction_type", [
  "CREDIT",   // money coming in  (funding wallet, winning a challenge)
  "DEBIT",    // money going out  (joining a challenge, withdrawing)
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",    // initiated but not confirmed
  "SUCCESS",    // confirmed and settled
  "FAILED",     // something went wrong
]);

export const transactionPurposeEnum = pgEnum("transaction_purpose", [
  "WALLET_FUNDING",       // user topped up via Paystack
  "WITHDRAWAL",           // user withdrew to bank
  "CHALLENGE_STAKE",      // user's stake locked into a vault
  "CHALLENGE_WINNINGS",   // winner received payout
  "PLATFORM_FEE",         // our cut
  "SPONSOR_INJECTION",    // brand added to a vault
]);

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").default("PENDING").notNull(),
  purpose: transactionPurposeEnum("purpose").notNull(),
  reference: text("reference").notNull().unique(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WalletTransactionRecord = typeof walletTransactions.$inferSelect;