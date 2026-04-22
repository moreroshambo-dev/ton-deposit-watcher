import type { Logger } from "pino";
import {
  LiteClient,
  LiteRoundRobinEngine,
  LiteSingleEngine,
  type LiteEngine,
} from "ton-lite-client";

import { intToIP, loadLiteServers } from "./global-config";

export async function createLiteClientFromConfigUrl(args: {
  globalConfigUrl: string;
  logger: Logger;
}): Promise<{
  client: LiteClient;
  engine: LiteEngine;
  serverCount: number;
}> {
  const log = args.logger.child({ scope: "ton_lite_client" });
  const liteServers = await loadLiteServers(args.globalConfigUrl, args.logger);
  const engines = liteServers.map((server) => {
    const host = `tcp://${intToIP(server.ip)}:${server.port}`;
    const serverLog = log.child({ host });
    const engine = new LiteSingleEngine({
      host,
      publicKey: Buffer.from(server.id.key, "base64"),
    });

    engine.on("connect", () => {
      serverLog.debug("Connected to TON lite server");
    });

    engine.on("ready", () => {
      serverLog.debug("TON lite server connection is ready");
    });

    engine.on("close", () => {
      serverLog.debug("TON lite server connection closed");
    });

    engine.on("error", (error, close) => {
      serverLog.debug({ close, err: error }, "TON lite server connection error");
    });

    return engine;
  });

  const engine = new LiteRoundRobinEngine(engines);
  const client = new LiteClient({ engine });

  log.info({ liteServerCount: liteServers.length }, "Created TON lite client");

  return {
    client,
    engine,
    serverCount: liteServers.length,
  };
}
