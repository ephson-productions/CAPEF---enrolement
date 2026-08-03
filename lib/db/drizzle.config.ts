import { defineConfig } from "drizzle-kit";
import path from "path";

let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://localhost:5432/dummy";

try {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  connectionString = url.toString();
} catch (e) {
  // Ignore parsing errors
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: { rejectUnauthorized: false },
  },
});
