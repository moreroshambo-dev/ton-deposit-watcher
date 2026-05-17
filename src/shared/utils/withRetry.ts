import { Logger } from "pino";
import { sleep } from "./sleep.js";

function isRetryableError(err: unknown): boolean {
  // Be conservative: transient network/DB errors should be retried; config/validation should not.
  // Since we don't have rich typed errors here, default to retrying.
  return err instanceof Error;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    logger: Logger;
    op: string;
    signal?: AbortSignal;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5_000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) {
        throw new Error("operation aborted");
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === maxAttempts) break;

      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(250, exp));
      const delay = exp + jitter;

      options.logger.warn(
        { op: options.op, attempt, maxAttempts, delayMs: delay, err },
        "operation failed; retrying"
      );

      await sleep(delay, options.signal).catch(() => {
        throw new Error("operation aborted");
      });
    }
  }

  options.logger.error({ op: options.op, err: lastErr }, "operation failed; giving up");
  throw lastErr instanceof Error ? lastErr : new Error(`operation failed: ${String(lastErr)}`);
}
