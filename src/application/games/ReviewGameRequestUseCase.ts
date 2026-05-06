import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys } from "@infrastructure/cache/CacheKeys";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { gameRequests, games } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

interface ReviewGameRequestInput {
  requestId: string;
  adminId: string;
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string;
  // Required when approving — admin provides the game image
  imageBuffer?: Buffer;
  imageMimeType?: string;
}

export class ReviewGameRequestUseCase {
  constructor(private readonly storage: CloudinaryAdapter) {}

  async execute(input: ReviewGameRequestInput): Promise<Result<void>> {
    const request = await db
      .select()
      .from(gameRequests)
      .where(eq(gameRequests.id, input.requestId))
      .limit(1);

    if (!request[0]) return err("Game request not found");
    if (request[0].status !== "PENDING") return err("Request already reviewed");

    if (input.decision === "REJECTED") {
      await db
        .update(gameRequests)
        .set({
          status: "REJECTED",
          reviewedById: input.adminId,
          reviewNote: input.reviewNote ?? null,
          updatedAt: new Date(),
        })
        .where(eq(gameRequests.id, input.requestId));

      return ok(undefined);
    }

    // APPROVED — create the game
    if (!input.imageBuffer || !input.imageMimeType) {
      return err("An image is required when approving a game request");
    }

    const validation = CloudinaryAdapter.validateImage(
      input.imageBuffer,
      input.imageMimeType,
    );
    if (!validation.valid) return err(validation.error!);

    const name = request[0].name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const uploaded = await this.storage.uploadBuffer(
      input.imageBuffer,
      "potlockng/games",
      { publicId: `game_${slug}` },
    );

    if (!uploaded) return err("Image upload failed");

    const gameId = randomUUID();

    await db.insert(games).values({
      id: gameId,
      name,
      slug,
      description: request[0].description,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db
      .update(gameRequests)
      .set({
        status: "APPROVED",
        reviewedById: input.adminId,
        reviewNote: input.reviewNote ?? null,
        gameId,
        updatedAt: new Date(),
      })
      .where(eq(gameRequests.id, input.requestId));

    // Bust games list cache
    await redis.del(CacheKeys.allGames());

    return ok(undefined);
  }
}