export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
        return reject(new Error("aborted"));
    }

    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
