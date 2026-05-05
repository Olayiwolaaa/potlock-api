import { env } from "@config/env";

async function createDbClient() {
  if (env.APP_ENV === "production") {
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { neon } = await import("@neondatabase/serverless");
    const schema = await import("./schema");

    const sql = neon(env.DATABASE_URL);
    return drizzle(sql, { schema });
  } else {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = await import("postgres");
    const schema = await import("./schema");

    const client = postgres.default(env.DATABASE_URL);
    return drizzle(client, { schema });
  }
}

export const db = await createDbClient();
export type Database = typeof db;