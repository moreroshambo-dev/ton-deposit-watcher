import { Address, beginCell, type Transaction } from "@ton/core";
import { describe, expect, test } from "bun:test";
import type { BlockID } from "ton-lite-client";

import { txEntityToDepositEntity } from "./txEntityToDepositEntity";

const depositAddress = Address.parse("UQDI1erifGghML1AH1ZhlVD8wV-j-sOk0w8yltj5lRwkS0Pv");

function createBlockId(args: {
  fileHash: string;
  rootHash: string;
  seqno: number;
}): BlockID {
  return {
    fileHash: { toHex: () => args.fileHash },
    rootHash: { toHex: () => args.rootHash },
    seqno: args.seqno,
    shard: "0",
    workchain: 0,
  } as unknown as BlockID;
}

describe("txEntityToDepositEntity", () => {
  test("maps shardFileHash from the shard block file hash", () => {
    const shardRootHash = "11".repeat(32);
    const shardFileHash = "22".repeat(32);
    const tx = {
      hash: () => Buffer.from("33".repeat(32), "hex"),
      inMessage: {
        body: beginCell().storeUint(0, 32).storeStringTail("user-1").endCell(),
        info: {
          bounced: false,
          dest: depositAddress,
          src: depositAddress,
          type: "internal",
          value: {
            coins: 10n,
          },
        },
      },
      lt: 123n,
      now: 1_751_910_826,
    } as unknown as Transaction;

    const deposit = txEntityToDepositEntity({
      depositAddress,
      masterchainBlockId: createBlockId({
        fileHash: "44".repeat(32),
        rootHash: "55".repeat(32),
        seqno: 1000,
      }),
      tx,
      txShardBlockId: createBlockId({
        fileHash: shardFileHash,
        rootHash: shardRootHash,
        seqno: 900,
      }),
    });

    expect(deposit?.shardRootHash).toBe(shardRootHash);
    expect(deposit?.shardFileHash).toBe(shardFileHash);
  });
});
