import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys, CacheTTL } from "@infrastructure/cache/CacheKeys";
import { db } from "@infrastructure/db/client";
import { games } from "@infrastructure/db/schema";
import { eq, asc } from "drizzle-orm";
import { Result, ok } from "@domain/shared/Result";

export interface GameListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
}

export class ListGamesUseCase {
  async execute(): Promise<Result<GameListItem[]>> {
    const list = await redis.getOrSet<GameListItem[]>(
      CacheKeys.allGames(),
      async () => {
        const rows = await db
          .select()
          .from(games)
          .where(eq(games.status, "ACTIVE"))
          .orderBy(asc(games.name));

        return rows.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          description: g.description,
          imageUrl: g.imageUrl,
        }));
      },
      CacheTTL.GAMES_LIST,
    );

    return ok(list);
  }
}