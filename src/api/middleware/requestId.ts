import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";

export const requestId = createMiddleware(async (c, next) => {
  const id = c.req.header("x-request-id") ?? nanoid(12);
  c.header("x-request-id", id);
  // Attach to context so use cases and logs can reference it
  c.set("requestId" as never, id);
  await next();
});