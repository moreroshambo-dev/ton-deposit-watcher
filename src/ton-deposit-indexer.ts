import {
  Address,
  Cell,
  fromNano,
  loadTransaction,
  type Transaction,
} from "@ton/core";
import {
  LiteClient,
  LiteRoundRobinEngine,
  LiteSingleEngine,
  type BlockID,
  type LiteEngine,
} from "ton-lite-client";
import { z } from "zod";

import type { BlockCursor, Network, SyncCursor, TransactionCursor } from "./cursor-store";

const liteServerSchema = z
  .object({
    ip: z.number().int(),
    port: z.number().int().positive(),
    id: z.object({
      "@type": z.literal("pub.ed25519"),
      key: z.string().min(1),
    }),
  })
  .passthrough();

const globalConfigSchema = z
  .object({
    liteservers: z.array(liteServerSchema).optional().default([]),
    liteservers_v2: z.array(liteServerSchema).optional().default([]),
  })
  .transform((value) => [...value.liteservers, ...value.liteservers_v2]);

type LiteServer = z.infer<typeof liteServerSchema>;

type MessageMemo =
  | {
      memo: null;
      memoOpcode: null;
      memoType: "empty";
    }
  | {
      memo: string;
      memoOpcode: 0;
      memoType: "text_comment";
    }
  | {
      memo: null;
      memoOpcode: number | null;
      memoType: "binary";
    };

export type ParsedIncomingTransfer = {
  amountNano: string;
  amountTon: string;
  bodyBocBase64: string;
  fromRawAddress: string;
  memo: string | null;
  memoOpcode: number | null;
  memoType: MessageMemo["memoType"];
  now: number;
  nowIso: string;
  toRawAddress: string;
  txHashHex: string;
  txLt: string;
};

export type SyncIncomingTransfersResult = {
  cursorAfter: SyncCursor;
  cursorBefore: SyncCursor | null;
  incomingTransfers: ParsedIncomingTransfer[];
  scannedTransactions: number;
  snapshotBlock: BlockCursor;
  walletFriendlyAddress: string;
  walletRawAddress: string;
};

export async function createLiteClientFromConfigUrl(globalConfigUrl: string): Promise<{
  client: LiteClient;
  engine: LiteEngine;
  serverCount: number;
}> {
  const liteServers = await loadLiteServers(globalConfigUrl);
  const engine = new LiteRoundRobinEngine(
    liteServers.map(
      (server) =>
        new LiteSingleEngine({
          host: `tcp://${intToIP(server.ip)}:${server.port}`,
          publicKey: Buffer.from(server.id.key, "base64"),
        }),
    ),
  );

  return {
    client: new LiteClient({ engine }),
    engine,
    serverCount: liteServers.length,
  };
}

export async function syncIncomingTransfers(args: {
  batchSize: number;
  client: LiteClient;
  cursor: SyncCursor | null;
  network: Network;
  wallet: Address;
}): Promise<SyncIncomingTransfersResult> {
  const { batchSize, client, cursor, network, wallet } = args;
  const walletRawAddress = wallet.toRawString();
  const walletFriendlyAddress = wallet.toString({
    bounceable: true,
    testOnly: network === "testnet",
    urlSafe: true,
  });

  const masterchainInfo = await client.getMasterchainInfo();
  const snapshotBlock = toBlockCursor(masterchainInfo.last);
  const accountState = await client.getAccountState(wallet, masterchainInfo.last);
  const latestTransaction = toLastProcessedTx(accountState.lastTx);

  if (latestTransaction === null) {
    if (cursor?.lastProcessedTx) {
      throw new Error(
        "The wallet has a cursor transaction, but the lite server did not return the current account lastTx. Refusing to continue because this can skip history.",
      );
    }

    return {
      cursorAfter: buildCursor({
        lastProcessedBlock: snapshotBlock,
        lastProcessedTx: null,
        network,
        walletRawAddress,
      }),
      cursorBefore: cursor,
      incomingTransfers: [],
      scannedTransactions: 0,
      snapshotBlock,
      walletFriendlyAddress,
      walletRawAddress,
    };
  }

  if (cursor?.lastProcessedTx && isSameCursor(cursor.lastProcessedTx, latestTransaction)) {
    return {
      cursorAfter: buildCursor({
        lastProcessedBlock: snapshotBlock,
        lastProcessedTx: latestTransaction,
        network,
        walletRawAddress,
      }),
      cursorBefore: cursor,
      incomingTransfers: [],
      scannedTransactions: 0,
      snapshotBlock,
      walletFriendlyAddress,
      walletRawAddress,
    };
  }

  const transactions = await loadTransactionsSinceCursor({
    address: wallet,
    batchSize,
    client,
    startFrom: latestTransaction,
    stopAtExclusive: cursor?.lastProcessedTx ?? null,
  });

  const chronologicalTransactions = [...transactions].reverse();
  const incomingTransfers = chronologicalTransactions
    .map((transaction) => mapIncomingTransfer(transaction, wallet))
    .filter((value): value is ParsedIncomingTransfer => value !== null);

  return {
    cursorAfter: buildCursor({
      lastProcessedBlock: snapshotBlock,
      lastProcessedTx: latestTransaction,
      network,
      walletRawAddress,
    }),
    cursorBefore: cursor,
    incomingTransfers,
    scannedTransactions: chronologicalTransactions.length,
    snapshotBlock,
    walletFriendlyAddress,
    walletRawAddress,
  };
}

