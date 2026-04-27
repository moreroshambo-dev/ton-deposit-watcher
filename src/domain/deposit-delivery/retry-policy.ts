const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export function computeNextRetryAt(args: {
  attemptCount: number;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const exponent = Math.max(args.attemptCount - 1, 0);
  const delayMs = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** exponent, MAX_RETRY_DELAY_MS);

  return new Date(now.getTime() + delayMs).toISOString();
}
