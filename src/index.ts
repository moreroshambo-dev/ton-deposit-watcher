import { loadConfig } from "./app/config";
import { createDatabase } from "./infrastructure/db/client";
import { createLogger } from "./shared/logger";
import { watchDepositSync } from "./watchDepositSync";

const logger = createLogger();

const config = loadConfig(process.env);

const { client: dbClient, db } = createDatabase({
  databaseConnectionInfo: config.databaseConnectionInfo,
  databaseUrl: config.databaseUrl,
  logger: createLogger(process.env).child({
    network: config.network,
  }),
});

watchDepositSync(
  {
    logger: createLogger(process.env).child({
      network: config.network,
    }),
    db,
    config: config,
  }
)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "TON deposit watcher failed");
    process.exit(1);
  });
