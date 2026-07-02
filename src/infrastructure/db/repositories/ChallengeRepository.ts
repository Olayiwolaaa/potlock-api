import { desc, and, eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import { challenges, games, users } from "../schema";
import { Challenge, ChallengeStatus } from "@domain/challenge/Challenge";
import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys, CacheTTL } from "@infrastructure/cache/CacheKeys";
import { alias } from "drizzle-orm/pg-core";

type Platform = "PS" | "XBOX" | "MOBILE" | "PC";

// Aliased so we can join `users` twice in the same query (creator + opponent)
const opponents = alias(users, "opponents");

export class ChallengeRepository implements IChallengeRepository {
  private toDomain(record: typeof challenges.$inferSelect): Challenge {
    return Challenge.create({
      id: record.id,
      creatorId: record.creatorId,
      opponentId: record.opponentId,
      platform: record.platform as Platform,
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

  async findBySlugWithCreatorUsername(
    slug: string,
  ): Promise<{ challenge: Challenge; creatorUsername: string | null } | null> {
    const result = await db
      .select({
        challenge: challenges,
        creatorUsername: users.displayName,
      })
      .from(challenges)
      .leftJoin(users, eq(challenges.creatorId, users.id))
      .where(eq(challenges.linkSlug, slug))
      .limit(1);

    if (!result[0]) return null;

    return {
      challenge: this.toDomain(result[0].challenge),
      creatorUsername: result[0].creatorUsername ?? null,
    };
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

  async findOpenChallenges(opts: {
    limit: number;
    offset: number;
    gameSlug?: string;
    platform?: Platform;
  }) {
    const conditions = [eq(challenges.status, "OPEN")];

    if (opts.platform) {
      conditions.push(eq(challenges.platform, opts.platform));
    }

    const baseQuery = db
      .select({
        id: challenges.id,
        title: challenges.title,
        description: challenges.description,
        platform: challenges.platform,
        stakeKobo: challenges.stakeKobo,
        potKobo: challenges.potKobo,
        status: challenges.status,
        linkSlug: challenges.linkSlug,
        creatorUsername: sql<string>`coalesce(${users.displayName}, 'Unknown')`,
        gameName: games.name,
        gameImageUrl: games.imageUrl,
        expiresAt: challenges.expiresAt,
        createdAt: challenges.createdAt,
      })
      .from(challenges)
      .leftJoin(users, eq(challenges.creatorId, users.id))
      .leftJoin(games, eq(challenges.gameId, games.id));

    if (opts.gameSlug) {
      conditions.push(eq(games.slug, opts.gameSlug));
    }

    const withConditions = baseQuery.where(and(...conditions));

    const [rows, countResult] = await Promise.all([
      withConditions
        .orderBy(desc(challenges.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(challenges)
        .leftJoin(games, eq(challenges.gameId, games.id))
        .where(and(...conditions)),
    ]);

    return {
      challenges: rows.map((r) => ({
        ...r,
        stakeKobo: Number(r.stakeKobo),
        potKobo: Number(r.potKobo),
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  // Backs GET /my. Joins games + the creator's user record (with
  // win/loss counters) so the frontend gets everything it renders —
  // game name/image, creator display name, verification, and W/L —
  // without a second round trip per row.
  //
  // Note: this intentionally surfaces the CREATOR's profile (not the
  // viewing user's own profile, and not the opponent's) — that's what
  // both frontend components actually render per-card today. If you
  // later need the opponent's profile too (e.g. when role === "OPPONENT"
  // and you want to show who you're playing against), this query already
  // joins `opponents` via the alias below; just select from it.
  async findByUserIdWithDetails(
    userId: string,
    opts: { limit: number; offset: number },
  ) {
    const condition = or(
      eq(challenges.creatorId, userId),
      eq(challenges.opponentId, userId),
    );

    const baseQuery = db
      .select({
        id: challenges.id,
        title: challenges.title,
        platform: challenges.platform,
        stakeKobo: challenges.stakeKobo,
        potKobo: challenges.potKobo,
        status: challenges.status,
        linkSlug: challenges.linkSlug,
        creatorId: challenges.creatorId,
        opponentId: challenges.opponentId,
        expiresAt: challenges.expiresAt,
        createdAt: challenges.createdAt,
        gameName: games.name,
        gameImageUrl: games.imageUrl,
        creatorDisplayName: users.displayName,
        creatorIsVerified: users.isVerified,
        creatorWins: users.wins,
        creatorLosses: users.losses,
      })
      .from(challenges)
      .leftJoin(games, eq(challenges.gameId, games.id))
      .leftJoin(users, eq(challenges.creatorId, users.id))
      .leftJoin(opponents, eq(challenges.opponentId, opponents.id));

    const [rows, countResult] = await Promise.all([
      baseQuery
        .where(condition)
        .orderBy(desc(challenges.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(challenges)
        .where(condition),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        platform: r.platform as Platform,
        stakeKobo: Number(r.stakeKobo),
        potKobo: Number(r.potKobo),
        status: r.status,
        linkSlug: r.linkSlug,
        role: (r.creatorId === userId ? "CREATOR" : "OPPONENT") as
          | "CREATOR"
          | "OPPONENT",
        creatorId: r.creatorId,
        opponentId: r.opponentId,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        game: {
          name: r.gameName ?? "Unknown Game",
          imageUrl: r.gameImageUrl ?? null,
        },
        creator: {
          displayName: r.creatorDisplayName ?? "Player",
          isVerified: r.creatorIsVerified ?? false,
          wins: r.creatorWins ?? 0,
          losses: r.creatorLosses ?? 0,
        },
      })),
      total: Number(countResult[0]?.count ?? 0),
    };
  }
}