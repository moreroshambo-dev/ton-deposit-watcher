import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { loadConfig } from "./config";

const baseEnv = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ton_deposits",
  TON_NETWORK: "ton",
  TON_WALLET_ADDRESS: "UQDI1erifGghML1AH1ZhlVD8wV-j-sOk0w8yltj5lRwkS0Pv",
};

const downstreamService = {
  baseUrl: "https://billing.example.com",
  privateKeyPem: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----",
  processTxPath: "/private-api/deposit/process-tx",
  signatureHeader: "x-deposit-signature",
  slug: "billing",
};

function loadTestConfig(env: Record<string, string | undefined> = {}) {
  return loadConfig({
    ...baseEnv,
    ...env,
  });
}

describe("loadConfig downstream service", () => {
  test("parses a single downstream service object from DOWNSTREAM_SERVICES_JSON", () => {
    expect(
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify(downstreamService),
      }).downstreamService,
    ).toEqual(downstreamService);
  });

  test("allows legacy cursorPath as an extra field", () => {
    const downstreamServiceWithCursorPath = {
      ...downstreamService,
      cursorPath: "/private-api/deposit/cursor",
    };

    expect(
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify(downstreamServiceWithCursorPath),
      }).downstreamService,
    ).toEqual(downstreamServiceWithCursorPath);
  });

  test("rejects absent downstream service JSON", () => {
    expect(() => loadTestConfig()).toThrow(ZodError);
  });

  test("rejects blank downstream service JSON", () => {
    expect(() =>
      loadTestConfig({ DOWNSTREAM_SERVICES_JSON: "   " }),
    ).toThrow(ZodError);
  });

  test("rejects array downstream service JSON", () => {
    expect(() =>
      loadTestConfig({ DOWNSTREAM_SERVICES_JSON: "[]" }),
    ).toThrow(ZodError);
  });

  test("rejects invalid downstream service JSON", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: "{not-json",
      }),
    ).toThrow(ZodError);
  });

  test("rejects missing required downstream service fields", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify({
          baseUrl: "https://billing.example.com",
          privateKeyPem: "key",
          signatureHeader: "x-signature",
          slug: "billing",
        }),
      }),
    ).toThrow(ZodError);
  });

  test("rejects invalid downstream service URL", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify({
          ...downstreamService,
          baseUrl: "not-a-url",
        }),
      }),
    ).toThrow(ZodError);
  });

  test("rejects downstream process path without leading slash", () => {
    expect(() =>
      loadTestConfig({
        DOWNSTREAM_SERVICES_JSON: JSON.stringify({
          ...downstreamService,
          processTxPath: "process",
        }),
      }),
    ).toThrow(ZodError);
  });
});
