import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys } from "@infrastructure/cache/CacheKeys";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { games } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

interface CreateGameInput {
  name: string;
  description?: string;
  imageBuffer: Buffer;
  imageMimeType: string;
  fromRequestId?: string; // if created from an approved request
}

interface CreateGameOutput {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
}

export class CreateGameUseCase {
  constructor(private readonly storage: CloudinaryAdapter) {}

  async execute(input: CreateGameInput): Promise<Result<CreateGameOutput>> {
    const name = input.name.trim();
    if (name.length < 2) return err("Game name must be at least 2 characters");

    // Check name uniqueness
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const existing = await db
      .select()
      .from(games)
      .where(eq(games.slug, slug))
      .limit(1);

    if (existing[0]) return err("A game with this name already exists");

    // Validate and upload image
    const validation = CloudinaryAdapter.validateImage(
      input.imageBuffer,
      input.imageMimeType,
    );
    if (!validation.valid) return err(validation.error!);

    const gameId = randomUUID();
    const uploaded = await this.storage.uploadBuffer(
      input.imageBuffer,
      "potlockng/games",
      { publicId: `game_${slug}`, maxWidth: 800, maxHeight: 600 },
    );

    if (!uploaded) return err("Image upload failed");

    await db.insert(games).values({
      id: gameId,
      name,
      slug,
      description: input.description?.trim() ?? null,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Bust games list cache
    await redis.del(CacheKeys.allGames());

    return ok({ id: gameId, name, slug, imageUrl: uploaded.url });
  }
}