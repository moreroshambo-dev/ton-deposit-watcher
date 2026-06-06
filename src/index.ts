import { loadConfig } from "./app/config";
import { assertMigratedSchema } from "./infrastructure/db/assert-migrated-schema";
import { createDatabase } from "./infrastructure/db/client";
import { createLogger } from "./shared/logger";
import { watchDepositSync } from "./watchDepositSync";

const logger = createLogger();

async function main() {
  const config = loadConfig(process.env);
  const appLogger = createLogger(process.env).child({
    network: config.network,
  });

  const { client: dbClient, db } = createDatabase({
    databaseConnectionInfo: config.databaseConnectionInfo,
    databaseUrl: config.databaseUrl,
    logger: appLogger,
  });

  await assertMigratedSchema({
    client: dbClient,
    logger: appLogger,
  });

  await watchDepositSync({
    logger: appLogger,
    db,
    config: config,
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "TON deposit watcher failed");
    process.exit(1);
  });
