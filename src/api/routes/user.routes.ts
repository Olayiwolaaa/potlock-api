import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { UserRepository } from "@infrastructure/db/repositories/UserRepository";
import { CloudinaryAdapter } from "@infrastructure/storage/CloudinaryAdapter";
import { UpdateProfileUseCase } from "@application/user/UpdateProfileUseCase";
import { redis } from "@infrastructure/cache/RedisClient";
import { CacheKeys, CacheTTL } from "@infrastructure/cache/CacheKeys";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse } from "@api/schemas/common.schemas";
import type { AppEnv } from "@api/types";

const userRepo = new UserRepository();
const storage = new CloudinaryAdapter();
const updateProfile = new UpdateProfileUseCase(userRepo, storage);

const userRoutes = new OpenAPIHono<AppEnv>();
userRoutes.use("*", requireAuth);

const profileSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string(),
    role: z.enum(["user", "admin"]),
    profileImageUrl: z.string().nullable(),
    isVerified: z.boolean(),
  }),
});

// ── GET /users/me ─────────────────────────────────────────────────────────────
userRoutes.openapi(
  createRoute({
    method: "get",
    path: "/me",
    tags: ["Users"],
    summary: "Get own profile",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: profileSchema } },
        description: "Your profile",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "User not found",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");

    const profile = await redis.getOrSet(
      CacheKeys.userProfile(userId),
      async () => {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return user[0] ?? null;
      },
      CacheTTL.USER_PROFILE,
    );

    if (!profile) {
      return c.json({ success: false as const, error: "User not found" }, 404);
    }

    return c.json({
      success: true as const,
      data: {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        role: profile.role,
        profileImageUrl: profile.profileImageUrl,
        isVerified: profile.isVerified,
      },
    }, 200);
  },
);

// ── PATCH /users/me ───────────────────────────────────────────────────────────
userRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/me",
    tags: ["Users"],
    summary: "Update profile (name + avatar)",
    description:
      "Send as multipart/form-data. Include displayName and/or image file.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              displayName: z.string().min(2).max(30).optional(),
              image: z.string().optional().openapi({
                type: "string",
                format: "binary",
                description: "Profile image file",
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              data: z.object({
                displayName: z.string(),
                profileImageUrl: z.string().nullable(),
              }),
            }),
          },
        },
        description: "Profile updated",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Validation error",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const formData = await c.req.formData();

    const displayName = formData.get("displayName") as string | null;
    const imageFile = formData.get("image") as File | null;

    let imageBuffer: Buffer | undefined;
    let imageMimeType: string | undefined;

    if (imageFile) {
      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageMimeType = imageFile.type;
    }

    const result = await updateProfile.execute({
      userId,
      displayName: displayName ?? undefined,
      imageBuffer,
      imageMimeType,
    });

    if (!result.success) {
      return c.json({ success: false as const, error: result.error }, 400);
    }

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

export { userRoutes };