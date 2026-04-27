import { describe, expect, test } from "bun:test";

import { buildProcessTxRequest } from "./build-process-tx-request";

describe("buildProcessTxRequest", () => {
  test("maps deliverable transfer into downstream payload", () => {
    const request = buildProcessTxRequest({
      amountTon: "1.25",
      fromRawAddress: "0:from",
      id: 1,
      memo: "user-1",
      memoType: "text_comment",
      now: 1_751_910_826,
      toRawAddress: "0:to",
      txHashHex: "hash-1",
      txLt: "123",
      userId: "user-1",
    });

    expect(request).toEqual({
      blockchain: "ton",
      txUpdate: {
        amount: "1.25",
        asset: "ton",
        blockchain: "ton",
        creditedTokens: "1.25",
        from: "0:from",
        hash: "hash-1",
        initiatedAt: 1_751_910_826,
        status: "SUCCESS",
        to: "0:to",
        userId: "user-1",
      },
    });
  });
});
