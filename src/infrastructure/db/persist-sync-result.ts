import type { Logger } from "pino";

import type { SyncIncomingTransfersResult } from "../../domain/deposit-sync/types";
import type { AppDatabase } from "./client";
import { incomingTransfersTable, syncCursorsTable } from "./schema";

type PersistedTransferLog = {
  amountTon: string;
  fromRawAddress: string;
  memo: string | null;
  toRawAddress: string;
  txHashHex: string;
};

export async function persistSyncResult(args: {
  db: AppDatabase;
  logger: Logger;
  result: SyncIncomingTransfersResult;
}): Promise<{
  insertedTransfers: PersistedTransferLog[];
}> {
  const log = args.logger.child({ scope: "sync_result_repository" });
  const insertedAt = new Date().toISOString();

  const insertedTransfers = await args.db.transaction(async (tx) => {
    const insertedRows =
      args.result.incomingTransfers.length === 0
        ? []
        : await tx
            .insert(incomingTransfersTable)
            .values(
              args.result.incomingTransfers.map((transfer) => ({
                network: args.result.cursorAfter.network,
                walletRawAddress: args.result.walletRawAddress,
                txHashHex: transfer.txHashHex,
                txLt: transfer.txLt,
                toRawAddress: transfer.toRawAddress,
                fromRawAddress: transfer.fromRawAddress,
                memo: transfer.memo,
                memoOpcode: transfer.memoOpcode,
                memoType: transfer.memoType,
                amountNano: transfer.amountNano,
                amountTon: transfer.amountTon,
                bodyBocBase64: transfer.bodyBocBase64,
                txNow: transfer.now,
                txNowIso: transfer.nowIso,
                insertedAt,
              })),
            )
            .onConflictDoNothing({
              target: [
                incomingTransfersTable.network,
                incomingTransfersTable.walletRawAddress,
                incomingTransfersTable.txHashHex,
              ],
            })
            .returning({
              amountTon: incomingTransfersTable.amountTon,
              fromRawAddress: incomingTransfersTable.fromRawAddress,
              memo: incomingTransfersTable.memo,
              toRawAddress: incomingTransfersTable.toRawAddress,
              txHashHex: incomingTransfersTable.txHashHex,
            });

    await tx
      .insert(syncCursorsTable)
      .values({
        network: args.result.cursorAfter.network,
        walletRawAddress: args.result.cursorAfter.walletRawAddress,
        lastProcessedTxLt: args.result.cursorAfter.lastProcessedTx?.lt ?? null,
        lastProcessedTxHashHex: args.result.cursorAfter.lastProcessedTx?.hashHex ?? null,
        lastProcessedBlockSeqno: args.result.cursorAfter.lastProcessedBlock.seqno,
        lastProcessedBlockShard: args.result.cursorAfter.lastProcessedBlock.shard,
        lastProcessedBlockWorkchain: args.result.cursorAfter.lastProcessedBlock.workchain,
        lastProcessedBlockRootHashHex: args.result.cursorAfter.lastProcessedBlock.rootHashHex,
        lastProcessedBlockFileHashHex: args.result.cursorAfter.lastProcessedBlock.fileHashHex,
        updatedAt: args.result.cursorAfter.updatedAt,
      })
      .onConflictDoUpdate({
        target: [syncCursorsTable.network, syncCursorsTable.walletRawAddress],
        set: {
          lastProcessedTxLt: args.result.cursorAfter.lastProcessedTx?.lt ?? null,
          lastProcessedTxHashHex: args.result.cursorAfter.lastProcessedTx?.hashHex ?? null,
          lastProcessedBlockSeqno: args.result.cursorAfter.lastProcessedBlock.seqno,
          lastProcessedBlockShard: args.result.cursorAfter.lastProcessedBlock.shard,
          lastProcessedBlockWorkchain: args.result.cursorAfter.lastProcessedBlock.workchain,
          lastProcessedBlockRootHashHex: args.result.cursorAfter.lastProcessedBlock.rootHashHex,
          lastProcessedBlockFileHashHex: args.result.cursorAfter.lastProcessedBlock.fileHashHex,
          updatedAt: args.result.cursorAfter.updatedAt,
        },
      });

    return insertedRows;
  });

  if (insertedTransfers.length > 0) {
    log.info(
      {
        insertedTransfers: insertedTransfers.length,
        lastProcessedBlockSeqno: args.result.cursorAfter.lastProcessedBlock.seqno,
      },
      "Persisted new incoming transfers and advanced cursor",
    );
  } else {
    log.debug(
      {
        lastProcessedBlockSeqno: args.result.cursorAfter.lastProcessedBlock.seqno,
      },
      "Advanced cursor without new database inserts",
    );
  }

  for (const transfer of insertedTransfers) {
    log.info(
      {
        amountTon: transfer.amountTon,
        fromRawAddress: transfer.fromRawAddress,
        memo: transfer.memo,
        toRawAddress: transfer.toRawAddress,
        txHashHex: transfer.txHashHex,
      },
      "Persisted incoming transfer",
    );
  }

  return {
    insertedTransfers,
  };
}
