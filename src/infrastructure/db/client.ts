import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Logger } from "pino";

import { type DatabaseConnectionInfo } from "../../app/config";
import { schema } from "./schema";

export function createDatabase(args: {
  databaseConnectionInfo: DatabaseConnectionInfo;
  databaseUrl: string;
  logger: Logger;
}) {
  const log = args.logger.child({
    ...args.databaseConnectionInfo,
    scope: "postgres_database",
  });
  const client = postgres(args.databaseUrl, {
    max: 10,
    prepare: false,
    onnotice: (notice) => {
      log.debug({ notice }, "Postgres notice");
    },
  });
  const db = drizzle(client, { schema });

  log.info("Configured Postgres client");

  return {
    client,
    db,
  };
}

export type AppDatabase = ReturnType<typeof createDatabase>["db"];
