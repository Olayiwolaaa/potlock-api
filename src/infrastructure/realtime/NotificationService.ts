import { randomUUID } from "crypto";
import { db } from "@infrastructure/db/client";
import { notifications } from "@infrastructure/db/schema";
import { pusher, Channels, Events, type ChannelEvent } from "@infrastructure/realtime/PusherAdapter";
import { logger } from "@infrastructure/logger/logger";

interface NotifyInput {
  userId: string;
  event: ChannelEvent;
  title: string;
  message: string;
  // Extra structured data for the client (challengeId, betId, amountKobo, etc).
  // Gets sent over Pusher AND stored in notifications.data for history/deep-linking.
  data?: Record<string, unknown>;
}

// Use this instead of calling `pusher.emit(Channels.user(id), ...)` directly
// whenever the event is meant to be a personal notification for one user
// (as opposed to an anonymous/aggregate broadcast on a presence channel,
// e.g. BET_ENTRY_PLACED's aggregate pot update to everyone watching a bet —
// that one should stay as a plain pusher.emit).
//
// This is what makes an event show up in the notification bell — the bell
// only ever reads from the `notifications` table, it does not listen on
// presence channels.
export class NotificationService {
  async notify(input: NotifyInput): Promise<void> {
    const id = randomUUID();
    const ts = Date.now();

    try {
      await db.insert(notifications).values({
        id,
        userId: input.userId,
        type: input.event,
        title: input.title,
        message: input.message,
        data: input.data ?? {},
      });
    } catch (error) {
      // Same philosophy as PusherAdapter: never let a notification write
      // block or fail the underlying financial/game operation.
      logger.error(
        { userId: input.userId, event: input.event, error },
        "Failed to persist notification",
      );
    }

    await pusher.emit(Channels.user(input.userId), input.event, {
      notificationId: id,
      title: input.title,
      message: input.message,
      ...input.data,
      ts,
    });
  }

  async notifyMany(
    userIds: string[],
    event: ChannelEvent,
    titleFor: (userId: string) => string,
    messageFor: (userId: string) => string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) =>
        this.notify({
          userId,
          event,
          title: titleFor(userId),
          message: messageFor(userId),
          data,
        }),
      ),
    );
  }
}

export const notificationService = new NotificationService();
export { Events };
