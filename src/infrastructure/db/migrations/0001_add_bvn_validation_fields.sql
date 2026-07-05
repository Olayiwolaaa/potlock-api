ALTER TABLE "kyc_profiles" ADD COLUMN "bvn_failure_reason" text;--> statement-breakpoint
ALTER TABLE "kyc_profiles" ADD COLUMN "paystack_customer_code" text;--> statement-breakpoint
ALTER TABLE "kyc_profiles" ADD COLUMN "bvn_bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_bvn_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bvn_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;
