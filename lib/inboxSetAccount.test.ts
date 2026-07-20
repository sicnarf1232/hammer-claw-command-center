import { describe, it, expect } from "vitest";
import { parseThreadKey, validateSetAccountRequest, SetAccountError } from "./inboxSetAccount";

const ACCOUNT_IDS = [12, 47];

describe("parseThreadKey", () => {
  it("parses a conversation key", () => {
    expect(parseThreadKey("t:AAMk-conv-id")).toEqual({ kind: "t", value: "AAMk-conv-id" });
  });

  it("parses a standalone message key", () => {
    expect(parseThreadKey("m:501")).toEqual({ kind: "m", value: "501" });
  });

  it("rejects a message key with a non-numeric value", () => {
    expect(parseThreadKey("m:not-a-number")).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseThreadKey("x:501")).toBeNull();
  });

  it("rejects a key with no value", () => {
    expect(parseThreadKey("t:")).toBeNull();
  });

  it("rejects a key with no colon", () => {
    expect(parseThreadKey("t")).toBeNull();
  });

  // Conversation ids can themselves contain colons; only the first colon
  // separates the kind prefix.
  it("keeps colons inside the conversation id value", () => {
    expect(parseThreadKey("t:AAMk:with:colons")).toEqual({
      kind: "t",
      value: "AAMk:with:colons",
    });
  });
});

describe("validateSetAccountRequest", () => {
  it("accepts a known account id on a conversation key", () => {
    const result = validateSetAccountRequest({ key: "t:conv-1", accountId: 47 }, ACCOUNT_IDS);
    expect(result).toEqual({
      key: "t:conv-1",
      parsed: { kind: "t", value: "conv-1" },
      accountId: 47,
    });
  });

  it("accepts a known account id on a standalone message key", () => {
    const result = validateSetAccountRequest({ key: "m:501", accountId: 12 }, ACCOUNT_IDS);
    expect(result.accountId).toBe(12);
    expect(result.parsed).toEqual({ kind: "m", value: "501" });
  });

  it("treats a null accountId as an explicit unlink", () => {
    const result = validateSetAccountRequest({ key: "t:conv-1", accountId: null }, ACCOUNT_IDS);
    expect(result.accountId).toBeNull();
  });

  it("rejects a missing key", () => {
    expect(() => validateSetAccountRequest({ key: "", accountId: 12 }, ACCOUNT_IDS)).toThrow(
      SetAccountError,
    );
  });

  it("rejects a malformed key", () => {
    expect(() =>
      validateSetAccountRequest({ key: "bogus", accountId: 12 }, ACCOUNT_IDS),
    ).toThrow(SetAccountError);
  });

  it("rejects an account id that is not in the known list", () => {
    expect(() =>
      validateSetAccountRequest({ key: "t:conv-1", accountId: 999 }, ACCOUNT_IDS),
    ).toThrow(SetAccountError);
  });

  it("rejects a non-integer accountId", () => {
    expect(() =>
      validateSetAccountRequest({ key: "t:conv-1", accountId: 12.5 }, ACCOUNT_IDS),
    ).toThrow(SetAccountError);
  });

  it("rejects a string accountId", () => {
    expect(() =>
      validateSetAccountRequest({ key: "t:conv-1", accountId: "12" }, ACCOUNT_IDS),
    ).toThrow(SetAccountError);
  });

  it("rejects an undefined accountId (must be explicit)", () => {
    expect(() =>
      validateSetAccountRequest({ key: "t:conv-1", accountId: undefined }, ACCOUNT_IDS),
    ).toThrow(SetAccountError);
  });
});
