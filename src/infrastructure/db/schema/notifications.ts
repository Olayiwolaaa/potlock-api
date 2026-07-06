import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// One row per event a specific user should see in their notification bell.
// This mirrors (a subset of) the realtime Pusher events — see
// `@infrastructure/realtime/PusherAdapter` for the live event catalog and
// `@infrastructure/realtime/NotificationService` for what actually writes here.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    // Matches one of the `Events` values in PusherAdapter, e.g. "challenge.joined"
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    // Raw payload that was also sent over Pusher — lets the client deep-link
    // (e.g. { challengeId } -> /c/:slug) without re-fetching.
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Notification bell always queries "give me this user's most recent N,
    // and separately give me their unread count" — both filter on userId
    // and sort/filter on the other columns, so a composite index pays off.
    userCreatedIdx: index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    userReadIdx: index("notifications_user_read_idx").on(
      table.userId,
      table.read,
    ),
  }),
);

export type NotificationRecord = typeof notifications.$inferSelect;
