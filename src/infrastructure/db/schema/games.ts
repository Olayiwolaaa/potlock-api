import { pgTable, uuid, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

export const gameStatusEnum = pgEnum("game_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(), // e.g. "8-ball-pool"
  description: text("description"),
  imageUrl: text("image_url"),
  imagePublicId: text("image_public_id"),
  status: gameStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GameRecord = typeof games.$inferSelect;