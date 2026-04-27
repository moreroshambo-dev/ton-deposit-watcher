import type { Logger } from "pino";

import { buildProcessTxRequest } from "../domain/deposit-delivery/build-process-tx-request";
import { computeNextRetryAt } from "../domain/deposit-delivery/retry-policy";
import { deliveryAttemptStatus, type DownstreamService } from "../domain/deposit-delivery/types";
import type { Network } from "../domain/cursor/types";
import type { AppDatabase } from "../infrastructure/db/client";
import {
  ensureDeliveryAttempt,
  loadPendingFinalizationTransfers,
  loadNextDeliverableTransferAfterHash,
  markDeliveryAttemptDelivered,
  markDeliveryAttemptRetryScheduled,
  markDeliveryAttemptTerminalFailed,
} from "../infrastructure/db/downstream-delivery-repository";
import {
  DownstreamHttpError,
  fetchDownstreamCursor,
  sendProcessTxRequest,
} from "../infrastructure/downstream-http/client";

export async function runDownstreamDispatchPass(args: {
  db: AppDatabase;
  downstreamServices: DownstreamService[];
  logger: Logger;
  network: Network;
  currentBlockSeqno?: number;
  walletRawAddress: string;
}): Promise<void> {
  const log = args.logger.child({ scope: "downstream_dispatch" });
  const services = args.downstreamServices;

  if (services.length === 0) {
    log.debug("No downstream services configured");
    return;
  }

  for (const service of services) {
    try {
      await dispatchServiceBacklog({
        db: args.db,
        logger: log,
        network: args.network,
        service,
        currentBlockSeqno: args.currentBlockSeqno,
        walletRawAddress: args.walletRawAddress,
      });
    } catch (error) {
      log.error(
        {
          err: error,
          serviceSlug: service.slug,
        },
        "Downstream service dispatch pass failed",
      );
    }
  }
}

async function dispatchServiceBacklog(args: {
  db: AppDatabase;
  logger: Logger;
  network: Network;
  service: DownstreamService;
  currentBlockSeqno?: number;
  walletRawAddress: string;
}): Promise<void> {
  const log = args.logger.child({
    scope: "downstream_service_dispatch",
    serviceSlug: args.service.slug,
  });
  const cursorResponse = await fetchDownstreamCursor({
    logger: log,
    service: args.service,
    network: args.network,
  });

  log.info(
    {
      remoteHash: cursorResponse.hash,
    },
    "Fetched downstream remote cursor",
  );

  let effectiveCursorHash = cursorResponse.hash;

  if (args.currentBlockSeqno !== undefined) {
    const pendingFinalizationTransfers = await loadPendingFinalizationTransfers({
      currentBlockSeqno: args.currentBlockSeqno,
      db: args.db,
      network: args.network,
      serviceSlug: args.service.slug,
      walletRawAddress: args.walletRawAddress,
    });

    for (const pendingFinalization of pendingFinalizationTransfers) {
      const accepted = await dispatchTransferUpdate({
        attempt: pendingFinalization.attempt,
        currentBlockSeqno: args.currentBlockSeqno,
        db: args.db,
        log,
        network: args.network,
        service: args.service,
        transfer: pendingFinalization.transfer,
      });

      if (!accepted) {
        return;
      }
    }
  }

  while (true) {
    const nextTransferResult = await loadNextDeliverableTransferAfterHash({
      db: args.db,
      network: args.network,
      remoteHash: effectiveCursorHash,
      walletRawAddress: args.walletRawAddress,
    });

    if (nextTransferResult.mode === "cursor_mismatch") {
      log.error(
        {
          remoteHash: nextTransferResult.remoteHash,
        },
        "Downstream remote cursor hash was not found locally, skipping this service",
      );
      return;
    }

    const transfer = nextTransferResult.transfer;

    if (!transfer) {
      log.debug("No deliverable transfers available for downstream service");
      return;
    }

    const attempt = await ensureDeliveryAttempt({
      db: args.db,
      incomingTransferId: transfer.id,
      serviceSlug: args.service.slug,
    });

    if (attempt.status === deliveryAttemptStatus.terminalFailed) {
      log.error(
        {
          lastError: attempt.lastError,
          txHashHex: transfer.txHashHex,
        },
        "Downstream service is blocked by a terminal delivery failure",
      );
      return;
    }

    if (
      attempt.status === deliveryAttemptStatus.retryScheduled &&
      attempt.nextRetryAt &&
      new Date(attempt.nextRetryAt) > new Date()
    ) {
      log.debug(
        {
          nextRetryAt: attempt.nextRetryAt,
          txHashHex: transfer.txHashHex,
        },
        "Downstream delivery retry is not due yet",
      );
      return;
    }

    const accepted = await dispatchTransferUpdate({
      attempt,
      currentBlockSeqno: args.currentBlockSeqno ?? transfer.txBlockSeqno,
      db: args.db,
      log,
      network: args.network,
      service: args.service,
      transfer,
    });

    if (accepted) {
      effectiveCursorHash = transfer.txHashHex;
    } else {
      return;
    }
  }
}

