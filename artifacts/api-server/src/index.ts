import app from "./app";
import { logger } from "./lib/logger";

import { runStandaloneMigrateAndSeed } from "@workspace/db";

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
