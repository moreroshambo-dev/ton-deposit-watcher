import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import {
  deliveryAttemptStatus,
  downstreamTxStatus,
  type DeliverableIncomingTransfer,
  type DeliveryAttempt,
  type DeliveryAttemptStatus,
  type DownstreamTxStatus,
} from "../../domain/deposit-delivery/types";
import { extractUserIdFromMemo } from "../../domain/deposit-delivery/user-id";
import type { Network } from "../../domain/cursor/types";
import type { AppDatabaseExecutor } from "./client";
import { downstreamDeliveryAttemptsTable, incomingTransfersTable } from "./schema";

type CursorRow = {
  id: number;
  txLt: string;
  txNow: number;
};

type NextDeliverableTransferResult =
  | {
      mode: "cursor_mismatch";
      remoteHash: string;
    }
  | {
      mode: "ready";
      transfer: DeliverableIncomingTransfer | null;
    };

type QueueableDeliveryTransfer = {
  incomingTransferId: number;
  serviceSlug: string;
};

type PendingFinalizationTransfer = {
  attempt: DeliveryAttempt;
  transfer: DeliverableIncomingTransfer;
};

export async function enqueueDownstreamDeliveries(args: {
  db: AppDatabaseExecutor;
  transfers: QueueableDeliveryTransfer[];
}): Promise<number> {
  if (args.transfers.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  const insertedRows = await args.db
    .insert(downstreamDeliveryAttemptsTable)
    .values(
      args.transfers.map((transfer) => ({
        attemptCount: 0,
        createdAt: now,
        incomingTransferId: transfer.incomingTransferId,
        lastAttemptAt: null,
        lastError: null,
        lastHttpStatus: null,
        lastTxStatus: null,
        nextRetryAt: null,
        serviceSlug: transfer.serviceSlug,
        status: deliveryAttemptStatus.pending,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [
        downstreamDeliveryAttemptsTable.serviceSlug,
        downstreamDeliveryAttemptsTable.incomingTransferId,
      ],
    })
    .returning({
      id: downstreamDeliveryAttemptsTable.id,
    });

  return insertedRows.length;
}

export async function ensureDeliveryAttempt(args: {
  db: AppDatabaseExecutor;
  incomingTransferId: number;
  serviceSlug: string;
}): Promise<DeliveryAttempt> {
  const existing = await loadDeliveryAttempt(args);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  await args.db
    .insert(downstreamDeliveryAttemptsTable)
    .values({
      attemptCount: 0,
      createdAt: now,
      incomingTransferId: args.incomingTransferId,
      lastAttemptAt: null,
      lastError: null,
      lastHttpStatus: null,
      lastTxStatus: null,
      nextRetryAt: null,
      serviceSlug: args.serviceSlug,
      status: deliveryAttemptStatus.pending,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        downstreamDeliveryAttemptsTable.serviceSlug,
        downstreamDeliveryAttemptsTable.incomingTransferId,
      ],
    });

  const reloaded = await loadDeliveryAttempt(args);

  if (!reloaded) {
    throw new Error(
      `Failed to load delivery attempt for serviceSlug=${args.serviceSlug} incomingTransferId=${args.incomingTransferId}`,
    );
  }

  return reloaded;
}

export async function loadDeliveryAttempt(args: {
  db: AppDatabaseExecutor;
  incomingTransferId: number;
  serviceSlug: string;
}): Promise<DeliveryAttempt | null> {
  const [row] = await args.db
    .select()
    .from(downstreamDeliveryAttemptsTable)
    .where(
      and(
        eq(downstreamDeliveryAttemptsTable.serviceSlug, args.serviceSlug),
        eq(downstreamDeliveryAttemptsTable.incomingTransferId, args.incomingTransferId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    lastTxStatus: parseDownstreamTxStatus(row.lastTxStatus),
    status: parseDeliveryAttemptStatus(row.status),
  };
}

export async function markDeliveryAttemptDelivered(args: {
  attemptId: number;
  db: AppDatabaseExecutor;
  httpStatus: number;
  txStatus: DownstreamTxStatus;
}): Promise<void> {
  const now = new Date().toISOString();

  await args.db
    .update(downstreamDeliveryAttemptsTable)
    .set({
      attemptCount: sql`${downstreamDeliveryAttemptsTable.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: null,
      lastHttpStatus: args.httpStatus,
      lastTxStatus: args.txStatus,
      nextRetryAt: null,
      status: deliveryAttemptStatus.delivered,
      updatedAt: now,
    })
    .where(eq(downstreamDeliveryAttemptsTable.id, args.attemptId));
}

export async function markDeliveryAttemptRetryScheduled(args: {
  attemptId: number;
  db: AppDatabaseExecutor;
  errorMessage: string;
  httpStatus: number | null;
  nextRetryAt: string;
}): Promise<void> {
  const now = new Date().toISOString();

  await args.db
    .update(downstreamDeliveryAttemptsTable)
    .set({
      attemptCount: sql`${downstreamDeliveryAttemptsTable.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: args.errorMessage,
      lastHttpStatus: args.httpStatus,
      nextRetryAt: args.nextRetryAt,
      status: deliveryAttemptStatus.retryScheduled,
      updatedAt: now,
    })
    .where(eq(downstreamDeliveryAttemptsTable.id, args.attemptId));
}

export async function loadPendingFinalizationTransfers(args: {
  currentBlockSeqno: number;
  db: AppDatabaseExecutor;
  network: Network;
  serviceSlug: string;
  walletRawAddress: string;
}): Promise<PendingFinalizationTransfer[]> {
  const now = new Date().toISOString();
  const rows = await args.db
    .select({
      amountTon: incomingTransfersTable.amountTon,
      attemptCount: downstreamDeliveryAttemptsTable.attemptCount,
      attemptCreatedAt: downstreamDeliveryAttemptsTable.createdAt,
      attemptId: downstreamDeliveryAttemptsTable.id,
      attemptIncomingTransferId: downstreamDeliveryAttemptsTable.incomingTransferId,
      attemptLastAttemptAt: downstreamDeliveryAttemptsTable.lastAttemptAt,
      attemptLastError: downstreamDeliveryAttemptsTable.lastError,
      attemptLastHttpStatus: downstreamDeliveryAttemptsTable.lastHttpStatus,
      attemptLastTxStatus: downstreamDeliveryAttemptsTable.lastTxStatus,
      attemptNextRetryAt: downstreamDeliveryAttemptsTable.nextRetryAt,
      attemptServiceSlug: downstreamDeliveryAttemptsTable.serviceSlug,
      attemptStatus: downstreamDeliveryAttemptsTable.status,
      attemptUpdatedAt: downstreamDeliveryAttemptsTable.updatedAt,
      fromRawAddress: incomingTransfersTable.fromRawAddress,
      id: incomingTransfersTable.id,
      isCanceled: incomingTransfersTable.isCanceled,
      memo: incomingTransfersTable.memo,
      memoType: incomingTransfersTable.memoType,
      now: incomingTransfersTable.txNow,
      toRawAddress: incomingTransfersTable.toRawAddress,
      txBlockSeqno: incomingTransfersTable.txBlockSeqno,
      txHashHex: incomingTransfersTable.txHashHex,
      txLt: incomingTransfersTable.txLt,
    })
    .from(downstreamDeliveryAttemptsTable)
    .innerJoin(
      incomingTransfersTable,
      eq(
        downstreamDeliveryAttemptsTable.incomingTransferId,
        incomingTransfersTable.id,
      ),
    )
    .where(
      and(
        eq(downstreamDeliveryAttemptsTable.serviceSlug, args.serviceSlug),
        eq(downstreamDeliveryAttemptsTable.lastTxStatus, downstreamTxStatus.pending),
        or(
          eq(downstreamDeliveryAttemptsTable.status, deliveryAttemptStatus.delivered),
          and(
            eq(downstreamDeliveryAttemptsTable.status, deliveryAttemptStatus.retryScheduled),
            or(
              isNull(downstreamDeliveryAttemptsTable.nextRetryAt),
              sql`${downstreamDeliveryAttemptsTable.nextRetryAt} <= ${now}`,
            ),
          ),
        ),
        eq(incomingTransfersTable.network, args.network),
        eq(incomingTransfersTable.walletRawAddress, args.walletRawAddress),
        eq(incomingTransfersTable.memoType, "text_comment"),
        isNotNull(incomingTransfersTable.memo),
        sql`btrim(${incomingTransfersTable.memo}) <> ''`,
        sql`(
          ${incomingTransfersTable.isCanceled} = true
          OR ${args.currentBlockSeqno} - ${incomingTransfersTable.txBlockSeqno} > 10
        )`,
      ),
    )
    .orderBy(
      asc(incomingTransfersTable.txNow),
      sql`CAST(${incomingTransfersTable.txLt} AS numeric)`,
      asc(incomingTransfersTable.id),
    );

  return rows.flatMap((row) => {
    if (row.memo === null || row.memoType !== "text_comment") {
      return [];
    }

    const userId = extractUserIdFromMemo({
      memo: row.memo,
      memoType: row.memoType,
    });

    if (userId === null) {
      return [];
    }

    return [{
      attempt: {
        attemptCount: row.attemptCount,
        createdAt: row.attemptCreatedAt,
        id: row.attemptId,
        incomingTransferId: row.attemptIncomingTransferId,
        lastAttemptAt: row.attemptLastAttemptAt,
        lastError: row.attemptLastError,
        lastHttpStatus: row.attemptLastHttpStatus,
        lastTxStatus: parseDownstreamTxStatus(row.attemptLastTxStatus),
        nextRetryAt: row.attemptNextRetryAt,
        serviceSlug: row.attemptServiceSlug,
        status: parseDeliveryAttemptStatus(row.attemptStatus),
        updatedAt: row.attemptUpdatedAt,
      },
      transfer: {
        asset: "rsp-coin",
        amountTon: row.amountTon,
        fromRawAddress: row.fromRawAddress,
        id: row.id,
        isCanceled: row.isCanceled,
        memo: row.memo,
        memoType: row.memoType,
        now: row.now,
        toRawAddress: row.toRawAddress,
        txBlockSeqno: row.txBlockSeqno,
        txHashHex: row.txHashHex,
        txLt: row.txLt,
        userId,
      },
    }];
  });
}

export async function markDeliveryAttemptTerminalFailed(args: {
  attemptId: number;
  db: AppDatabaseExecutor;
  errorMessage: string;
  httpStatus: number | null;
}): Promise<void> {
  const now = new Date().toISOString();

  await args.db
    .update(downstreamDeliveryAttemptsTable)
    .set({
      attemptCount: sql`${downstreamDeliveryAttemptsTable.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: args.errorMessage,
      lastHttpStatus: args.httpStatus,
      nextRetryAt: null,
      status: deliveryAttemptStatus.terminalFailed,
      updatedAt: now,
    })
    .where(eq(downstreamDeliveryAttemptsTable.id, args.attemptId));
}

export async function loadNextDeliverableTransferAfterHash(args: {
  db: AppDatabaseExecutor;
  network: Network;
  remoteHash: string | null;
  walletRawAddress: string;
}): Promise<NextDeliverableTransferResult> {
  let cursorRow: CursorRow | null = null;

  if (args.remoteHash !== null) {
    const [matchedCursorRow] = await args.db
      .select({
        id: incomingTransfersTable.id,
        txLt: incomingTransfersTable.txLt,
        txNow: incomingTransfersTable.txNow,
      })
      .from(incomingTransfersTable)
      .where(
        and(
          eq(incomingTransfersTable.network, args.network),
          eq(incomingTransfersTable.walletRawAddress, args.walletRawAddress),
          eq(incomingTransfersTable.txHashHex, args.remoteHash),
        ),
      )
      .limit(1);

    if (!matchedCursorRow) {
      return {
        mode: "cursor_mismatch",
        remoteHash: args.remoteHash,
      };
    }

    cursorRow = matchedCursorRow;
  }

  const validDeliveryFilter = and(
    eq(incomingTransfersTable.network, args.network),
    eq(incomingTransfersTable.walletRawAddress, args.walletRawAddress),
    eq(incomingTransfersTable.memoType, "text_comment"),
    isNotNull(incomingTransfersTable.memo),
    sql`btrim(${incomingTransfersTable.memo}) <> ''`,
  );

  const cursorBoundaryFilter =
    cursorRow === null
      ? undefined
      : sql`(
          ${incomingTransfersTable.txNow} > ${cursorRow.txNow}
          OR (
            ${incomingTransfersTable.txNow} = ${cursorRow.txNow}
            AND CAST(${incomingTransfersTable.txLt} AS numeric) > CAST(${cursorRow.txLt} AS numeric)
          )
          OR (
            ${incomingTransfersTable.txNow} = ${cursorRow.txNow}
            AND CAST(${incomingTransfersTable.txLt} AS numeric) = CAST(${cursorRow.txLt} AS numeric)
            AND ${incomingTransfersTable.id} > ${cursorRow.id}
          )
        )`;

  const [row] = await args.db
    .select({
      amountTon: incomingTransfersTable.amountTon,
      fromRawAddress: incomingTransfersTable.fromRawAddress,
      id: incomingTransfersTable.id,
      isCanceled: incomingTransfersTable.isCanceled,
      memo: incomingTransfersTable.memo,
      memoType: incomingTransfersTable.memoType,
      now: incomingTransfersTable.txNow,
      toRawAddress: incomingTransfersTable.toRawAddress,
      txBlockSeqno: incomingTransfersTable.txBlockSeqno,
      txHashHex: incomingTransfersTable.txHashHex,
      txLt: incomingTransfersTable.txLt,
    })
    .from(incomingTransfersTable)
    .where(
      cursorBoundaryFilter ? and(validDeliveryFilter, cursorBoundaryFilter) : validDeliveryFilter,
    )
    .orderBy(
      asc(incomingTransfersTable.txNow),
      sql`CAST(${incomingTransfersTable.txLt} AS numeric)`,
      asc(incomingTransfersTable.id),
    )
    .limit(1);

  if (!row || row.memo === null || row.memoType !== "text_comment") {
    return {
      mode: "ready",
      transfer: null,
    };
  }

  const userId = extractUserIdFromMemo({
    memo: row.memo,
    memoType: row.memoType,
  });

  if (userId === null) {
    return {
      mode: "ready",
      transfer: null,
    };
  }

  return {
    mode: "ready",
    transfer: {
      asset: "rsp-coin",
      amountTon: row.amountTon,
      fromRawAddress: row.fromRawAddress,
      id: row.id,
      isCanceled: row.isCanceled,
      memo: row.memo,
      memoType: row.memoType,
      now: row.now,
      toRawAddress: row.toRawAddress,
      txBlockSeqno: row.txBlockSeqno,
      txHashHex: row.txHashHex,
      txLt: row.txLt,
      userId,
    },
  };
}

function parseDeliveryAttemptStatus(status: string): DeliveryAttemptStatus {
  switch (status) {
    case deliveryAttemptStatus.delivered:
    case deliveryAttemptStatus.pending:
    case deliveryAttemptStatus.retryScheduled:
    case deliveryAttemptStatus.terminalFailed:
      return status;
    default:
      throw new Error(`Unsupported delivery attempt status: ${status}`);
  }
}

function parseDownstreamTxStatus(status: string | null): DownstreamTxStatus | null {
  switch (status) {
    case null:
      return null;
    case downstreamTxStatus.error:
    case downstreamTxStatus.pending:
    case downstreamTxStatus.success:
      return status;
    default:
      throw new Error(`Unsupported downstream tx status: ${status}`);
  }
}
