import { db } from "@infrastructure/db/client";
import { feedback } from "@infrastructure/db/schema";
import { eq, desc } from "drizzle-orm";
import type {
  IFeedbackRepository,
  CreateFeedbackInput,
} from "@domain/feedback/IFeedbackRepository";
import type { Feedback } from "@domain/feedback/Feedback";

export class FeedbackRepository implements IFeedbackRepository {
  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const [row] = await db
      .insert(feedback)
      .values({
        userId: input.userId,
        message: input.message,
        rating: input.rating,
      })
      .returning();

    return row as Feedback;
  }

  async list(filter?: { rating?: number }): Promise<Feedback[]> {
    const rows = filter?.rating
      ? await db
        .select()
        .from(feedback)
        .where(eq(feedback.rating, filter.rating))
        .orderBy(desc(feedback.createdAt))
      : await db.select().from(feedback).orderBy(desc(feedback.createdAt));

    return rows as Feedback[];
  }

}