import { Money } from "@domain/shared/Money";

// Paystack Nigeria KYC tier limits
export const KYC_DAILY_LIMITS = {
  TIER_0: Money.fromNaira(0),           // cannot withdraw without BVN
  TIER_1: Money.fromNaira(50_000),      // ₦50,000/day with BVN
  TIER_2: Money.fromNaira(200_000),     // ₦200,000/day with address
  TIER_3: Money.fromNaira(5_000_000),   // ₦5M/day full KYC
} as const;

export type KycTier = keyof typeof KYC_DAILY_LIMITS;

export function getDailyLimit(tier: KycTier): Money {
  return KYC_DAILY_LIMITS[tier];
}