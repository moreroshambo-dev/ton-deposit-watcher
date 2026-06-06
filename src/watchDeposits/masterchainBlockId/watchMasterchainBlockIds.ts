import { LiteClient } from 'ton-lite-client';
import { sleep } from '~/shared/utils/sleep';
import { withRetry } from '~/shared/utils/withRetry';
import type { Logger } from "pino";
import { MasterchainBlockId } from './types';

type WatchMasterchainBlockIdsOptions = {
  logger: Logger;
  pollIntervalMs: number;
  signal?: AbortSignal;
};

const isSameBlock = (
  blockIdA?: MasterchainBlockId | null,
  blockIdB?: MasterchainBlockId | null
) => {
  return (
    blockIdA
    && blockIdB
    && blockIdA.seqno.toString() == blockIdB.seqno.toString()
    && blockIdA.shard.toString() == blockIdB.shard.toString()
    && blockIdA.workchain == blockIdB.workchain
  )
}

/**
 * Непрерывно отслеживает изменение последнего masterchain-блока TON.
 *
 * Периодически опрашивает lite server через `getMasterchainInfo`
 * и yield'ит `mc.last` каждый раз, когда меняется `seqno`
 * последнего masterchain-блока.
 *
 * При старте функция сразу yield'ит текущий chain head.
 *
 * Важно: если между двумя polling-итерациями появилось несколько блоков,
 * функция yield'ит только последний актуальный masterchain block id,
 * а не каждый пропущенный seqno.
 *
 * Пример:
 *
 * ```ts
 * for await (const blockId of watchMasterchainBlockIds(client, { logger })) {
 *   console.log('Новый masterchain block:', blockId.seqno);
 *
 *   const block = await client.getBlock(blockId);
 * }
 * ```
 *
 * @param client Экземпляр TON LiteClient.
 * @param options Опции watcher'а.
 * @param options.logger Экземпляр pino logger.
 * @param options.signal AbortSignal для graceful shutdown.
 *
 * @yields Идентификатор последнего masterchain-блока.
 */
export async function* watchMasterchainBlockIds(
  client: LiteClient,
  options: WatchMasterchainBlockIdsOptions,
): AsyncGenerator<MasterchainBlockId, void, unknown> {
  let lastBlockId: MasterchainBlockId | null = null;

  const log = options.logger.child({
    fn: 'watchMasterchainBlockIds',
  });

  while (!options.signal?.aborted) {
    const mc = await withRetry(
      () => client.getMasterchainInfo(),
      {
        op: 'getMasterchainInfo',
        logger: log,
        maxAttempts: 10,
        baseDelayMs: 400,
        maxDelayMs: 5000,
      }
    )

    if (!isSameBlock(lastBlockId, mc.last)) {
      log.info('new block seqno %d', mc.last.seqno)

      yield mc.last

      lastBlockId = mc.last
    }

    await sleep(options.pollIntervalMs, options.signal)
  }
}
