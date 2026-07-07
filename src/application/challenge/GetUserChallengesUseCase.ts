import { ChallengeRepository } from "@infrastructure/db/repositories/ChallengeRepository";
import { Result, ok } from "@domain/shared/Result";

interface GetUserChallengesInput {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface ChallengeListItem {
  id: string;
  title: string;
  description: string | null;
  platform: "PS" | "XBOX" | "MOBILE" | "PC";
  stakeKobo: number;
  potKobo: number;
  status: string;
  linkSlug: string;
  role: "CREATOR" | "OPPONENT";
  creatorId: string;
  opponentId: string | null;
  expiresAt: string;
  createdAt: string;
  game: {
    name: string;
    imageUrl: string | null;
  };
  creator: {
    displayName: string;
    isVerified: boolean;
    wins: number;
    losses: number;
  };
  myReport: "WON" | "LOST" | null;
  winnerId: string | null;
}

interface GetUserChallengesOutput {
  challenges: ChallengeListItem[];
  total: number;
}

export class GetUserChallengesUseCase {
  constructor(private readonly challengeRepo: ChallengeRepository) {}

  async execute(
    input: GetUserChallengesInput,
  ): Promise<Result<GetUserChallengesOutput>> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const { rows, total } = await this.challengeRepo.findByUserIdWithDetails(
      input.userId,
      { limit, offset },
    );

    return ok({
      challenges: rows,
      total,
    });
  }
}