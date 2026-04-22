import type { Logger } from "pino";
import { z } from "zod";

const liteServerSchema = z
  .object({
    ip: z.number().int(),
    port: z.number().int().positive(),
    id: z.object({
      "@type": z.literal("pub.ed25519"),
      key: z.string().min(1),
    }),
  })
  .passthrough();

const globalConfigSchema = z
  .object({
    liteservers: z.array(liteServerSchema).optional().default([]),
    liteservers_v2: z.array(liteServerSchema).optional().default([]),
  })
  .transform((value) => [...value.liteservers, ...value.liteservers_v2]);

export type LiteServer = z.infer<typeof liteServerSchema>;

export async function loadLiteServers(
  globalConfigUrl: string,
  logger: Logger,
): Promise<LiteServer[]> {
  const log = logger.child({
    scope: "ton_global_config",
    globalConfigUrl,
  });

  log.info("Fetching TON global config");

  const response = await fetch(globalConfigUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch TON global config from ${globalConfigUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const rawConfig = await response.json();
  const liteServers = globalConfigSchema.parse(rawConfig);

  if (liteServers.length === 0) {
    throw new Error(`TON global config at ${globalConfigUrl} does not contain any liteservers.`);
  }

  log.info(
    {
      liteServerCount: liteServers.length,
      sampleEndpoints: liteServers.slice(0, 3).map((server) => ({
        host: intToIP(server.ip),
        port: server.port,
      })),
    },
    "Loaded TON lite servers from global config",
  );

  return liteServers;
}

export function intToIP(value: number): string {
  const part1 = value & 255;
  const part2 = (value >> 8) & 255;
  const part3 = (value >> 16) & 255;
  const part4 = (value >> 24) & 255;

  return `${part4}.${part3}.${part2}.${part1}`;
}
