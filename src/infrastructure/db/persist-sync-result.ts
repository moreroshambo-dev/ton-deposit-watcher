import type { Logger } from "pino";

import { extractUserIdFromMemo } from "../../domain/deposit-delivery/user-id";
import type { MessageMemo, SyncIncomingTransfersResult } from "../../domain/deposit-sync/types";
import type { AppDatabase } from "./client";
import { enqueueDownstreamDeliveries } from "./downstream-delivery-repository";
import { loadEnabledDownstreamServiceIds } from "./downstream-service-repository";
import { incomingTransfersTable, syncCursorsTable } from "./schema";

type PersistedTransferLog = {
  amountTon: string;
  fromRawAddress: string;
  id: number;
  memo: string | null;
  memoType: MessageMemo["memoType"];
  toRawAddress: string;
  txHashHex: string;
};

function normalizeMemoType(memoType: string): MessageMemo["memoType"] {
  switch (memoType) {
    case "binary":
    case "empty":
    case "text_comment":
      return memoType;
    default:
      throw new Error(`Unsupported memoType loaded from database: ${memoType}`);
  }
}

export async function persistSyncResult(args: {
  db: AppDatabase;
  logger: Logger;
  result: SyncIncomingTransfersResult;
}): Promise<{
  insertedTransfers: PersistedTransferLog[];
}> {
  const log = args.logger.child({ scope: "sync_result_repository" });
  const insertedAt = new Date().toISOString();

  const { enqueuedDeliveries, insertedTransfers, skippedDeliveryTransfers } =
    await args.db.transaction(async (tx) => {
      const enabledServiceIds = await loadEnabledDownstreamServiceIds({
        db: tx,
      });

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
                id: incomingTransfersTable.id,
                memo: incomingTransfersTable.memo,
                memoType: incomingTransfersTable.memoType,
                toRawAddress: incomingTransfersTable.toRawAddress,
                txHashHex: incomingTransfersTable.txHashHex,
              });

      const normalizedInsertedRows = insertedRows.map((transfer) => ({
        ...transfer,
        memoType: normalizeMemoType(transfer.memoType),
      }));

      const validDeliveryTransfers = normalizedInsertedRows
        .map((transfer) => ({
          ...transfer,
          userId: extractUserIdFromMemo({
            memo: transfer.memo,
            memoType: transfer.memoType,
          }),
        }))
        .filter((transfer) => transfer.userId !== null);

      const skippedDeliveryTransfers = normalizedInsertedRows.filter(
        (transfer) =>
          extractUserIdFromMemo({
            memo: transfer.memo,
            memoType: transfer.memoType,
          }) === null,
      );

      const enqueuedDeliveries = await enqueueDownstreamDeliveries({
        db: tx,
        transfers: validDeliveryTransfers.flatMap((transfer) =>
          enabledServiceIds.map((serviceId) => ({
            incomingTransferId: transfer.id,
            serviceId,
          })),
        ),
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

      return {
        enqueuedDeliveries,
        insertedTransfers: normalizedInsertedRows,
        skippedDeliveryTransfers,
      };
    },
  );

  if (insertedTransfers.length > 0) {
    log.info(
      {
        enqueuedDeliveries,
        insertedTransfers: insertedTransfers.length,
        lastProcessedBlockSeqno: args.result.cursorAfter.lastProcessedBlock.seqno,
      },
      "Persisted new incoming transfers, enqueued downstream deliveries, and advanced cursor",
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

  for (const transfer of skippedDeliveryTransfers) {
    log.info(
      {
        memo: transfer.memo,
        memoType: transfer.memoType,
        txHashHex: transfer.txHashHex,
      },
      "Skipped downstream delivery enqueue because memo cannot be used as userId",
    );
  }

  return {
    insertedTransfers,
  };
}
