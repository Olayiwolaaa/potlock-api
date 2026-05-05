import pino from "pino";
import { env } from "@config/env";

export const logger = pino({
  level: "info",
  transport:
    env.APP_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: [
    "passwordHash",
    "password",
    "token",
    "authorization",
  ],
});