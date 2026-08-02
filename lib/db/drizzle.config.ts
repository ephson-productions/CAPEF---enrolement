import { defineConfig } from "drizzle-kit";
import path from "path";

let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Neither DIRECT_URL nor DATABASE_URL was provided. Ensure the database is provisioned.");
}

try {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  connectionString = url.toString();
} catch (e) {
  // Ignore parsing errors
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: { rejectUnauthorized: false },
  },
});
