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
  shardWorkchain: number,
  shardRootHash: string,
  shardFileHash: string,
  shardSeqno: number
  shard: bigint
};

type TxEntityToDepositEntityPayload = {
  tx: Transaction,
  txShardBlockId: BlockID,
  masterchainBlockId: BlockID,
  depositAddress: Address,
}

/**
 * Преобразует TON-транзакцию в депозит, если она удовлетворяет всем условиям.
 *
 * Функция проверяет транзакцию по следующим критериям (при несоответствии возвращает `null`):
 *
 * - Транзакция имеет входящее сообщение
 * - Входящее сообщение внутреннее (`internal`), не bounced
 * - Сумма перевода больше нуля
 * - Получатель совпадает с `depositAddress`
 * - Тип транзакции — `generic`
 * - `computePhase` завершилась успешно (тип `vm`, `success: true`)
 * - `actionPhase` завершилась успешно (если присутствует)
 *
 * Последние два условия защищают от сохранения failed-транзакций,
 * которые могли быть отправлены злоумышленником намеренно —
 * например, отменённый или заведомо failing перевод.
 *
 * @param payload.tx - Транзакция полученная из блокчейна.
 * @param payload.txShardBlockId - Шардовый блок в котором находится транзакция.
 *   Используется для последующей верификации через `getAccountTransaction`.
 * @param payload.masterchainBlockId - Masterchain-блок на момент обнаружения транзакции.
 *   `seqno` используется для отслеживания подтверждений — депозит считается
 *   подтверждённым когда текущий masterchain seqno превысит этот на N блоков.
 * @param payload.depositAddress - Адрес депозитного кошелька.
 *   Транзакции на другие адреса отбрасываются.
 *
 * @returns `TonDeposit` если транзакция является валидным депозитом, иначе `null`.
 */
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

  if (payload.tx.description.type !== 'generic') {
    return null;
  }

  const { computePhase, actionPhase } = payload.tx.description;

  if (computePhase.type !== 'vm' || !computePhase.success) {
    return null;
  }

  if (actionPhase && !actionPhase.success) {
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
    shardWorkchain: payload.txShardBlockId.workchain,
    shardRootHash: payload.txShardBlockId.rootHash.toHex(),
    shardFileHash: payload.txShardBlockId.fileHash.toHex(),
    shardSeqno: payload.txShardBlockId.seqno,
    shard: BigInt(payload.txShardBlockId.shard),
  };
}