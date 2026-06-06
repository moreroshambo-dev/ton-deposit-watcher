import { Cell, loadTransaction, Transaction } from '@ton/core';
import { Logger } from 'pino';
import type { BlockID, LiteClient } from 'ton-lite-client';
import { withRetry } from '~/shared/utils/withRetry';
import { createParserCursorByTx, ParserCursor } from './createParserCursorByTx';
import { bufferToBigInt } from '~/shared/utils/bufferToBigInt';

type IterateAccountTransactionsOptions = {
  logger: Logger,
  signal?: AbortSignal
  /**
   * Размер пачки транзакций за один запрос.
   */
  batchSize?: number;
}

type IterateAccountTransactionsPayload = {
  /**
   * Самая новая транзакция, от которой начинаем читать историю назад.
   */
  from: ParserCursor,
  /**
   * Это самая старая транза на которой остановимся
   * Если не передать — чтение пойдет до самого начала истории аккаунта.
   * 
   * Транзакция с `to` не будет yield'иться.
   */
  to?: ParserCursor
};

/**
 * Итерирует транзакции аккаунта от текущей последней транзакции
 * назад до последней уже обработанной транзакции.
 *
 * Порядок yield: от новых транзакций к старым.
 */
export async function* iterateAccountTransactions(
  client: LiteClient,
  payload: IterateAccountTransactionsPayload,
  options: IterateAccountTransactionsOptions,
): AsyncGenerator<{tx: Transaction, blockId: BlockID}> {
  const log = options.logger.child({
    fn: 'iterateAccountTransactions'
  })
  const batchSize = options.batchSize ?? 100;

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer');
  }

  if (payload.to && payload.from.lt <= payload.to.lt) {
    throw new Error('from.lt must be greater than to.lt');
  }

  let txCursor: ParserCursor = payload.from

  while (!options.signal?.aborted) {
    let lastTxInPage: Transaction | null = null;

    const page = await withRetry(
      () => client.getAccountTransactions(
        txCursor.address,
        txCursor.lt.toString(),
        txCursor.hash,
        batchSize,
      ),
      {
        op: 'client.getAccountTransactions',
        logger: log,
        signal: options.signal,
      }
    )

    const pageCells = Cell.fromBoc(page.transactions)

    if (pageCells.length !== page.ids.length) {
      throw new Error(
        `client.getAccountTransactions returned ${pageCells.length} transactions and ${page.ids.length} block ids`
      );
    }

    if (pageCells.length === 0) {
      return;
    }

    for (let cellIndex = 0; cellIndex < pageCells.length; cellIndex++) {
      const tx = loadTransaction(pageCells[cellIndex].beginParse())
      
      if (payload.to && tx.lt <= payload.to.lt) {
        return;
      }

      lastTxInPage = tx

      log.info('new tx: %s; tx-now=%s', bufferToBigInt(tx.hash()).toString(16), new Date(tx.now * 1000).toLocaleString())

      yield {tx, blockId: page.ids[cellIndex]}
    }

    if (
      !lastTxInPage ||
      lastTxInPage.prevTransactionLt === 0n
    ) {
      return;
    }

    txCursor = createParserCursorByTx(
      {
        lt: lastTxInPage.prevTransactionLt,
        hash: lastTxInPage.prevTransactionHash,
      },
      txCursor.address,
    )
  }
}
