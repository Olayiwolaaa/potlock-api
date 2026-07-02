import { Challenge } from "./Challenge";

export type Platform = "PS" | "XBOX" | "MOBILE" | "PC";   // ← local, explicit — stops the Bun.Platform collision

export interface OpenChallengeSummary {
  id: string;
  title: string;
  description: string | null;
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

export interface IChallengeRepository {
  findById(id: string): Promise<Challenge | null>;
  findBySlug(slug: string): Promise<Challenge | null>;
  findBySlugWithCreatorUsername(
    slug: string,
  ): Promise<{ challenge: Challenge; creatorUsername: string | null } | null>;
  findByCreatorId(creatorId: string): Promise<Challenge[]>;
  create(challenge: Challenge): Promise<void>;
  save(challenge: Challenge): Promise<void>;
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