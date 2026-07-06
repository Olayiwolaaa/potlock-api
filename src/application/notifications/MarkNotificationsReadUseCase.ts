import { db } from "@infrastructure/db/client";
import { notifications } from "@infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { Result, ok, err } from "@domain/shared/Result";

interface MarkOneInput {
  userId: string;
  notificationId: string;
}

interface MarkAllInput {
  userId: string;
}

export class MarkNotificationsReadUseCase {
  // Marks a single notification read. Scoped to userId so you can't mark
  // someone else's notification read by guessing an id.
  async markOne(input: MarkOneInput): Promise<Result<{ id: string }>> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, input.notificationId),
          eq(notifications.userId, input.userId),
        ),
      )
      .returning();

    if (!result[0]) {
      return err("Notification not found");
    }

    return ok({ id: result[0].id });
  }

  async markAll(input: MarkAllInput): Promise<Result<{ updated: number }>> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, input.userId), eq(notifications.read, false)))
      .returning();

    return ok({ updated: result.length });
  }
}