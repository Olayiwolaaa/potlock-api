import {
  pgTable,
  uuid,
  bigint,
  text,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { games } from "./games";

export const challengeStatusEnum = pgEnum("challenge_status", [
  "OPEN",
  "LOCKED",
  "SETTLED",
  "DISPUTED",
  "CANCELLED",
]);

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  opponentId: uuid("opponent_id").references(() => users.id),
  gameId: uuid("game_id").references(() => games.id),
  coverImageUrl: text("cover_image_url"),
  coverImagePublicId: text("cover_image_public_id"),
  stakeKobo: bigint("stake_kobo", { mode: "number" }).notNull(),
  potKobo: bigint("pot_kobo", { mode: "number" }).notNull(),
  status: challengeStatusEnum("status").default("OPEN").notNull(),
  linkSlug: text("link_slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  expiresAt: timestamp("expires_at").notNull(),
  declaredWinnerId: uuid("declared_winner_id").references(() => users.id),
  opponentDeclaredWinnerId: uuid("opponent_declared_winner_id").references(
    () => users.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ChallengeRecord = typeof challenges.$inferSelect;
