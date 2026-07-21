import { describe, it, expect } from "vitest";
import { isPlausibleEmail, validateSetName, looksLikeMailboxAlias } from "./peopleName";

describe("isPlausibleEmail", () => {
  it("accepts a normal address", () => {
    expect(isPlausibleEmail("mvanega3@shockwavemedical.com")).toBe(true);
  });

  it("rejects addresses with no domain dot, no @, or whitespace", () => {
    expect(isPlausibleEmail("mvanega3@shockwave")).toBe(false);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("a b@example.com")).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
  });
});

describe("validateSetName", () => {
  it("trims and lowercases the email, trims the name", () => {
    const res = validateSetName({ email: "  Mvanega3@Shockwave.com  ", fullName: "  Maria Vanega  " });
    expect(res).toEqual({ ok: true, value: { email: "mvanega3@shockwave.com", fullName: "Maria Vanega" } });
  });

  it("rejects a missing or garbage email", () => {
    expect(validateSetName({ email: "", fullName: "Maria Vanega" }).ok).toBe(false);
    expect(validateSetName({ email: "nope", fullName: "Maria Vanega" }).ok).toBe(false);
    expect(validateSetName({ email: 42, fullName: "Maria Vanega" }).ok).toBe(false);
  });

  it("rejects an empty or non-string name", () => {
    expect(validateSetName({ email: "a@b.com", fullName: "" }).ok).toBe(false);
    expect(validateSetName({ email: "a@b.com", fullName: "   " }).ok).toBe(false);
    expect(validateSetName({ email: "a@b.com", fullName: null }).ok).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    const long = "a".repeat(201);
    expect(validateSetName({ email: "a@b.com", fullName: long }).ok).toBe(false);
  });
});

describe("looksLikeMailboxAlias", () => {
  it("flags a single digit-bearing token (the reported Mvanega3 case)", () => {
    expect(looksLikeMailboxAlias("Mvanega3")).toBe(true);
    expect(looksLikeMailboxAlias("user482")).toBe(true);
  });

  it("does not flag a real First Last name", () => {
    expect(looksLikeMailboxAlias("Maria Vanega")).toBe(false);
  });

  it("does not flag a genuine single-word or foreign name with no digits", () => {
    expect(looksLikeMailboxAlias("Cher")).toBe(false);
    expect(looksLikeMailboxAlias("Björk")).toBe(false);
  });

  it("does not flag an empty name", () => {
    expect(looksLikeMailboxAlias("")).toBe(false);
    expect(looksLikeMailboxAlias("   ")).toBe(false);
  });
});
