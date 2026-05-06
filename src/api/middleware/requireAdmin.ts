import { createMiddleware } from "hono/factory";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { DomainError } from "@domain/shared/DomainError";
import type { AppEnv } from "@api/types";

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");

  const user = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user[0] || user[0].role !== "admin") {
    throw new DomainError("Admin access required", "FORBIDDEN", 403);
  }

  await next();
});