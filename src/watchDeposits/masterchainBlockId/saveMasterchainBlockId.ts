import { GenericOptionsWithDb } from "~/domain/fn/types";
import { MasterchainBlockId } from "./types";
import { blockIdTable } from "~/infrastructure/db/schema";

type SaveMasterchainBlockIdPayload = {
  blockId: MasterchainBlockId
}

export const saveMasterchainBlockId = async (payload: SaveMasterchainBlockIdPayload, options: GenericOptionsWithDb,) => {
  const log = options.logger.child({
    fn: 'saveMasterchainBlockId',
    seqno: payload.blockId.seqno,
    shard: payload.blockId.shard,
  })

  if (options.signal?.aborted) {
    return
  }

  await options.db.insert(blockIdTable).values({
    network: options.config.network,
    fileHash: payload.blockId.fileHash.toHex(),
    rootHash: payload.blockId.rootHash.toHex(),
    seqno: payload.blockId.seqno,
    shard: BigInt(payload.blockId.shard),
    workchain: payload.blockId.workchain,
  }).onConflictDoNothing()

  log.info('save block')
}