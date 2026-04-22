import { loadConfig } from "./config";
import { loadCursor, saveCursor } from "./cursor-store";
import { createLiteClientFromConfigUrl, syncIncomingTransfers } from "./ton-deposit-indexer";

async function main(): Promise<void> {
  const config = loadConfig();
  const cursor = await loadCursor(
    config.cursorPath,
    config.walletRawAddress,
    config.network,
  );
  const { client, engine } = await createLiteClientFromConfigUrl(config.globalConfigUrl);

  try {
    const result = await syncIncomingTransfers({
      batchSize: config.batchSize,
      client,
      cursor,
      network: config.network,
      wallet: config.wallet,
    });

    await saveCursor(config.cursorPath, result.cursorAfter);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    engine.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
