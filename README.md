# PotLockNg (Working Title)

**The Decentralized Wagering & Escrow Engine for the Nigerian Content Creator Economy.**

PotLockNg is a high-trust social wagering platform designed to act as a neutral "digital judge." It allows TikTok streamers, iMessage gamers, and tournament organizers to create secure "Challenge Vaults" where participants lock in wagers and sponsors boost prize pools. By moving funds into a secure escrow, PotLockNg eliminates "trust-based" payment issues and professionalizes social betting.

## The Vision
To provide the financial infrastructure for the booming Nigerian entertainment sector, allowing creators to monetize their skills and engagement through high-stakes, spectator-friendly wagering.

## Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS, Framer Motion.
- **Backend:** Node.js (Hono/Fastify) or Laravel.
- **Database:** PostgreSQL with Drizzle ORM.
- **Payments:** Paystack / Flutterwave Integration.
- **Real-time:** Pusher (for live pot updates and join notifications).
- **Auth:** Better Auth or NextAuth.js.

## System Architecture

### 1. The Challenge Vault
The core unit of the application. A vault governs the lifecycle of a single wager:
- **Creation:** Host sets wager amount and rules.
- **Funding:** Participants and Sponsors deposit NGN into the vault.
- **Lock State:** Funds are frozen once the match requirements are met.
- **Settlement:** Funds are disbursed based on participant consensus or dispute resolution.

### 2. Revenue Model (Passive Income)
The platform operates on a **Fee-on-Settlement** logic:
- **Standard Wagers:** 3% platform fee on the total pot.
- **Sponsored Events:** 5% platform fee on sponsorship injections.
- **Withdrawal:** Flat ₦50 processing fee per payout.

## Features & Roadmap

### Phase 1: MVP (Current)
- [ ] **One-Click Challenge Links:** Shareable URLs for social media bios.
- [ ] **Escrow Wallet:** Deposit/Withdrawal system via Paystack.
- [ ] **Sponsorship Tier:** Public "Boost" button for external funding.
- [ ] **Manual Reporting:** Simple "Winner/Loser" consensus button for participants.

### Phase 2: Reputation & Scaling
- [ ] **Reputation Score:** Users gain "Trust Points" for honest reporting.
- [ ] **Dispute Jury:** Community-led resolution for conflicted results.
- [ ] **Brand Dashboard:** Analytics for sponsors to track their ROI and impressions.

### Phase 3: Automation
- [ ] **AI Screenshot Verification:** Automated winner detection via OCR.
- [ ] **API Integrations:** Direct hooks for popular gaming platforms.

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Olayiwolaaa/potlockng-api.git