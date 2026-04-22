import type { SyncIncomingTransfersResult } from "../domain/deposit-sync/types";

type SyncEventEnvelope = {
  eventType: "sync_result";
  emittedAt: string;
  result: SyncIncomingTransfersResult;
};

export function writeSyncResultToStdout(result: SyncIncomingTransfersResult): void {
  const payload: SyncEventEnvelope = {
    eventType: "sync_result",
    emittedAt: new Date().toISOString(),
    result,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
