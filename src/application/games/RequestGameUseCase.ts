import { Result, ok, err } from "@domain/shared/Result";
import { db } from "@infrastructure/db/client";
import { gameRequests, games } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

interface RequestGameInput {
  userId: string;
  name: string;
  description?: string;
  reason: string;
}

export class RequestGameUseCase {
  async execute(input: RequestGameInput): Promise<Result<{ requestId: string }>> {
    const name = input.name.trim();
    if (name.length < 2) return err("Game name too short");
    if (input.reason.trim().length < 10) return err("Please provide more detail on why you want this game");

    // Check the game doesn't already exist
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const existing = await db
      .select()
      .from(games)
      .where(eq(games.slug, slug))
      .limit(1);

    if (existing[0]) return err("This game already exists in our library");

    // Check user hasn't already requested this
    const duplicate = await db
      .select()
      .from(gameRequests)
      .where(eq(gameRequests.requestedById, input.userId))
      .then((rows) =>
        rows.find(
          (r) =>
            r.name.toLowerCase() === name.toLowerCase() &&
            r.status === "PENDING",
        ),
      );

    if (duplicate) return err("You already have a pending request for this game");

    const requestId = randomUUID();
    await db.insert(gameRequests).values({
      id: requestId,
      requestedById: input.userId,
      name,
      description: input.description?.trim() ?? null,
      reason: input.reason.trim(),
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return ok({ requestId });
  }
}