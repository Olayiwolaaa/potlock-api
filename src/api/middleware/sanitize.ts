import { createMiddleware } from "hono/factory";
import { logger } from "@infrastructure/logger/logger";

// Recursively trims strings and strips characters that have no place
// in normal user input but are common in injection attacks
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .trim()
      // Strip null bytes — used in some injection attacks
      .replace(/\0/g, "")
      // Strip HTML tags — we never render user content as HTML
      // but belt-and-suspenders never hurts
      .replace(/<[^>]*>/g, "");
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)]),
    );
  }

  return value;
}

export const sanitizeBody = createMiddleware(async (c, next) => {
  // Only sanitize JSON bodies
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return next();
  }

  try {
    const raw = await c.req.json();
    const sanitized = sanitizeValue(raw);

    // Replace the request body with the sanitized version
    // Hono caches the parsed body so we patch it directly
    // @ts-ignore — internal Hono cache
    c.req.bodyCache.json = sanitized;
  } catch {
    // Body wasn't valid JSON — Zod validation will catch this downstream
  }

  return next();
});