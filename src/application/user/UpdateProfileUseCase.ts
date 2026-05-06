import { IUserRepository } from "@domain/user/IUserRepository";
import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys } from "@infrastructure/cache/CacheKeys";
import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";

interface UpdateProfileInput {
  userId: string;
  displayName?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
}

interface UpdateProfileOutput {
  displayName: string;
  profileImageUrl: string | null;
}

export class UpdateProfileUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly storage: CloudinaryAdapter,
  ) {}

  async execute(input: UpdateProfileInput): Promise<Result<UpdateProfileOutput>> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) return err("User not found");

    let profileImageUrl = user.profileImageUrl;
    let profileImagePublicId = user.profileImagePublicId;

    // Handle image upload
    if (input.imageBuffer && input.imageMimeType) {
      const validation = CloudinaryAdapter.validateImage(
        input.imageBuffer,
        input.imageMimeType,
      );
      if (!validation.valid) return err(validation.error!);

      // Delete old image if exists
      if (user.profileImagePublicId) {
        await this.storage.delete(user.profileImagePublicId);
      }

      const uploaded = await this.storage.uploadBuffer(
        input.imageBuffer,
        "potlockng/profiles",
        {
          publicId: `profile_${input.userId}`,
          maxWidth: 400,
          maxHeight: 400,
        },
      );

      if (!uploaded) return err("Image upload failed. Please try again.");

      profileImageUrl = uploaded.url;
      profileImagePublicId = uploaded.publicId;
    }

    const displayName = input.displayName?.trim() ?? user.displayName;

    // Persist
    await db
      .update(users)
      .set({
        displayName,
        profileImageUrl,
        profileImagePublicId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    // Bust cache
    await redis.del(CacheKeys.userProfile(input.userId));

    return ok({ displayName, profileImageUrl });
  }
}