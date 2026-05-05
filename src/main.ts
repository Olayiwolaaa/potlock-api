import { env } from "@config/env";
import { createApp } from "@api/app";
import { logger } from "@infrastructure/logger/logger";

const app = createApp();

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info(`PotLockNg API running on port ${env.PORT} [${env.APP_ENV}]`);