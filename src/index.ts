import { runDepositSync } from "./app/run-deposit-sync";
import { createLogger } from "./shared/logger";

const logger = createLogger();

runDepositSync({ logger })
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "TON deposit sync failed");
    process.exit(1);
  });
