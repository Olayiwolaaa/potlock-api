import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { pusher } from "@infrastructure/realtime/PusherAdapter";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import type { AppEnv } from "@api/types";
import { errorResponse } from "@api/schemas/common.schemas";

const pusherRoutes = new OpenAPIHono<AppEnv>();
pusherRoutes.use("*", requireAuth);

pusherRoutes.openapi(
  createRoute({
    method: "post",
    path: "/auth",
    tags: ["Realtime"],
    summary: "Authenticate a Pusher channel subscription",
    description:
      "The Pusher client calls this automatically when subscribing to private or presence channels. Your JWT is used to verify identity.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.object({
              socket_id: z.string().openapi({ example: "1234.5678" }),
              channel_name: z.string().openapi({
                example: "presence-challenge.abc123",
              }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              auth: z.string(),
              channel_data: z.string().optional(),
            }),
          },
        },
        description: "Signed auth token for Pusher",
      },
      403: {
        content: { "application/json": { schema: errorResponse } },
        description: "Not authorised to subscribe to this channel",
      },
    },
  }),
  async (c) => {
    const body = await c.req.parseBody();
    const socketId = body["socket_id"] as string;
    const channelName = body["channel_name"] as string;
    const userId = c.get("userId");

    // Security: verify the user is allowed to subscribe to this channel.
    // A user should only subscribe to their own private channel
    // or presence channels for challenges/bets they're part of.
    const isOwnPrivateChannel =
      channelName === `private-user.${userId}`;

    // For presence channels we allow any authenticated user for now.
    // In production you'd check challenge/bet participation here.
    const isPresenceChannel = channelName.startsWith("presence-");

    if (!isOwnPrivateChannel && !isPresenceChannel) {
      return c.json(
        { success: false as const, error: "Not authorised for this channel" },
        403,
      );
    }

    // Fetch display name for presence channel user info
    const user = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const authResponse = pusher.authenticateChannel(
      socketId,
      channelName,
      isPresenceChannel
        ? {
            userId,
            displayName: user[0]?.displayName ?? "Unknown",
          }
        : undefined,
    );

    return c.json(JSON.parse(authResponse));
  },
);

export { pusherRoutes };