async function loadLiteServers(globalConfigUrl: string): Promise<LiteServer[]> {
  const response = await fetch(globalConfigUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch TON global config from ${globalConfigUrl}: ${response.status} ${response.statusText}`);
  }

  const rawConfig = await response.json();
  const liteServers = globalConfigSchema.parse(rawConfig);

  if (liteServers.length === 0) {
    throw new Error(`TON global config at ${globalConfigUrl} does not contain any liteservers.`);
  }

  return liteServers;
}

async function loadTransactionsSinceCursor(args: {
  address: Address;
  batchSize: number;
  client: LiteClient;
  startFrom: TransactionCursor;
  stopAtExclusive: TransactionCursor | null;
}): Promise<Transaction[]> {
  const { address, batchSize, client, startFrom, stopAtExclusive } = args;
  let pageCursor = startFrom;
  let shouldSkipFirstRepeatedTransaction = false;
  let reachedStopCursor = false;
  const transactions: Transaction[] = [];

  while (true) {
    const page = await client.getAccountTransactions(
      address,
      pageCursor.lt,
      Buffer.from(pageCursor.hashHex, "hex"),
      batchSize,
    );

    let pageTransactions = Cell.fromBoc(page.transactions).map((cell) =>
      loadTransaction(cell.beginParse()),
    );

    if (
      shouldSkipFirstRepeatedTransaction &&
      pageTransactions[0] &&
      isSameCursor(toTransactionCursor(pageTransactions[0]), pageCursor)
    ) {
      pageTransactions = pageTransactions.slice(1);
    }

    shouldSkipFirstRepeatedTransaction = true;

    if (pageTransactions.length === 0) {
      break;
    }

    const stopCursorIndex = stopAtExclusive
      ? pageTransactions.findIndex((transaction) =>
          isSameCursor(toTransactionCursor(transaction), stopAtExclusive),
        )
      : -1;

    if (stopCursorIndex >= 0) {
      transactions.push(...pageTransactions.slice(0, stopCursorIndex));
      reachedStopCursor = true;
      break;
    }

    transactions.push(...pageTransactions);
    pageCursor = toTransactionCursor(pageTransactions[pageTransactions.length - 1]);
  }

  if (stopAtExclusive && !reachedStopCursor) {
    throw new Error(
      "The saved cursor transaction was not found in the wallet history. Refusing to continue because this would reprocess the full account history.",
    );
  }

  return transactions;
}

function mapIncomingTransfer(
  transaction: Transaction,
  wallet: Address,
): ParsedIncomingTransfer | null {
  const inMessage = transaction.inMessage;

  if (!inMessage || inMessage.info.type !== "internal") {
    return null;
  }

  if (inMessage.info.bounced) {
    return null;
  }

  if (!inMessage.info.dest.equals(wallet)) {
    return null;
  }

  if (inMessage.info.value.coins <= 0n) {
    return null;
  }

  const memo = parseMessageMemo(inMessage.body);

  return {
    amountNano: inMessage.info.value.coins.toString(),
    amountTon: fromNano(inMessage.info.value.coins),
    bodyBocBase64: inMessage.body.toBoc({ idx: false }).toString("base64"),
    fromRawAddress: inMessage.info.src.toRawString(),
    memo: memo.memo,
    memoOpcode: memo.memoOpcode,
    memoType: memo.memoType,
    now: transaction.now,
    nowIso: new Date(transaction.now * 1000).toISOString(),
    toRawAddress: inMessage.info.dest.toRawString(),
    txHashHex: transaction.hash().toString("hex"),
    txLt: transaction.lt.toString(),
  };
}

function parseMessageMemo(body: Cell): MessageMemo {
  const slice = body.beginParse();

  if (slice.remainingBits === 0 && slice.remainingRefs === 0) {
    return {
      memo: null,
      memoOpcode: null,
      memoType: "empty",
    };
  }

  if (slice.remainingBits < 32) {
    return {
      memo: null,
      memoOpcode: null,
      memoType: "binary",
    };
  }

  const opcode = slice.loadUint(32);

  if (opcode !== 0) {
    return {
      memo: null,
      memoOpcode: opcode,
      memoType: "binary",
    };
  }

  try {
    return {
      memo: slice.loadStringTail(),
      memoOpcode: 0,
      memoType: "text_comment",
    };
  } catch {
    return {
      memo: null,
      memoOpcode: 0,
      memoType: "binary",
    };
  }
}

function buildCursor(args: {
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

function toLastProcessedTx(
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

function toTransactionCursor(transaction: Transaction): TransactionCursor {
  return {
    lt: transaction.lt.toString(),
    hashHex: transaction.hash().toString("hex"),
  };
}

function isSameCursor(left: TransactionCursor, right: TransactionCursor): boolean {
  return left.lt === right.lt && left.hashHex === right.hashHex;
}

function toBlockCursor(block: BlockID): BlockCursor {
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

function intToIP(value: number): string {
  const part1 = value & 255;
  const part2 = (value >> 8) & 255;
  const part3 = (value >> 16) & 255;
  const part4 = (value >> 24) & 255;

  return `${part4}.${part3}.${part2}.${part1}`;
}
