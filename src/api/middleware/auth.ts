import { createMiddleware } from "hono/factory";
import { TokenService } from "@infrastructure/auth/TokenService";
import { UnauthorizedError } from "@domain/shared/DomainError";

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