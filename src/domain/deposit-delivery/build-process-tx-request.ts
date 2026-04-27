import {
  DOWNSTREAM_ASSET,
  DOWNSTREAM_BLOCKCHAIN,
  DOWNSTREAM_TX_STATUS,
  type DeliverableIncomingTransfer,
  type DownstreamProcessTxRequest,
} from "./types";

export function buildProcessTxRequest(
  transfer: DeliverableIncomingTransfer,
): DownstreamProcessTxRequest {
  return {
    blockchain: DOWNSTREAM_BLOCKCHAIN,
    txUpdate: {
      amount: transfer.amountTon,
      asset: DOWNSTREAM_ASSET,
      blockchain: DOWNSTREAM_BLOCKCHAIN,
      creditedTokens: transfer.amountTon,
      from: transfer.fromRawAddress,
      hash: transfer.txHashHex,
      initiatedAt: transfer.now,
      status: DOWNSTREAM_TX_STATUS,
      to: transfer.toRawAddress,
      userId: transfer.userId,
    },
  };
}
