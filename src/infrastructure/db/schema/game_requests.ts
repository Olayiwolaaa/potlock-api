import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { games } from "./games";

export const gameRequestStatusEnum = pgEnum("game_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const gameRequests = pgTable("game_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedById: uuid("requested_by_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  reason: text("reason").notNull(), // why they want this game
  status: gameRequestStatusEnum("status").default("PENDING").notNull(),
  // Admin who reviewed the request
  reviewedById: uuid("reviewed_by_id").references(() => users.id),
  reviewNote: text("review_note"), // admin's reason for rejection
  // If approved, this links to the created game
  gameId: uuid("game_id").references(() => games.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GameRequestRecord = typeof gameRequests.$inferSelect;