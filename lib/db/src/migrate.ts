import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

// Resolve migration directory path (ES modules compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.join(__dirname, "../drizzle");

async function runMigrations() {
  let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Missing database connection string (DIRECT_URL or DATABASE_URL) for migration execution.");
    process.exit(1);
  }

  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
  } catch (e) {
    // Ignore parsing errors
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1, // Single connection for migration execution lock
  });

  const db = drizzle(pool);

  console.log("⏳ Running schema migrations from:", migrationsFolder);
  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations applied successfully.");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
