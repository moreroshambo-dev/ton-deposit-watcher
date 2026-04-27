import { describe, expect, test } from "bun:test";

import { extractUserIdFromMemo } from "./user-id";

describe("extractUserIdFromMemo", () => {
  test("returns trimmed userId for text comments", () => {
    expect(
      extractUserIdFromMemo({
        memo: "  user-42  ",
        memoType: "text_comment",
      }),
    ).toBe("user-42");
  });

  test("returns null for empty text comments", () => {
    expect(
      extractUserIdFromMemo({
        memo: "   ",
        memoType: "text_comment",
      }),
    ).toBeNull();
  });

  test("returns null for binary memo", () => {
    expect(
      extractUserIdFromMemo({
        memo: null,
        memoType: "binary",
      }),
    ).toBeNull();
  });

  test("returns null for empty memo", () => {
    expect(
      extractUserIdFromMemo({
        memo: null,
        memoType: "empty",
      }),
    ).toBeNull();
  });
});
