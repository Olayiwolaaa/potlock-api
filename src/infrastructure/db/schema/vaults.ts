import { pgTable, uuid, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { challenges } from "./challenges";

export const vaultStatusEnum = pgEnum("vault_status", [
  "ACCUMULATING", // accepting deposits
  "LOCKED",       // all funds in, no more deposits
  "RELEASED",     // funds paid out to winner
  "FROZEN",       // disputed, no movement allowed
  "REFUNDED",     // challenge cancelled, everyone got their stake back
]);

export const vaults = pgTable("vaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id").notNull().references(() => challenges.id).unique(),
  balanceKobo: bigint("balance_kobo", { mode: "number" }).default(0).notNull(),
  status: vaultStatusEnum("status").default("ACCUMULATING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type VaultRecord = typeof vaults.$inferSelect;