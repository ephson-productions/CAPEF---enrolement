import app from "./app";
import { logger } from "./lib/logger";

import { runStandaloneMigrateAndSeed } from "@workspace/db";
import { migrateLegacyBase64Media } from "./lib/migrate-base64-media";

async function startServer() {
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

    try {
      await runStandaloneMigrateAndSeed(false);
    } catch (err) {
      logger.error({ err }, "Fatal error executing database migrations at server startup");
      process.exit(1);
    }

    // Run non-blocking background migration for legacy base64 media to Supabase Storage
    migrateLegacyBase64Media()
      .then((res) => {
        logger.info(res, "[AutoMigration] Base64 legacy media migration finished successfully");
      })
      .catch((err) => {
        logger.error({ err }, "[AutoMigration] Error during base64 legacy media migration");
      });

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  }
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal startup exception");
  process.exit(1);
});

export default app;
