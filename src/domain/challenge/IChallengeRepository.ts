import { Challenge } from "./Challenge";

export type Platform = "PS" | "XBOX" | "MOBILE" | "PC";

export interface OpenChallengeSummary {
  id: string;
  title: string;
  // No raw `description` here on purpose — this backs the public arena
  // browse list (unauthenticated, bulk). By definition every row here is
  // still OPEN, i.e. nobody has joined yet, so there is no legitimate
  // viewer for the description at this stage. `hasDescription` lets the
  // UI show a "rules attached" hint without leaking the content.
  hasDescription: boolean;
  platform: Platform;
  stakeKobo: number;
  potKobo: number;
  status: string;
  linkSlug: string;
  creatorUsername: string;
  gameName: string | null;
  gameImageUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface UserChallengeSummary {
  id: string;
  title: string;
  // Safe to always include here: this endpoint only ever returns challenges
  // where the caller is the creator or an opponent who has already joined
  // (opponentId is null until a join happens), so anyone seeing this row
  // is entitled to see the description.
  description: string | null;
  platform: Platform;
  stakeKobo: number;
  potKobo: number;
  status: string;
  linkSlug: string;
  role: "CREATOR" | "OPPONENT";
  creatorId: string;
  opponentId: string | null;
  expiresAt: string;
  createdAt: string;
  game: { name: string; imageUrl: string | null };
  creator: { displayName: string; isVerified: boolean; wins: number; losses: number };
}

export interface ChallengeWithDetails {
  challenge: Challenge;
  creator: {
    username: string | null;
    displayName: string | null;
    isVerified: boolean;
    profileImageUrl: string | null;
    wins: number;
    losses: number;
  };
  game: { name: string; imageUrl: string | null; description: string | null } | null;
}

export interface IChallengeRepository {
  findById(id: string): Promise<Challenge | null>;
  findBySlug(slug: string): Promise<Challenge | null>;
  findBySlugWithCreatorUsername(
    slug: string,
  ): Promise<{ challenge: Challenge; creatorUsername: string | null } | null>;
  findBySlugWithDetails(slug: string): Promise<ChallengeWithDetails | null>;
  findByCreatorId(creatorId: string): Promise<Challenge[]>;
  create(challenge: Challenge): Promise<void>;
  save(challenge: Challenge): Promise<void>;
  /**
   * Atomically claims the OPEN slot on a challenge for `opponentId`.
   * Only succeeds (returns true) if the challenge is still OPEN at the
   * moment the UPDATE runs — the DB's WHERE clause is the source of truth,
   * not any in-memory check. If two people accept the same challenge at
   * the same instant, exactly one call returns true; the other returns
   * false and the caller is expected to refund whatever was already
   * debited rather than silently overwriting the winner's join.
   */
  tryLockForJoin(
    challengeId: string,
    opponentId: string,
    potKobo: number,
  ): Promise<boolean>;
  findOpenChallenges(opts: {
    limit: number;
    offset: number;
    gameSlug?: string;
    platform?: Platform;
  }): Promise<{ challenges: OpenChallengeSummary[]; total: number }>;
  findByUserIdWithDetails(
    userId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ rows: UserChallengeSummary[]; total: number }>;
}