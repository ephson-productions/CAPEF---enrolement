import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const configuredDatabaseUrl =
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL, DIRECT_URL, or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

let connectionString = configuredDatabaseUrl;
try {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  connectionString = url.toString();
} catch (e) {
  // Ignore parsing errors
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { runStandaloneMigrateAndSeed } from "./standalone-migrate";
