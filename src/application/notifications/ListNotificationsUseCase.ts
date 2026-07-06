import { db } from "@infrastructure/db/client";
import { notifications } from "@infrastructure/db/schema";
import { and, desc, eq, count } from "drizzle-orm";
import { Result, ok } from "@domain/shared/Result";

interface ListNotificationsInput {
  userId: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

interface ListNotificationsOutput {
  items: NotificationItem[];
  unreadCount: number;
  total: number;
}

export class ListNotificationsUseCase {
  async execute(
    input: ListNotificationsInput,
  ): Promise<Result<ListNotificationsOutput>> {
    const limit = Math.min(input.limit ?? 20, 50);
    const offset = input.offset ?? 0;

    const whereClause = input.unreadOnly
      ? and(eq(notifications.userId, input.userId), eq(notifications.read, false))
      : eq(notifications.userId, input.userId);

    const [rows, unreadRow, totalRow] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, input.userId), eq(notifications.read, false))),
      db
        .select({ value: count() })
        .from(notifications)
        .where(eq(notifications.userId, input.userId)),
    ]);

    return ok({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        data: (r.data as Record<string, unknown>) ?? {},
        read: r.read,
        createdAt: r.createdAt,
      })),
      unreadCount: unreadRow[0]?.value ?? 0,
      total: totalRow[0]?.value ?? 0,
    });
  }
}
