import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

export async function loadCursor(
  cursorPath: string,
  walletRawAddress: string,
  network: Network,
): Promise<SyncCursor | null> {
  let raw: string;

  try {
    raw = await readFile(cursorPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }

  const parsed = syncCursorSchema.parse(JSON.parse(raw));

  if (parsed.walletRawAddress !== walletRawAddress) {
    throw new Error(
      [
        `Cursor at "${cursorPath}" belongs to ${parsed.walletRawAddress},`,
        `but the current wallet is ${walletRawAddress}.`,
      ].join(" "),
    );
  }

  if (parsed.network !== network) {
    throw new Error(
      `Cursor at "${cursorPath}" belongs to ${parsed.network}, but the current network is ${network}.`,
    );
  }

  return parsed;
}

export async function saveCursor(cursorPath: string, cursor: SyncCursor): Promise<void> {
  await mkdir(dirname(cursorPath), { recursive: true });
  await writeFile(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`, "utf8");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
