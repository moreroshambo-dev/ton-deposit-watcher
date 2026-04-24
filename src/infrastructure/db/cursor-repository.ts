import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";

import { syncCursorSchema, type Network, type SyncCursor } from "../../domain/cursor/types";
import type { AppDatabase } from "./client";
import { syncCursorsTable } from "./schema";

export async function loadCursorFromDb(args: {
  db: AppDatabase;
  logger: Logger;
  network: Network;
  walletRawAddress: string;
}): Promise<SyncCursor | null> {
  const log = args.logger.child({
    scope: "cursor_repository",
    walletRawAddress: args.walletRawAddress,
  });
  const [row] = await args.db
    .select()
    .from(syncCursorsTable)
    .where(
      and(
        eq(syncCursorsTable.network, args.network),
        eq(syncCursorsTable.walletRawAddress, args.walletRawAddress),
      ),
    )
    .limit(1);

  if (!row) {
    log.info("Cursor row does not exist yet, full wallet history will be scanned");
    return null;
  }

  const cursor = syncCursorSchema.parse({
    version: 1,
    network: row.network,
    walletRawAddress: row.walletRawAddress,
    lastProcessedTx:
      row.lastProcessedTxLt && row.lastProcessedTxHashHex
        ? {
            lt: row.lastProcessedTxLt,
            hashHex: row.lastProcessedTxHashHex,
          }
        : null,
    lastProcessedBlock: {
      seqno: row.lastProcessedBlockSeqno,
      shard: row.lastProcessedBlockShard,
      workchain: row.lastProcessedBlockWorkchain,
      rootHashHex: row.lastProcessedBlockRootHashHex,
      fileHashHex: row.lastProcessedBlockFileHashHex,
    },
    updatedAt: row.updatedAt,
  });

  log.info(
    {
      lastProcessedBlockSeqno: cursor.lastProcessedBlock.seqno,
      lastProcessedTx: cursor.lastProcessedTx,
      updatedAt: cursor.updatedAt,
    },
    "Loaded existing cursor from database",
  );

  return cursor;
}
