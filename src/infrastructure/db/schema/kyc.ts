import {
  pgTable, uuid, text, timestamp,
  pgEnum, integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { bankAccounts } from "./bank_accounts";

export const kycTierEnum = pgEnum("kyc_tier", ["TIER_0", "TIER_1", "TIER_2", "TIER_3"]);
export const kycStatusEnum = pgEnum("kyc_status", ["PENDING", "VERIFIED", "FAILED"]);

export const kycProfiles = pgTable("kyc_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  tier: kycTierEnum("tier").default("TIER_0").notNull(),

  // Tier 1 — verified via Paystack's Validate Customer (customer identification) flow.
  // BVN is checked against a specific bank account, not standalone, so verification
  // is async: we submit, then wait for a customeridentification.success/failed webhook.
  bvn: text("bvn"),         // store masked: "22*****890"
  bvnStatus: kycStatusEnum("bvn_status").default("PENDING"),
  bvnFailureReason: text("bvn_failure_reason"), // Paystack's data.reason on customeridentification.failed
  paystackCustomerCode: text("paystack_customer_code"), // CUS_xxx — needed to call /customer/:code/identification
  bvnBankAccountId: uuid("bvn_bank_account_id").references(() => bankAccounts.id), // account the BVN was validated against

  // Tier 2
  address: text("address"),
  addressStatus: kycStatusEnum("address_status").default("PENDING"),

  // Daily withdrawal tracking
  dailyWithdrawnKobo: integer("daily_withdrawn_kobo").default(0).notNull(),
  dailyLimitResetAt: timestamp("daily_limit_reset_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KycProfileRecord = typeof kycProfiles.$inferSelect;