import {type Cell, type Address, type Transaction} from "@ton/core";
import { BlockID } from "ton-lite-client";

export function parseTonMemoFromBody(body: Cell): string | null {
  const slice = body.beginParse();

  if (slice.remainingBits < 32) {
    return null;
  }

  const op = slice.loadUint(32);

  if (op !== 0) {
    return null;
  }

  // binary comment marker: 0xff
  if (slice.remainingBits >= 8) {
    const marker = slice.preloadUint(8);

    if (marker === 0xff) {
      return null;
    }
  }

  return slice.loadStringTail();
}

function parseTonTextMemo(tx: Transaction): string | null {
  const body = tx.inMessage?.body;

  if (!body) {
    return null;
  }

  return parseTonMemoFromBody(body);
}

export type TonDeposit = {
  lt: bigint;
  hash: Buffer;
  from: Address;
  to: Address;
  amount: bigint;
  memo: string | null;
  tx: Transaction;
  now: number
  masterchainSeqno: number
  shardSeqno: number
  shardWorkchain: number,
  shard: bigint
};

type TxEntityToDepositEntityPayload = {
  tx: Transaction,
  txShardBlockId: BlockID,
  masterchainBlockId: BlockID,
  depositAddress: Address,
}

export function txEntityToDepositEntity(payload: TxEntityToDepositEntityPayload): TonDeposit | null {
  const msg = payload.tx.inMessage;

  if (!msg) {
    return null;
  }

  if (msg.info.type !== 'internal') {
    return null;
  }

  if (msg.info.bounced) {
    return null;
  }

  if (msg.info.value.coins <= 0n) {
    return null;
  }

  if (!msg.info.dest.equals(payload.depositAddress)) {
    return null;
  }

  return {
    lt: payload.tx.lt,
    hash: payload.tx.hash(),
    from: msg.info.src ?? null,
    to: msg.info.dest,
    amount: msg.info.value.coins,
    memo: parseTonTextMemo(payload.tx),
    now: payload.tx.now,
    tx: payload.tx,
    masterchainSeqno: payload.masterchainBlockId.seqno,
    shardSeqno: payload.txShardBlockId.seqno,
    shardWorkchain: payload.txShardBlockId.workchain,
    shard: BigInt(payload.txShardBlockId.shard),
  };
}