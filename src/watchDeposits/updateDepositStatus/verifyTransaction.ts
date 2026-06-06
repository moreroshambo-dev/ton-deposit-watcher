import { Address } from '@ton/core';
import { Cell, loadTransaction } from '@ton/core';
import type { LiteClient } from 'ton-lite-client';
import { withRetry } from '~/shared/utils/withRetry';
import { GenericOptions } from '~/domain/fn/types';

type VerifyTransactionPayload = {
  address: Address;
  lt: bigint;
  hash: string; // hex из БД
  shardWorkchain: number;
  shardRootHash: string;
  shardFileHash: string;
  shardSeqno: number;
  shard: bigint;
}

export const verifyTransaction = async (
  client: LiteClient,
  payload: VerifyTransactionPayload,
  options: GenericOptions,
): Promise<boolean> => {
  const log = options.logger.child({ fn: 'verifyTransaction', lt: payload.lt });

  const txInfo = await withRetry(
    () => client.getAccountTransaction(
      payload.address,
      payload.lt.toString(),
      {
        workchain: payload.shardWorkchain,
        seqno: payload.shardSeqno,
        shard: payload.shard.toString(),
        rootHash: Buffer.from(payload.shardRootHash, 'hex'),
        fileHash: Buffer.from(payload.shardFileHash, 'hex'),
      },
    ),
    {
      op: 'getAccountTransaction',
      logger: log,
      signal: options.signal,
    }
  );

  const tx = loadTransaction(
    Cell.fromBoc(txInfo.transaction)[0].beginParse()
  );

  if (tx.lt !== payload.lt) {
    log.warn('lt mismatch: expected %s, got %s', payload.lt, tx.lt);
    return false;
  }

  const actualHash = tx.hash().toString('hex');
  if (actualHash !== payload.hash) {
    log.warn('hash mismatch: expected %s, got %s', payload.hash, actualHash);
    return false;
  }

  if (tx.description.type !== 'generic') {
    log.warn('unexpected tx description type: %s', tx.description.type);
    return false;
  }

  if (tx.description.computePhase.type !== 'vm') {
    log.warn('unexpected compute phase type');
    return false;
  }

  if (!tx.description.computePhase.success) {
    log.warn('compute phase failed');
    return false;
  }

  if (tx.description.actionPhase && !tx.description.actionPhase.success) {
    log.warn('action phase failed');
    return false;
  }

  return true;
};