async function dispatchTransferUpdate(args: {
  attempt: Awaited<ReturnType<typeof ensureDeliveryAttempt>>;
  currentBlockSeqno: number;
  db: AppDatabase;
  log: Logger;
  network: Network;
  service: DownstreamService;
  transfer: Parameters<typeof buildProcessTxRequest>[0]["transfer"];
}): Promise<boolean> {
  const request = buildProcessTxRequest({
    currentBlockSeqno: args.currentBlockSeqno,
    transfer: args.transfer,
    network: args.network,
  });

  args.log.info(
    {
      amountTon: args.transfer.amountTon,
      attempt: args.attempt.attemptCount + 1,
      txHashHex: args.transfer.txHashHex,
      txStatus: request.txUpdate.status,
      userId: args.transfer.userId,
    },
    "Dispatching transfer to downstream service",
  );

  try {
    const response = await sendProcessTxRequest({
      logger: args.log,
      request,
      service: args.service,
    });

    await markDeliveryAttemptDelivered({
      attemptId: args.attempt.id,
      db: args.db,
      httpStatus: response.httpStatus,
      txStatus: request.txUpdate.status,
    });

    args.log.info(
      {
        httpStatus: response.httpStatus,
        txHashHex: args.transfer.txHashHex,
        txStatus: request.txUpdate.status,
      },
      "Downstream service accepted transfer",
    );

    return true;
  } catch (error) {
    const normalizedError = normalizeDispatchError(error);

    if (normalizedError.isRetryable) {
      const nextRetryAt = computeNextRetryAt({
        attemptCount: args.attempt.attemptCount + 1,
      });

      await markDeliveryAttemptRetryScheduled({
        attemptId: args.attempt.id,
        db: args.db,
        errorMessage: normalizedError.message,
        httpStatus: normalizedError.httpStatus,
        nextRetryAt,
      });

      args.log.warn(
        {
          lastError: normalizedError.message,
          nextRetryAt,
          txHashHex: args.transfer.txHashHex,
          txStatus: request.txUpdate.status,
        },
        "Scheduled downstream delivery retry",
      );
    } else {
      await markDeliveryAttemptTerminalFailed({
        attemptId: args.attempt.id,
        db: args.db,
        errorMessage: normalizedError.message,
        httpStatus: normalizedError.httpStatus,
      });

      args.log.error(
        {
          err: normalizedError,
          txHashHex: args.transfer.txHashHex,
          txStatus: request.txUpdate.status,
        },
        "Marked downstream delivery as terminal failure",
      );
    }

    return false;
  }
}

function normalizeDispatchError(error: unknown): DownstreamHttpError {
  if (error instanceof DownstreamHttpError) {
    return error;
  }

  return new DownstreamHttpError({
    cause: error,
    httpStatus: null,
    isRetryable: true,
    message: error instanceof Error ? error.message : "Unknown downstream dispatch error",
  });
}
