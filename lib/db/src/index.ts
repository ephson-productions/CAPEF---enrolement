import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

let connectionString = process.env.DATABASE_URL;
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
