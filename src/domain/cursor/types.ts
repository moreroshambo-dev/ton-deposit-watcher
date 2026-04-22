import { z } from "zod";

export const networkSchema = z.enum(["mainnet", "testnet"]);
export type Network = z.infer<typeof networkSchema>;

const hexHashSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Expected a 32-byte hex string")
  .transform((value) => value.toLowerCase());

export const transactionCursorSchema = z.object({
  lt: z.string().regex(/^\d+$/, "Transaction lt must be a decimal string"),
  hashHex: hexHashSchema,
});

export const blockCursorSchema = z.object({
  seqno: z.number().int().nonnegative(),
  shard: z.string().min(1),
  workchain: z.number().int(),
  rootHashHex: hexHashSchema,
  fileHashHex: hexHashSchema,
});

export const syncCursorSchema = z.object({
  version: z.literal(1),
  network: networkSchema,
  walletRawAddress: z.string().min(1),
  lastProcessedTx: transactionCursorSchema.nullable(),
  lastProcessedBlock: blockCursorSchema,
  updatedAt: z.string().datetime({ offset: true }),
});

export type TransactionCursor = z.infer<typeof transactionCursorSchema>;
export type BlockCursor = z.infer<typeof blockCursorSchema>;
export type SyncCursor = z.infer<typeof syncCursorSchema>;
