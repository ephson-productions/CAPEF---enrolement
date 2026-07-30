import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabaseIfNeeded } from "./lib/seed";
import { migrateExistingMembersToActivities } from "./lib/migration";
import { execSync } from "child_process";

// Run Drizzle schema push on startup to ensure all tables exist before any queries/seeding are run
try {
  logger.info("Running Drizzle schema push on startup...");
  execSync("pnpm --filter @workspace/db run push", { stdio: "inherit" });
  logger.info("Drizzle schema push completed successfully!");
} catch (error) {
  logger.error({ error }, "Failed to run Drizzle schema push on startup. Proceeding asynchronously...");
}

// Trigger seeding and migration asynchronously on startup
seedDatabaseIfNeeded()
  .then(() => migrateExistingMembersToActivities())
  .catch((err) => {
    logger.error({ err }, "Failed to run seeder/migration on startup");
  });

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

export default app;
