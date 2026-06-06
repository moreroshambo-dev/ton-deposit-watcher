import {
  bigint,
  integer,
  pgTable,
  text,
  unique,
  varchar,
  date,
  foreignKey,
} from "drizzle-orm/pg-core";

export const blockIdTable = pgTable(
  'blockId', 
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    workchain: integer().notNull(),
    network: text({enum: ['ton', 'ton-testnet']}).notNull(),
    shard: bigint({mode: 'bigint'}),
    seqno: bigint({mode: 'number'}).notNull(),
    rootHash: varchar("rootHash", { length: 64 }).unique().notNull(),
    fileHash: varchar("fileHash", { length: 64 }).unique().notNull(),
  },
  (table) => [
    unique('blockId_seqno_workchain').on(table.seqno, table.workchain),
  ]
);

export const depositTable = pgTable(
  'deposits_tx', 
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    hash: varchar("hash", { length: 128 }).unique().notNull(),
    amount: bigint({mode: 'bigint'}).notNull(),
    lt: bigint({mode: 'bigint'}).notNull(),
    from: varchar({ length: 128 }).notNull(),
    to: varchar({ length: 128 }).notNull(),
    memo: varchar({length: 256}),
    now: date({mode: 'date'}).notNull(),
    status: text({enum: ['pending', 'confirmed', 'canceled']}).notNull(),
    network: text({enum: ['ton', 'ton-testnet']}).notNull(),
    masterchainSeqno: bigint({mode: 'number'}).notNull(),
    shardWorkchain: integer().notNull(),
    shardRootHash: varchar("rootHash", { length: 64 }).notNull(),
    shardFileHash: varchar("fileHash", { length: 64 }).notNull(),
    shardSeqno: bigint({mode: 'number'}).notNull(),
    shard: bigint({mode: 'bigint'}).notNull(),
  },
  (table) => [
    unique('deposits_tx_from_lt').on(table.from, table.lt),
  ]
);

export type DepositTableSelect = typeof depositTable.$inferSelect;

export const downstreamQueueTable = pgTable(
  'downstream',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    downstreamSlug: varchar({ length: 32 }).notNull(),
    status: text({enum: ['queue', 'sending', 'error', 'done']}).notNull(),
    
    depositTxId: integer().notNull(),
    userId: varchar({ length: 64 }).notNull(),
    from: varchar({ length: 128 }).notNull(),
    hash: varchar({ length: 128 }).notNull(),
    nanoTON: bigint({mode: 'bigint'}).notNull(),
    creditedTokens: integer().default(0).notNull(),
    txStatus: text({enum: ['pending', 'confirmed', 'canceled']}).notNull(),
    network: text({enum: ['ton', 'ton-testnet']}).notNull(),
    initiatedAt: date({mode: 'date'}).defaultNow().notNull(),
    downstreamHttpError: text(),
  },
  (table) => [
    foreignKey({
      name: "depositTx_fk",
      columns: [table.depositTxId],
      foreignColumns: [depositTable.id],
    })
  ]
)

export type DownstreamQueueTableSelect = typeof downstreamQueueTable.$inferSelect;
export type DownstreamQueueTableInsert = typeof downstreamQueueTable.$inferInsert;


export const schema = {
  blockIdTable,
  depositTable,
  downstreamQueueTable,
};
