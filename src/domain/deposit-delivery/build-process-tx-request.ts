import { Network } from "../cursor/types";
import {
  type DeliverableIncomingTransfer,
  type DownstreamProcessTxRequest,
  type DownstreamTxStatus,
  downstreamTxStatus,
} from "./types";

const SUCCESS_AFTER_BLOCKS = 10;

export function buildProcessTxRequest(
  payload: {
    currentBlockSeqno: number;
    network: Network;
    transfer: DeliverableIncomingTransfer;
  }
): DownstreamProcessTxRequest {
  return {
    network: payload.network,
    txUpdate: {
      amount: payload.transfer.amountTon,
      asset: payload.transfer.asset,
      network: payload.network,
      creditedTokens: payload.transfer.amountTon,
      from: payload.transfer.fromRawAddress,
      hash: payload.transfer.txHashHex,
      initiatedAt: payload.transfer.now,
      status: resolveDownstreamTxStatus({
        currentBlockSeqno: payload.currentBlockSeqno,
        isCanceled: payload.transfer.isCanceled,
        txBlockSeqno: payload.transfer.txBlockSeqno,
      }),
      to: payload.transfer.toRawAddress,
      userId: payload.transfer.userId,
    },
  };
}

export function resolveDownstreamTxStatus(args: {
  currentBlockSeqno: number;
  isCanceled: boolean;
  txBlockSeqno: number;
}): DownstreamTxStatus {
  if (args.isCanceled) {
    return downstreamTxStatus.error;
  }

  const confirmations = args.currentBlockSeqno - args.txBlockSeqno;

  return confirmations <= SUCCESS_AFTER_BLOCKS
    ? downstreamTxStatus.pending
    : downstreamTxStatus.success;
}
