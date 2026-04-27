import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import pino from "pino";

import type { DownstreamProcessTxRequest, DownstreamService } from "../../domain/deposit-delivery/types";
import { fetchDownstreamCursor, sendProcessTxRequest } from "./client";

let service: DownstreamService;
let observedPaths: string[] = [];
let publicKeyPem: string;
const logger = pino({ level: "silent" });
const originalFetch = globalThis.fetch;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  publicKeyPem = publicKey.export({
    format: "pem",
    type: "spki",
  }).toString();
  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  }).toString();

  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    observedPaths.push(path);

    const signature = new Headers(init?.headers).get("x-deposit-signature");
    const body = init?.body?.toString() ?? "";

    if (!signature) {
      return new Response("missing signature", { status: 401 });
    }

    const signatureIsValid = crypto.verify(
      null,
      Buffer.from(body),
      publicKeyPem,
      Buffer.from(signature, "base64"),
    );

    if (!signatureIsValid) {
      return new Response("invalid signature", { status: 401 });
    }

    if (path === "/private-api/deposit/cursor") {
      return Response.json({
        blockchain: "ton",
        hash: "tx-hash-1",
      });
    }

    if (path === "/private-api/deposit/process-tx") {
      return Response.json(
        {
          ok: true,
        },
        { status: 201 },
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;

  service = {
    baseUrl: "http://downstream.test",
    cursorPath: "/private-api/deposit/cursor",
    privateKeyPem,
    processTxPath: "/private-api/deposit/process-tx",
    signatureHeader: "x-deposit-signature",
    slug: "service-a",
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  observedPaths = [];
});

describe("downstream HTTP client", () => {
  test("fetches signed cursor response", async () => {
    const response = await fetchDownstreamCursor({
      logger,
      service,
      network: 'ton'
    });

    expect(response).toEqual({
      network: "ton",
      hash: "tx-hash-1",
    });
    expect(observedPaths).toEqual(["/private-api/deposit/cursor"]);
  });

  test("sends signed process-tx request", async () => {
    const request: DownstreamProcessTxRequest = {
      network: "ton",
      txUpdate: {
        amount: "1",
        asset: "rsp-coin",
        network: "ton",
        creditedTokens: "1",
        from: "0:from",
        hash: "hash-1",
        initiatedAt: 1_751_910_826,
        status: "success",
        to: "0:to",
        userId: "user-1",
      },
    };

    const response = await sendProcessTxRequest({
      logger,
      request,
      service,
    });

    expect(response).toEqual({
      httpStatus: 201,
    });
    expect(observedPaths).toEqual(["/private-api/deposit/process-tx"]);
  });
});
