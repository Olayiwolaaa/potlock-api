import { pgTable, text, timestamp, uuid, smallint } from "drizzle-orm/pg-core";
import { users } from "./users";

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});