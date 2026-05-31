import { WithImplicitCoercion } from "node:buffer";
import crypto from "node:crypto";
import { GenericOptions } from "~/domain/fn/types";

export function signMessage(
  payload: string,
  options: GenericOptions,
): string {
  const normalizedPrivateKey =
    typeof options.config.downstreamServices.privateKeyPem === "string"
      ? options.config.downstreamServices.privateKeyPem.replace(/\\n/g, "\n")
      : options.config.downstreamServices.privateKeyPem;

  const signature = crypto.sign(
    null,
    Buffer.from(payload),
    normalizedPrivateKey,
  );

  return signature.toString("base64");
}

type HttpRequestPayload = unknown

const REQUEST_TIMEOUT_MS = 10000

export class DownstreamHttpError extends Error {
  public readonly httpStatus: number | null;
  public readonly isRetryable: boolean;
  public readonly responseData?: unknown;
  public readonly responseText?: string

  constructor(args: {
    cause?: unknown;
    httpStatus: number | null;
    isRetryable: boolean;
    message: string;
    responseText?: string
  }) {
    super(args.message);
    this.name = "DownstreamHttpError";
    this.httpStatus = args.httpStatus;
    this.isRetryable = args.isRetryable;

    if (args.cause !== undefined) {
      this.cause = args.cause;
    }

    if (typeof args.responseText === 'string') {
      this.responseText = args.responseText

      try {
        const responseData = JSON.parse(args.responseText)

        console.log(responseData)

        this.responseData = responseData
      } catch {}
    }
  }
}

export const downstreamHttpRequest = async (payload: HttpRequestPayload, options: GenericOptions) => {
  const log = options.logger.child({fn: 'httpRequest'})
  const body = JSON.stringify(payload, (key, value) => typeof value === 'bigint' ? value.toString() : value)
  const signature = signMessage(body, {...options, logger: log});
  const url = options.config.downstreamServices.baseUrl + options.config.downstreamServices.processTxPath;

  const response = await fetch(url, {
    body,
    headers: {
      "content-type": "application/json",
      [options.config.downstreamServices.signatureHeader]: signature,
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new DownstreamHttpError({
      responseText,
      httpStatus: response.status,
      isRetryable: response.status >= 500,
      message: `Downstream service responded with ${response.status}: ${responseText}`,
    });
  }

  log.info('Нужна имплементация')
}