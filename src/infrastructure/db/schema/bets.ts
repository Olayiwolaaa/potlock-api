import {
  pgTable, uuid, bigint, text,
  timestamp, pgEnum, integer, boolean, unique,
} from "drizzle-orm/pg-core";
import { challenges } from "./challenges";
import { users } from "./users";

export const betStatusEnum = pgEnum("bet_status", [
  "OPEN",       // accepting entries
  "CLOSED",     // no more entries (challenge locked)
  "SETTLED",    // winner paid out
  "REFUNDED",   // no winner policy triggered
]);

export const betEntryStatusEnum = pgEnum("bet_entry_status", [
  "ACTIVE",
  "WON",
  "LOST",
  "REFUNDED",
]);

export const noWinnerPolicyEnum = pgEnum("no_winner_policy", [
  "REFUND_ALL",     // everyone gets stake back minus platform fee
  "CLOSEST_WINS",   // most correct predictions wins
]);

export const challengeBets = pgTable("challenge_bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id").notNull().references(() => challenges.id).unique(),

  entryFeeKobo: bigint("entry_fee_kobo", { mode: "number" }).notNull(),
  minBettors: integer("min_bettors").default(2).notNull(),
  maxBettors: integer("max_bettors").default(100).notNull(),

  // What % of the bet prize pool the challenge creator earns
  creatorCutPercent: integer("creator_cut_percent").default(10).notNull(),

  noWinnerPolicy: noWinnerPolicyEnum("no_winner_policy").default("REFUND_ALL").notNull(),
  status: betStatusEnum("status").default("OPEN").notNull(),

  // Total pot accumulated from entry fees
  potKobo: bigint("pot_kobo", { mode: "number" }).default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const betEntries = pgTable("bet_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  betId: uuid("bet_id").notNull().references(() => challengeBets.id),
  bettorId: uuid("bettor_id").notNull().references(() => users.id),

  // JSON prediction — structure depends on bet type
  // For tournaments: [{ matchId, predictedWinnerId }, ...]
  prediction: text("prediction").notNull(),

  // Hash of the prediction for fast uniqueness checks
  predictionHash: text("prediction_hash").notNull(),

  status: betEntryStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
},
// Enforce uniqueness: same bet cannot have same prediction twice
(table) => ({
  uniquePrediction: unique().on(table.betId, table.predictionHash),
  // One entry per bettor per bet
  uniqueBettor: unique().on(table.betId, table.bettorId),
}));

export type ChallengeBetRecord = typeof challengeBets.$inferSelect;
export type BetEntryRecord = typeof betEntries.$inferSelect;