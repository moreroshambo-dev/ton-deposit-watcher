import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { loadConfig } from "./config";

const baseEnv = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ton_deposits",
  TON_NETWORK: "ton",
  TON_WALLET_ADDRESS: "UQDI1erifGghML1AH1ZhlVD8wV-j-sOk0w8yltj5lRwkS0Pv",
};

function loadTestConfig(env: Record<string, string | undefined> = {}) {
  return loadConfig({
    ...baseEnv,
    ...env,
  });
}

describe("loadConfig downstream services", () => {
  test("uses an empty downstream service list when env is absent", () => {
    expect(loadTestConfig().downstreamServices).toEqual([]);
  });

  test("uses an empty downstream service list when env is blank", () => {
    expect(loadTestConfig({ DOWNSTREAM_SERVICES_JSON: "   " }).downstreamServices).toEqual([]);
  });

  test("uses an empty downstream service list when env is an empty array", () => {
    expect(loadTestConfig({ DOWNSTREAM_SERVICES_JSON: "[]" }).downstreamServices).toEqual([]);
  });

  test("parses one or more downstream services from JSON", () => {
    const downstreamServices = [
      {
        baseUrl: "https://billing.example.com",
        cursorPath: "/private-api/deposit/cursor",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----",
        processTxPath: "/private-api/deposit/process-tx",
        signatureHeader: "x-deposit-signature",
        slug: "billing",
      },
      {
        baseUrl: "https://ledger.example.com",
        cursorPath: "/cursor",
        privateKeyPem: "key",
        processTxPath: "/process-tx",
        signatureHeader: "x-ledger-signature",
        slug: "ledger",
      },
    ];

    expect(
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify(downstreamServices),
      }).downstreamServices,
    ).toEqual(downstreamServices);
  });

  test("rejects duplicate downstream service slugs", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify([
          {
            baseUrl: "https://billing.example.com",
            cursorPath: "/cursor",
            privateKeyPem: "key",
            processTxPath: "/process",
            signatureHeader: "x-signature",
            slug: "billing",
          },
          {
            baseUrl: "https://other.example.com",
            cursorPath: "/cursor",
            privateKeyPem: "key",
            processTxPath: "/process",
            signatureHeader: "x-signature",
            slug: "billing",
          },
        ]),
      }),
    ).toThrow(ZodError);
  });

  test("rejects invalid downstream service JSON", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: "{not-json",
      }),
    ).toThrow(ZodError);
  });

  test("rejects non-array downstream service JSON", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify({
          slug: "billing",
        }),
      }),
    ).toThrow(ZodError);
  });

  test("rejects missing required downstream service fields", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify([
          {
            baseUrl: "https://billing.example.com",
            cursorPath: "/cursor",
            privateKeyPem: "key",
            signatureHeader: "x-signature",
            slug: "billing",
          },
        ]),
      }),
    ).toThrow(ZodError);
  });

  test("rejects downstream service paths without leading slash", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify([
          {
            baseUrl: "https://billing.example.com",
            cursorPath: "cursor",
            privateKeyPem: "key",
            processTxPath: "/process",
            signatureHeader: "x-signature",
            slug: "billing",
          },
        ]),
      }),
    ).toThrow(ZodError);
  });
});
