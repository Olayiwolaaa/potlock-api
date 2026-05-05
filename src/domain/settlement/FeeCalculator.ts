import { Money } from "@domain/shared/Money";

// All fee rates expressed in basis points (1% = 100 bps)
const STANDARD_FEE_BPS = 300;    // 3%
const SPONSORED_FEE_BPS = 500;   // 5%
const WITHDRAWAL_FLAT_KOBO = 5000; // ₦50 flat fee

export interface FeeBreakdown {
  grossPot: Money;       // total in vault before fees
  platformFee: Money;    // what we take
  winnerPayout: Money;   // what the winner receives
}

export class FeeCalculator {
  static calculateStandardPayout(potKobo: number): FeeBreakdown {
    const grossPot = Money.fromKobo(potKobo);
    const platformFee = grossPot.percentOf(STANDARD_FEE_BPS);
    const winnerPayout = grossPot.subtract(platformFee);

    return { grossPot, platformFee, winnerPayout };
  }

  static calculateSponsoredPayout(potKobo: number): FeeBreakdown {
    const grossPot = Money.fromKobo(potKobo);
    const platformFee = grossPot.percentOf(SPONSORED_FEE_BPS);
    const winnerPayout = grossPot.subtract(platformFee);

    return { grossPot, platformFee, winnerPayout };
  }

  static withdrawalFee(): Money {
    return Money.fromKobo(WITHDRAWAL_FLAT_KOBO);
  }
}