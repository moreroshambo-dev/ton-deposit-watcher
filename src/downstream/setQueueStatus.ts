import { Logger } from "pino"
import { AppDatabase, AppDatabaseTx } from "~/infrastructure/db/client"
import { downstreamQueueTable, DownstreamQueueTableInsert, DownstreamQueueTableSelect } from "~/infrastructure/db/schema"
import { eq } from "drizzle-orm"

type SetQueueStatusPayload = {
  status: DownstreamQueueTableInsert['status'],
  id: DownstreamQueueTableSelect['id']
}

type SetQueueStatusOptions = {
  logger: Logger
  db: AppDatabase | AppDatabaseTx
  signal?: AbortSignal
}

export const setQueueStatus = async (payload: SetQueueStatusPayload, options: SetQueueStatusOptions) => {
  await options.db
    .update(downstreamQueueTable)
    .set({status: payload.status})
    .where(eq(downstreamQueueTable.id, payload.id))
}