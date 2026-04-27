import type { MessageMemo, ParsedIncomingTransfer } from "../deposit-sync/types";

type UserIdMemoInput = Pick<MessageMemo, "memo" | "memoType">;

export function extractUserIdFromMemo(input: UserIdMemoInput): string | null {
  if (input.memoType !== "text_comment" || typeof input.memo !== "string") {
    return null;
  }

  const trimmed = input.memo.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function extractUserIdFromIncomingTransfer(
  transfer: Pick<ParsedIncomingTransfer, "memo" | "memoType">,
): string | null {
  return extractUserIdFromMemo({
    memo: transfer.memo,
    memoType: transfer.memoType,
  });
}
