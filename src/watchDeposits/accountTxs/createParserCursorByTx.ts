import { Address, Transaction } from "@ton/core";
import { uint256ToBuffer } from "~/shared/utils/uint256ToBuffer";

/**
 * Возвращает cursor текущей транзакции.
 */
export function createParserCursorByTx(
  tx: Transaction | {
    lt: bigint;
    hash: bigint | string;
  },
  address: Address,
): ParserCursor {
  return {
    lt: tx.lt,
    hash: typeof tx.hash === 'bigint'
      ? uint256ToBuffer(tx.hash)
      : typeof tx.hash === 'string'
        ? Buffer.from(tx.hash)
        : tx.hash(),
    address,
  };
}

export type ParserCursor = {
  /**
   * В TON lt - это Logical Time (логическое время).
   * Это главный идентификатор порядка транзакций внутри аккаунта.
   * 
   * - ‼️ lt уникален только в рамках аккаунта.
   * - lt всегда растет
   */
  lt: bigint,
  hash: Buffer
  address: Address;
}