import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";

import { type Network, type SyncCursor, syncCursorSchema } from "./types";

type LoadCursorArgs = {
  cursorPath: string;
  logger: Logger;
  network: Network;
  walletRawAddress: string;
};

type SaveCursorArgs = {
  cursor: SyncCursor;
  cursorPath: string;
  logger: Logger;
};

export async function loadCursor(args: LoadCursorArgs): Promise<SyncCursor | null> {
  const log = args.logger.child({
    scope: "cursor_store",
    cursorPath: args.cursorPath,
  });

  let raw: string;

  try {
    raw = await readFile(args.cursorPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      log.info("Cursor file does not exist yet, full wallet history will be scanned");
      return null;
    }

    throw error;
  }

  const parsed = syncCursorSchema.parse(JSON.parse(raw));

  if (parsed.walletRawAddress !== args.walletRawAddress) {
    throw new Error(
      [
        `Cursor at "${args.cursorPath}" belongs to ${parsed.walletRawAddress},`,
        `but the current wallet is ${args.walletRawAddress}.`,
      ].join(" "),
    );
  }

  if (parsed.network !== args.network) {
    throw new Error(
      `Cursor at "${args.cursorPath}" belongs to ${parsed.network}, but the current network is ${args.network}.`,
    );
  }

  log.info(
    {
      lastProcessedBlockSeqno: parsed.lastProcessedBlock.seqno,
      lastProcessedTx: parsed.lastProcessedTx,
      updatedAt: parsed.updatedAt,
    },
    "Loaded existing cursor",
  );

  return parsed;
}

export async function saveCursor(args: SaveCursorArgs): Promise<void> {
  const log = args.logger.child({
    scope: "cursor_store",
    cursorPath: args.cursorPath,
  });

  await mkdir(dirname(args.cursorPath), { recursive: true });
  await writeFile(args.cursorPath, `${JSON.stringify(args.cursor, null, 2)}\n`, "utf8");

  log.info(
    {
      lastProcessedBlockSeqno: args.cursor.lastProcessedBlock.seqno,
      lastProcessedTx: args.cursor.lastProcessedTx,
      updatedAt: args.cursor.updatedAt,
    },
    "Saved cursor",
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
