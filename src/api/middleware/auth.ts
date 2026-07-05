import { createMiddleware } from "hono/factory";
import { TokenService } from "@infrastructure/auth/TokenService";
import { UnauthorizedError } from "@domain/shared/DomainError";
import { DomainError } from "@domain/shared/DomainError";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import type { Context } from "hono";

type AuthContext = {
  Variables: {
    userId: string;
    email: string;
  };
};

const tokenService = new TokenService();

export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }

  const token = authHeader.slice(7);
  const payload = await tokenService.verify(token);

  if (!payload) {
    throw new UnauthorizedError();
  }

  c.set("userId", payload.userId);
  c.set("email", payload.email);

  await next();
});

export const optionalAuth = createMiddleware<AuthContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await tokenService.verify(token);
    if (payload) {
      c.set("userId", payload.userId);
      c.set("email", payload.email);
    }
  }

  await next();
});

export const requireAdmin = async (c: Context): Promise<void> => {
  const userId = c.get("userId") as string | undefined;

  if (!userId) {
    throw new UnauthorizedError();
  }

  const user = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user[0] || user[0].role !== "admin") {
    throw new DomainError("Admin access required", "FORBIDDEN", 403);
  }
};