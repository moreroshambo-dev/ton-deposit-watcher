import { z } from "zod";
import { Address } from "@ton/core";
import { type Network, networkSchema } from "../domain/cursor/types";

const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Required",
});

const downstreamServiceSchema = z.object({
  baseUrl: z.string().url(),
  privateKeyPem: nonBlankStringSchema,
  processTxPath: z.string().min(1).startsWith("/"),
  signatureHeader: nonBlankStringSchema,
  slug: nonBlankStringSchema,
}).passthrough();

export type DownstreamServiceSchema = z.output<typeof downstreamServiceSchema>

const downstreamServiceJsonSchema = z
  .string()
  .transform((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DOWNSTREAM_SERVICES_JSON must be a non-blank JSON object",
      });

      return z.NEVER;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DOWNSTREAM_SERVICES_JSON must be valid JSON",
      });

      return z.NEVER;
    }
  })
  .pipe(downstreamServiceSchema);

const envSchema = z.object({
  TON_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  DATABASE_URL: z.string().min(1),
  DOWNSTREAM_SERVICES_JSON: downstreamServiceJsonSchema,
  TON_GLOBAL_CONFIG_URL: z.string().url().optional(),
  TON_NETWORK: networkSchema.default("ton"),
  TON_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  TON_WALLET_ADDRESS: z.string().min(1, "TON_WALLET_ADDRESS is required"),
});

export type DatabaseConnectionInfo = {
  databaseHost: string;
  databaseName: string;
  databasePort: number | null;
  databaseSslEnabled: boolean;
  databaseUser: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const network = parsed.TON_NETWORK;
  const databaseUrl = parsed.DATABASE_URL!;

  return {
    address: Address.parse(parsed.TON_WALLET_ADDRESS),
    batchSize: parsed.TON_BATCH_SIZE,
    databaseConnectionInfo: describeDatabaseConnection(databaseUrl),
    databaseUrl,
    downstreamService: parsed.DOWNSTREAM_SERVICES_JSON,
    globalConfigUrl: parsed.TON_GLOBAL_CONFIG_URL ?? defaultGlobalConfigUrl(network),
    network,
    pollIntervalMs: parsed.TON_POLL_INTERVAL_MS,
  };
}

export type Config = ReturnType<typeof loadConfig>

function defaultGlobalConfigUrl(network: Network): string {
  return network === "ton-testnet"
    ? "https://ton.org/testnet-global.config.json"
    : "https://ton.org/global.config.json";
}

function describeDatabaseConnection(databaseUrl: string): DatabaseConnectionInfo {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  return {
    databaseHost: url.hostname,
    databaseName: url.pathname.replace(/^\//, ""),
    databasePort: url.port ? Number(url.port) : null,
    databaseSslEnabled:
      sslMode === "require" ||
      sslMode === "verify-ca" ||
      sslMode === "verify-full" ||
      url.searchParams.get("ssl") === "true",
    databaseUser: decodeURIComponent(url.username),
  };
}
