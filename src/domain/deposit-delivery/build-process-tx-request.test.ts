import { describe, expect, test } from "bun:test";

import { buildProcessTxRequest, resolveDownstreamTxStatus } from "./build-process-tx-request";

describe("buildProcessTxRequest", () => {
  test("maps deliverable transfer into downstream payload", () => {
    const request = buildProcessTxRequest({
      currentBlockSeqno: 111,
      network: 'ton',
      transfer: {
        asset: 'rsp-coin',
        amountTon: "1.25",
        fromRawAddress: "0:from",
        id: 1,
        isCanceled: false,
        memo: "user-1",
        memoType: "text_comment",
        now: 1_751_910_826,
        toRawAddress: "0:to",
        txBlockSeqno: 100,
        txHashHex: "hash-1",
        txLt: "123",
        userId: "user-1",
      }
  });

    expect(request).toEqual({
      network: "ton",
      txUpdate: {
        amount: "1.25",
        asset: 'rsp-coin',
        network: "ton",
        creditedTokens: "1.25",
        from: "0:from",
        hash: "hash-1",
        initiatedAt: 1_751_910_826,
        status: "success",
        to: "0:to",
        userId: "user-1",
      },
    });
  });

  test("resolves pending status before 10 confirmations", () => {
    expect(resolveDownstreamTxStatus({
      currentBlockSeqno: 109,
      isCanceled: false,
      txBlockSeqno: 100,
    })).toBe("pending");
  });

  test("keeps pending status at 10 confirmations", () => {
    expect(resolveDownstreamTxStatus({
      currentBlockSeqno: 110,
      isCanceled: false,
      txBlockSeqno: 100,
    })).toBe("pending");
  });

  test("resolves success status after more than 10 confirmations", () => {
    expect(resolveDownstreamTxStatus({
      currentBlockSeqno: 111,
      isCanceled: false,
      txBlockSeqno: 100,
    })).toBe("success");
  });

  test("resolves error status for canceled transactions", () => {
    expect(resolveDownstreamTxStatus({
      currentBlockSeqno: 105,
      isCanceled: true,
      txBlockSeqno: 100,
    })).toBe("error");
  });
});
