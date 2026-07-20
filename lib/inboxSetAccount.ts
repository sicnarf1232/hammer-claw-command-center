// Pure logic for the manual thread->account link/unlink (dev-feedback #13):
// an all-internal thread has no unmapped external sender to trigger the
// existing senderSuggestion flow, but is still substantively about a
// customer, so Jordan needs a direct override. Kept framework-free so the API
// route and any client-side check can share one source of truth, tested
// without a DB. Mirrors lib/taskUpdate.ts's validateTaskUpdate shape.

export class SetAccountError extends Error {}

export interface ParsedThreadKey {
  kind: "t" | "m";
  value: string; // conversationId (t) or numeric email id as a string (m)
}

// Same key format used everywhere else in this app (lib/firehose/read.ts's
// threadKey): "t:<threadId>" for a conversation, "m:<emailId>" for a
// standalone message.
export function parseThreadKey(key: string): ParsedThreadKey | null {
  if (typeof key !== "string") return null;
  const idx = key.indexOf(":");
  if (idx < 1) return null;
  const kind = key.slice(0, idx);
  const value = key.slice(idx + 1);
  if (!value) return null;
  if (kind === "t") return { kind: "t", value };
  if (kind === "m" && /^\d+$/.test(value)) return { kind: "m", value };
  return null;
}

export interface ValidatedSetAccount {
  key: string;
  parsed: ParsedThreadKey;
  // null = explicit unlink (clear accountId and accountManual on the thread).
  accountId: number | null;
}

// Validate a set-account request body. knownAccountIds is the list of real
// account ids (the caller looks these up); accountId must be exactly one of
// them, or null for an unlink. Anything else (a string, a made-up id,
// missing) throws SetAccountError with a message safe to surface to Jordan.
export function validateSetAccountRequest(
  input: { key: unknown; accountId: unknown },
  knownAccountIds: number[],
): ValidatedSetAccount {
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!key) throw new SetAccountError("A thread key is required.");

  const parsed = parseThreadKey(key);
  if (!parsed) throw new SetAccountError(`Invalid thread key: ${key}`);

  if (input.accountId === null) {
    return { key, parsed, accountId: null };
  }
  if (typeof input.accountId !== "number" || !Number.isInteger(input.accountId)) {
    throw new SetAccountError(
      `accountId must be an integer id or null, got: ${String(input.accountId)}`,
    );
  }
  if (!knownAccountIds.includes(input.accountId)) {
    throw new SetAccountError(`Unknown account id: ${input.accountId}`);
  }
  return { key, parsed, accountId: input.accountId };
}
