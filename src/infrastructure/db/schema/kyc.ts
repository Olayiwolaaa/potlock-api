import {
  pgTable, uuid, text, timestamp,
  pgEnum, integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const kycTierEnum = pgEnum("kyc_tier", ["TIER_0", "TIER_1", "TIER_2", "TIER_3"]);
export const kycStatusEnum = pgEnum("kyc_status", ["PENDING", "VERIFIED", "FAILED"]);

export const kycProfiles = pgTable("kyc_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  tier: kycTierEnum("tier").default("TIER_0").notNull(),

  // Tier 1
  bvn: text("bvn"),         // store masked: "22*****890"
  bvnStatus: kycStatusEnum("bvn_status").default("PENDING"),

  // Tier 2
  address: text("address"),
  addressStatus: kycStatusEnum("address_status").default("PENDING"),

  // Daily withdrawal tracking
  dailyWithdrawnKobo: integer("daily_withdrawn_kobo").default(0).notNull(),
  dailyLimitResetAt: timestamp("daily_limit_reset_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KycProfileRecord = typeof kycProfiles.$inferSelect;