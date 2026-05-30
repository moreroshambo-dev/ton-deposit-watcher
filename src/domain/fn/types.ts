import type { Logger } from "pino"
import type { Config } from "~/app/config"
import type { AppDatabase, AppDatabaseTx } from "~/infrastructure/db/client"

export type GenericOptions = {
  config: Config,
  logger: Logger,
  signal?: AbortSignal
}

export type GenericOptionsWithDb = GenericOptions & {
  db: AppDatabase | AppDatabaseTx
}