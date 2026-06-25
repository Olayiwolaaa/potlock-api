import { eq } from "drizzle-orm";
import { db } from "../client";
import { challenges } from "../schema";
import { Challenge, ChallengeStatus } from "@domain/challenge/Challenge";
import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys, CacheTTL } from "@infrastructure/cache/CacheKeys";

export class ChallengeRepository implements IChallengeRepository {
  private toDomain(record: typeof challenges.$inferSelect): Challenge {
    return Challenge.create({
      id: record.id,
      creatorId: record.creatorId,
      opponentId: record.opponentId,
      platform: record.platform as "PS" | "XBOX" | "MOBILE" | "PC",
      stakeKobo: Number(record.stakeKobo),
      potKobo: Number(record.potKobo),
      status: record.status as ChallengeStatus,
      linkSlug: record.linkSlug,
      title: record.title,
      description: record.description,
      expiresAt: record.expiresAt,
      declaredWinnerId: record.declaredWinnerId,
      opponentDeclaredWinnerId: record.opponentDeclaredWinnerId,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<Challenge | null> {
    const result = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findBySlug(slug: string): Promise<Challenge | null> {
    return redis.getOrSet(
      CacheKeys.challengeBySlug(slug),
      async () => {
        const result = await db
          .select()
          .from(challenges)
          .where(eq(challenges.linkSlug, slug))
          .limit(1);
        return result[0] ? this.toDomain(result[0]) : null;
      },
      CacheTTL.CHALLENGE_SLUG,
    );
  }

  async findByCreatorId(creatorId: string): Promise<Challenge[]> {
    const result = await db
      .select()
      .from(challenges)
      .where(eq(challenges.creatorId, creatorId));
    return result.map(this.toDomain.bind(this));
  }

  async create(challenge: Challenge): Promise<void> {
    const record = challenge.toRecord();
    await db.insert(challenges).values({
      ...record,
      updatedAt: new Date(),
    });
  }

  async save(challenge: Challenge): Promise<void> {
    const record = challenge.toRecord();
    await db
      .update(challenges)
      .set({ ...record, updatedAt: new Date() })
      .where(eq(challenges.id, record.id));

    await redis.del(CacheKeys.challengeBySlug(record.linkSlug));
  }
}
