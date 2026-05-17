import type { TLInt, TLInt256, TLLong } from 'ton-tl';

export type MasterchainBlockId = {
  readonly workchain: TLInt;
  readonly shard: TLLong;
  readonly seqno: TLInt;
  readonly rootHash: TLInt256;
  readonly fileHash: TLInt256;
}
