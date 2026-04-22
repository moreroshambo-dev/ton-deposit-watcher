import { type Transaction } from "@ton/core";
import { type BlockID } from "ton-lite-client";

import type { BlockCursor, Network, SyncCursor, TransactionCursor } from "../cursor/types";

export function buildCursor(args: {
  lastProcessedBlock: BlockCursor;
  lastProcessedTx: TransactionCursor | null;
  network: Network;
  walletRawAddress: string;
}): SyncCursor {
  return {
    version: 1,
    network: args.network,
    walletRawAddress: args.walletRawAddress,
    lastProcessedTx: args.lastProcessedTx,
    lastProcessedBlock: args.lastProcessedBlock,
    updatedAt: new Date().toISOString(),
  };
}

export function toLastProcessedTx(
  lastTx: { hash: bigint; lt: bigint } | null,
): TransactionCursor | null {
  if (!lastTx) {
    return null;
  }

  return {
    lt: lastTx.lt.toString(),
    hashHex: bigintToHashHex(lastTx.hash),
  };
}

export function toTransactionCursor(transaction: Transaction): TransactionCursor {
  return {
    lt: transaction.lt.toString(),
    hashHex: transaction.hash().toString("hex"),
  };
}

export function isSameCursor(left: TransactionCursor, right: TransactionCursor): boolean {
  return left.lt === right.lt && left.hashHex === right.hashHex;
}

export function toBlockCursor(block: BlockID): BlockCursor {
  return {
    seqno: block.seqno,
    shard: block.shard,
    workchain: block.workchain,
    rootHashHex: block.rootHash.toString("hex"),
    fileHashHex: block.fileHash.toString("hex"),
  };
}

function bigintToHashHex(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
