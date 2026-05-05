import {
  pgTable, uuid, text, timestamp,
  pgEnum, integer, boolean,
} from "drizzle-orm/pg-core";
import { challenges } from "./challenges";

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "DRAFT",       // being set up
  "ACTIVE",      // matches being played
  "COMPLETED",   // all matches done
]);

export const matchStatusEnum = pgEnum("match_status", [
  "PENDING",     // not yet played
  "IN_PROGRESS",
  "COMPLETED",
]);

export const bracketTypeEnum = pgEnum("bracket_type", [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",  // Phase 2
]);

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id").notNull().references(() => challenges.id).unique(),
  title: text("title").notNull(),
  bracketType: bracketTypeEnum("bracket_type").default("SINGLE_ELIMINATION").notNull(),
  status: tournamentStatusEnum("status").default("DRAFT").notNull(),
  bracketGenerated: boolean("bracket_generated").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tournamentParticipants = pgTable("tournament_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  userId: uuid("user_id"),
  displayName: text("display_name").notNull(),
  seed: integer("seed"),     // for manual seeding
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournamentMatches = pgTable("tournament_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  round: integer("round").notNull(),            // 1 = first round, 2 = QF, etc.
  matchNumber: integer("match_number").notNull(), // position within the round
  player1Id: uuid("player1_id").references(() => tournamentParticipants.id),
  player2Id: uuid("player2_id").references(() => tournamentParticipants.id),
  winnerId: uuid("winner_id").references(() => tournamentParticipants.id),
  isBye: boolean("is_bye").default(false).notNull(), // player advances without playing
  status: matchStatusEnum("status").default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TournamentRecord = typeof tournaments.$inferSelect;
export type TournamentMatchRecord = typeof tournamentMatches.$inferSelect;
export type TournamentParticipantRecord = typeof tournamentParticipants.$inferSelect;