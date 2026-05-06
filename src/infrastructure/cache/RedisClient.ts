import Redis from "ioredis";
import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

class RedisAdapter {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Never crash the app if Redis is unavailable
      // Cache misses are fine — the DB is the source of truth
      reconnectOnError: () => true,
    });

    this.client.on("connect", () => {
      this.isConnected = true;
      logger.info("Redis connected");
    });

    this.client.on("error", (err) => {
      this.isConnected = false;
      logger.error({ err }, "Redis error — cache disabled");
    });
  }

  async connect() {
    await this.client.connect();
  }

  // ── Core operations ───────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.error({ key, err }, "Redis GET failed");
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      logger.error({ key, err }, "Redis SET failed");
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (err) {
      logger.error({ key, err }, "Redis DEL failed");
    }
  }

  // Delete all keys matching a pattern e.g. "games:*"
  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (err) {
      logger.error({ pattern, err }, "Redis DEL pattern failed");
    }
  }

  // ── Cache-aside helper ────────────────────────────────────────────────────
  // Try cache first, fall back to DB fetch, populate cache on miss
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}

// Singleton
export const redis = new RedisAdapter();