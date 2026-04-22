import { type Cell } from "@ton/core";

import type { MessageMemo } from "./types";

export function parseMessageMemo(body: Cell): MessageMemo {
  const slice = body.beginParse();

  if (slice.remainingBits === 0 && slice.remainingRefs === 0) {
    return {
      memo: null,
      memoOpcode: null,
      memoType: "empty",
    };
  }

  if (slice.remainingBits < 32) {
    return {
      memo: null,
      memoOpcode: null,
      memoType: "binary",
    };
  }

  const opcode = slice.loadUint(32);

  if (opcode !== 0) {
    return {
      memo: null,
      memoOpcode: opcode,
      memoType: "binary",
    };
  }

  try {
    return {
      memo: slice.loadStringTail(),
      memoOpcode: 0,
      memoType: "text_comment",
    };
  } catch {
    return {
      memo: null,
      memoOpcode: 0,
      memoType: "binary",
    };
  }
}
