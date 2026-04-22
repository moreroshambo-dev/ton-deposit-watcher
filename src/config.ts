import { Address } from "@ton/core";
import { resolve } from "node:path";
import { z } from "zod";

import { type Network, networkSchema } from "./cursor-store";

const envSchema = z.object({
  TON_WALLET_ADDRESS: z.string().min(1, "TON_WALLET_ADDRESS is required"),
  TON_NETWORK: networkSchema.default("mainnet"),
  TON_GLOBAL_CONFIG_URL: z.string().url().optional(),
  TON_CURSOR_PATH: z.string().min(1).optional(),
  TON_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
});

export type AppConfig = {
  batchSize: number;
  cursorPath: string;
  globalConfigUrl: string;
  network: Network;
  wallet: Address;
  walletFriendlyAddress: string;
  walletRawAddress: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const wallet = Address.parse(parsed.TON_WALLET_ADDRESS);
  const network = parsed.TON_NETWORK;

  return {
    batchSize: parsed.TON_BATCH_SIZE,
    cursorPath: resolve(
      parsed.TON_CURSOR_PATH ?? `./data/ton-deposit-cursor-${cursorFileSuffix(wallet)}.json`,
    ),
    globalConfigUrl: parsed.TON_GLOBAL_CONFIG_URL ?? defaultGlobalConfigUrl(network),
    network,
    wallet,
    walletFriendlyAddress: wallet.toString({
      bounceable: true,
      testOnly: network === "testnet",
      urlSafe: true,
    }),
    walletRawAddress: wallet.toRawString(),
  };
}

function defaultGlobalConfigUrl(network: Network): string {
  return network === "testnet"
    ? "https://ton.org/testnet-global.config.json"
    : "https://ton.org/global.config.json";
}

function cursorFileSuffix(wallet: Address): string {
  return wallet.toRawString().replace(":", "_");
}
