import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import {
  deliveryAttemptStatus,
  type DeliverableIncomingTransfer,
  type DeliveryAttempt,
  type DeliveryAttemptStatus,
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
  serviceId: number;
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
        nextRetryAt: null,
        serviceId: transfer.serviceId,
        status: deliveryAttemptStatus.pending,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [
        downstreamDeliveryAttemptsTable.serviceId,
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
  serviceId: number;
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
      nextRetryAt: null,
      serviceId: args.serviceId,
      status: deliveryAttemptStatus.pending,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        downstreamDeliveryAttemptsTable.serviceId,
        downstreamDeliveryAttemptsTable.incomingTransferId,
      ],
    });

  const reloaded = await loadDeliveryAttempt(args);

  if (!reloaded) {
    throw new Error(
      `Failed to load delivery attempt for serviceId=${args.serviceId} incomingTransferId=${args.incomingTransferId}`,
    );
  }

  return reloaded;
}

export async function loadDeliveryAttempt(args: {
  db: AppDatabaseExecutor;
  incomingTransferId: number;
  serviceId: number;
}): Promise<DeliveryAttempt | null> {
  const [row] = await args.db
    .select()
    .from(downstreamDeliveryAttemptsTable)
    .where(
      and(
        eq(downstreamDeliveryAttemptsTable.serviceId, args.serviceId),
        eq(downstreamDeliveryAttemptsTable.incomingTransferId, args.incomingTransferId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    status: parseDeliveryAttemptStatus(row.status),
  };
}

export async function markDeliveryAttemptDelivered(args: {
  attemptId: number;
  db: AppDatabaseExecutor;
  httpStatus: number;
}): Promise<void> {
  const now = new Date().toISOString();

  await args.db
    .update(downstreamDeliveryAttemptsTable)
    .set({
      attemptCount: sql`${downstreamDeliveryAttemptsTable.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: null,
      lastHttpStatus: args.httpStatus,
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
      memo: incomingTransfersTable.memo,
      memoType: incomingTransfersTable.memoType,
      now: incomingTransfersTable.txNow,
      toRawAddress: incomingTransfersTable.toRawAddress,
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
      amountTon: row.amountTon,
      fromRawAddress: row.fromRawAddress,
      id: row.id,
      memo: row.memo,
      memoType: row.memoType,
      now: row.now,
      toRawAddress: row.toRawAddress,
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
