import { describe, expect, test } from "bun:test";

import { computeNextRetryAt } from "./retry-policy";

describe("computeNextRetryAt", () => {
  test("uses exponential backoff from 5 seconds", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(computeNextRetryAt({ attemptCount: 1, now })).toBe("2026-01-01T00:00:05.000Z");
    expect(computeNextRetryAt({ attemptCount: 2, now })).toBe("2026-01-01T00:00:10.000Z");
    expect(computeNextRetryAt({ attemptCount: 3, now })).toBe("2026-01-01T00:00:20.000Z");
  });

  test("caps retry delay at 5 minutes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(computeNextRetryAt({ attemptCount: 20, now })).toBe("2026-01-01T00:05:00.000Z");
  });
});
