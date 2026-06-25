import { db } from "@infrastructure/db/client";
import { challenges, users } from "@infrastructure/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { Result, ok } from "@domain/shared/Result";

interface GetUserChallengesInput {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface ChallengeListItem {
  id: string;
  title: string;
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
}

interface GetUserChallengesOutput {
  challenges: ChallengeListItem[];
  total: number;
}

export class GetUserChallengesUseCase {
  async execute(
    input: GetUserChallengesInput,
  ): Promise<Result<GetUserChallengesOutput>> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    // Fetch all challenges where user is creator OR opponent
    const rows = await db
      .select()
      .from(challenges)
      .where(
        or(
          eq(challenges.creatorId, input.userId),
          eq(challenges.opponentId, input.userId),
        ),
      )
      .orderBy(desc(challenges.createdAt))
      .limit(limit)
      .offset(offset);

    return ok({
      challenges: rows.map((row) => ({
        id: row.id,
        title: row.title,
        platform: row.platform,
        stakeKobo: Number(row.stakeKobo),
        potKobo: Number(row.potKobo),
        status: row.status,
        linkSlug: row.linkSlug,
        role: row.creatorId === input.userId ? "CREATOR" : "OPPONENT",
        creatorId: row.creatorId,
        opponentId: row.opponentId,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      total: rows.length,
    });
  }
}