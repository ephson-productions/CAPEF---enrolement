import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabaseIfNeeded } from "./lib/seed";
import { migrateExistingMembersToActivities } from "./lib/migration";

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
