import { watchDepositSync } from "./app/watch-deposit-sync";
import { createLogger } from "./shared/logger";

const logger = createLogger();

watchDepositSync({ logger })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "TON deposit watcher failed");
    process.exit(1);
  });
