import type { Logger } from "pino";

import { buildProcessTxRequest } from "../domain/deposit-delivery/build-process-tx-request";
import { computeNextRetryAt } from "../domain/deposit-delivery/retry-policy";
import { deliveryAttemptStatus, type DownstreamService } from "../domain/deposit-delivery/types";
import type { Network } from "../domain/cursor/types";
import type { AppDatabase } from "../infrastructure/db/client";
import {
  ensureDeliveryAttempt,
  loadNextDeliverableTransferAfterHash,
  markDeliveryAttemptDelivered,
  markDeliveryAttemptRetryScheduled,
  markDeliveryAttemptTerminalFailed,
} from "../infrastructure/db/downstream-delivery-repository";
import { loadEnabledDownstreamServices } from "../infrastructure/db/downstream-service-repository";
import {
  DownstreamHttpError,
  fetchDownstreamCursor,
  sendProcessTxRequest,
} from "../infrastructure/downstream-http/client";

export async function runDownstreamDispatchPass(args: {
  db: AppDatabase;
  logger: Logger;
  network: Network;
  walletRawAddress: string;
}): Promise<void> {
  const log = args.logger.child({ scope: "downstream_dispatch" });
  const services = await loadEnabledDownstreamServices({
    db: args.db,
    logger: log,
  });

  if (services.length === 0) {
    log.debug("No enabled downstream services configured");
    return;
  }

  for (const service of services) {
    try {
      await dispatchServiceBacklog({
        db: args.db,
        logger: log,
        network: args.network,
        service,
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
  walletRawAddress: string;
}): Promise<void> {
  const log = args.logger.child({
    scope: "downstream_service_dispatch",
    serviceSlug: args.service.slug,
  });
  const cursorResponse = await fetchDownstreamCursor({
    logger: log,
    service: args.service,
  });

  log.info(
    {
      remoteHash: cursorResponse.hash,
    },
    "Fetched downstream remote cursor",
  );

  let effectiveCursorHash = cursorResponse.hash;

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
      serviceId: args.service.id,
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

    log.info(
      {
        amountTon: transfer.amountTon,
        attempt: attempt.attemptCount + 1,
        txHashHex: transfer.txHashHex,
        userId: transfer.userId,
      },
      "Dispatching transfer to downstream service",
    );

    try {
      const request = buildProcessTxRequest(transfer);
      const response = await sendProcessTxRequest({
        logger: log,
        request,
        service: args.service,
      });

      await markDeliveryAttemptDelivered({
        attemptId: attempt.id,
        db: args.db,
        httpStatus: response.httpStatus,
      });

      log.info(
        {
          httpStatus: response.httpStatus,
          txHashHex: transfer.txHashHex,
        },
        "Downstream service accepted transfer",
      );

      effectiveCursorHash = transfer.txHashHex;
    } catch (error) {
      const normalizedError = normalizeDispatchError(error);

      if (normalizedError.isRetryable) {
        const nextRetryAt = computeNextRetryAt({
          attemptCount: attempt.attemptCount + 1,
        });

        await markDeliveryAttemptRetryScheduled({
          attemptId: attempt.id,
          db: args.db,
          errorMessage: normalizedError.message,
          httpStatus: normalizedError.httpStatus,
          nextRetryAt,
        });

        log.warn(
          {
            lastError: normalizedError.message,
            nextRetryAt,
            txHashHex: transfer.txHashHex,
          },
          "Scheduled downstream delivery retry",
        );
      } else {
        await markDeliveryAttemptTerminalFailed({
          attemptId: attempt.id,
          db: args.db,
          errorMessage: normalizedError.message,
          httpStatus: normalizedError.httpStatus,
        });

        log.error(
          {
            err: normalizedError,
            txHashHex: transfer.txHashHex,
          },
          "Marked downstream delivery as terminal failure",
        );
      }

      return;
    }
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
