import {
  LiteClient,
  LiteRoundRobinEngine,
  LiteSingleEngine,
  type LiteEngine,
} from "ton-lite-client";

import { intToIP, loadLiteServers } from "./global-config";
import { GenericOptions } from "~/domain/fn/types";

export async function createTonLiteClient(options: GenericOptions): Promise<{
  client: LiteClient;
  engine: LiteEngine;
  serverCount: number;
}> {
  const log = options.logger.child({ fn: "createTonLiteClient" });
  const liteServers = await loadLiteServers(
    {globalConfigUrl: options.config.globalConfigUrl},
    {logger: options.logger, signal: options.signal},
  );
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
  const client = new LiteClient({engine});

  options.signal?.addEventListener('abort', () => {
    engine.close()
  })

  log.info({ liteServerCount: liteServers.length }, "Created TON lite client");

  return {
    client,
    engine,
    serverCount: liteServers.length,
  };
}
