import { pgTable, uuid, text, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { challenges } from "./challenges";
import { users } from "./users";

export const disputeMediaTypeEnum = pgEnum("dispute_media_type", [
  "IMAGE",
  "VIDEO",
]);

// Evidence a participant uploads (screenshots/clips) once a challenge has
// gone to DISPUTED, so an admin has something concrete to review before
// manually resolving the match. Cascades with the challenge — evidence has
// no reason to outlive the match it was submitted for.
export const disputeEvidence = pgTable("dispute_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => users.id),
  mediaType: disputeMediaTypeEnum("media_type").notNull(),
  mediaUrl: text("media_url").notNull(),
  mediaPublicId: text("media_public_id").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DisputeEvidenceRecord = typeof disputeEvidence.$inferSelect;
