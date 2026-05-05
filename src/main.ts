import { env } from "@config/env";
import { createApp } from "@api/app";
import { logger } from "@infrastructure/logger/logger";
import { ExpireChallengesUseCase } from "@application/challenge/ExpireChallengeUseCase";

const app = createApp();
const expireChallenges = new ExpireChallengesUseCase();

// Run every 5 minutes
setInterval(async () => {
  await expireChallenges.execute();
}, 5 * 60 * 1000);

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info(`PotLockNg API running on port ${env.PORT} [${env.APP_ENV}]`);