import crypto, { type KeyLike, type SignJsonWebKeyInput, type SignKeyObjectInput, type SignPrivateKeyInput } from "node:crypto";

import type { Logger } from "pino";
import { z } from "zod";

import { DOWNSTREAM_BLOCKCHAIN, type DownstreamCursorRequest, type DownstreamCursorResponse, type DownstreamProcessTxRequest, type DownstreamService } from "../../domain/deposit-delivery/types";

const REQUEST_TIMEOUT_MS = 5_000;
const NETWORK_RETRY_LIMIT = 2;

const downstreamCursorResponseSchema = z.object({
  blockchain: z.literal(DOWNSTREAM_BLOCKCHAIN),
  hash: z.string().min(1).nullable(),
});

type RequestJson = DownstreamCursorRequest | DownstreamProcessTxRequest;

export class DownstreamHttpError extends Error {
  public readonly httpStatus: number | null;
  public readonly isRetryable: boolean;

  constructor(args: {
    cause?: unknown;
    httpStatus: number | null;
    isRetryable: boolean;
    message: string;
  }) {
    super(args.message);
    this.name = "DownstreamHttpError";
    this.httpStatus = args.httpStatus;
    this.isRetryable = args.isRetryable;

    if (args.cause !== undefined) {
      this.cause = args.cause;
    }
  }
}

export async function fetchDownstreamCursor(args: {
  logger: Logger;
  service: DownstreamService;
}): Promise<DownstreamCursorResponse> {
  const responseJson = await sendSignedJsonRequest({
    json: {
      blockchain: DOWNSTREAM_BLOCKCHAIN,
    },
    logger: args.logger,
    path: args.service.cursorPath,
    service: args.service,
  });

  return downstreamCursorResponseSchema.parse(responseJson);
}

export async function sendProcessTxRequest(args: {
  logger: Logger;
  request: DownstreamProcessTxRequest;
  service: DownstreamService;
}): Promise<{
  httpStatus: number;
}> {
  const response = await sendSignedJsonRequest({
    expectJsonResponse: false,
    json: args.request,
    logger: args.logger,
    path: args.service.processTxPath,
    service: args.service,
  });

  return {
    httpStatus: response.httpStatus,
  };
}

async function sendSignedJsonRequest(args: {
  expectJsonResponse?: false;
  json: RequestJson;
  logger: Logger;
  path: string;
  service: DownstreamService;
}): Promise<{
  httpStatus: number;
}>;
async function sendSignedJsonRequest(args: {
  expectJsonResponse?: true;
  json: RequestJson;
  logger: Logger;
  path: string;
  service: DownstreamService;
}): Promise<unknown>;
async function sendSignedJsonRequest(args: {
  expectJsonResponse?: boolean;
  json: RequestJson;
  logger: Logger;
  path: string;
  service: DownstreamService;
}): Promise<{
  httpStatus: number;
} | unknown> {
  const requestLogger = args.logger.child({
    scope: "downstream_http_client",
    serviceSlug: args.service.slug,
  });
  const payload = args.json;
  const signature = signMessage(args.service.privateKeyPem, payload);
  const url = buildRequestUrl(args.service.baseUrl, args.path);
  const expectJsonResponse = args.expectJsonResponse ?? true;

  for (let attempt = 1; attempt <= NETWORK_RETRY_LIMIT + 1; attempt += 1) {
    try {
      requestLogger.debug(
        {
          attempt,
          path: args.path,
          url,
        },
        "Sending signed downstream HTTP request",
      );

      const response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          [args.service.signatureHeader]: signature,
        },
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new DownstreamHttpError({
          httpStatus: response.status,
          isRetryable: response.status >= 500,
          message: `Downstream service responded with ${response.status}: ${responseText}`,
        });
      }

      if (!expectJsonResponse) {
        return {
          httpStatus: response.status,
        };
      }

      return await response.json();
    } catch (error) {
      const normalized = normalizeRequestError(error);

      if (normalized instanceof DownstreamHttpError && !normalized.isRetryable) {
        throw normalized;
      }

      const hasRetriesLeft = attempt <= NETWORK_RETRY_LIMIT;

      requestLogger.warn(
        {
          attempt,
          err: normalized,
          hasRetriesLeft,
          path: args.path,
          url,
        },
        "Downstream HTTP request failed",
      );

      if (!hasRetriesLeft) {
        throw normalized;
      }
    }
  }

  throw new DownstreamHttpError({
    httpStatus: null,
    isRetryable: true,
    message: "Downstream HTTP request exhausted retry attempts",
  });
}

function signMessage(
  privateKeyPem: KeyLike | SignKeyObjectInput | SignPrivateKeyInput | SignJsonWebKeyInput,
  payload: RequestJson,
): string {
  const normalizedPrivateKey =
    typeof privateKeyPem === "string"
      ? privateKeyPem.replace(/\\n/g, "\n")
      : privateKeyPem;

  const signature = crypto.sign(
    null,
    Buffer.from(JSON.stringify(payload)),
    normalizedPrivateKey,
  );

  return signature.toString("base64");
}

function buildRequestUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  return new URL(normalizedPath, normalizedBaseUrl).toString();
}

function normalizeRequestError(error: unknown): DownstreamHttpError {
  if (error instanceof DownstreamHttpError) {
    return error;
  }

  return new DownstreamHttpError({
    cause: error,
    httpStatus: null,
    isRetryable: true,
    message: error instanceof Error ? error.message : "Unknown downstream HTTP error",
  });
}
