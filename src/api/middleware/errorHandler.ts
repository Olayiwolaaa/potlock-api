import { createMiddleware } from "hono/factory";
import { DomainError } from "@domain/shared/DomainError";
import { logger } from "@infrastructure/logger/logger";

export const errorHandler = () =>
  createMiddleware(async (c, next) => {
    try {
      await next();
    } catch (error) {
      // Known domain errors — we control the message and status
      if (error instanceof DomainError) {
        return c.json(
          { success: false, error: error.message, code: error.code },
          error.statusCode as 400 | 401 | 403 | 404,
        );
      }

      // Unknown errors — don't leak internals to the client
      logger.error({ error }, "Unhandled error");
      return c.json(
        { success: false, error: "Something went wrong", code: "INTERNAL_ERROR" },
        500,
      );
    }
  });