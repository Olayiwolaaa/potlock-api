import { env } from "@config/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  ssl: env.APP_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;