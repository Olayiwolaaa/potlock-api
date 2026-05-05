import { createMiddleware } from "hono/factory";
import { DomainError } from "@domain/shared/DomainError";

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

// In-memory store — resets on server restart
// Replace with Redis for multi-instance production deployments
const store: RateLimitStore = {};

function createRateLimiter(options: {
  windowMs: number;  // time window in ms
  max: number;       // max requests per window
  keyFn?: (ip: string, path: string) => string;
}) {
  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "unknown";

    const key = options.keyFn
      ? options.keyFn(ip, c.req.path)
      : `${ip}:${c.req.path}`;

    const now = Date.now();
    const record = store[key];

    if (!record || now > record.resetAt) {
      store[key] = { count: 1, resetAt: now + options.windowMs };
      return next();
    }

    if (record.count >= options.max) {
      c.header("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
      throw new DomainError(
        "Too many requests. Please slow down.",
        "RATE_LIMITED",
        429,
      );
    }

    record.count++;
    return next();
  });
}

// Different limits for different endpoint types
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per 15 min — brute force protection
});

export const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 requests per minute — normal usage ceiling
});

export const paymentRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5, // 5 payment initiations per minute — extra tight
});