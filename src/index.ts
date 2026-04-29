import { watchDepositSync } from "./app/watch-deposit-sync";
import { createLogger } from "./shared/logger";

const logger = createLogger();

watchDepositSync({ logger })
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.fatal(
      {
        err: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorCode:
          error != null && typeof error === "object" && "code" in error
            ? (error as { code: unknown }).code
            : undefined,
      },
      "TON deposit watcher failed",
    );
    process.exit(1);
  });
