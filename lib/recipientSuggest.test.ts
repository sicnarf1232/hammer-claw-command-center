import { describe, expect, it } from "vitest";
import {
  mergeRecipientSuggestions,
  matchesQuery,
  formatRecipientForInsert,
  insertRecipientToken,
  currentToken,
  completedTokens,
  parseRecipientList,
  type RecipientSuggestion,
} from "./recipientSuggest";

function s(email: string, name: string | null, source: "contact" | "history"): RecipientSuggestion {
  return { name, email, source };
}

describe("mergeRecipientSuggestions", () => {
  it("ranks contact matches before history suggestions", () => {
    const contacts = [s("zoya@acme.com", "Zoya Patel", "contact")];
    const history = [s("amir@acme.com", "Amir Khan", "history")];
    const merged = mergeRecipientSuggestions(contacts, history);
    expect(merged.map((m) => m.email)).toEqual(["zoya@acme.com", "amir@acme.com"]);
  });

  it("dedupes by lowercased email, keeping the contact-source entry", () => {
    const contacts = [s("Zoya@Acme.com", "Zoya Patel", "contact")];
    const history = [s("zoya@acme.com", "Zoya P.", "history")];
    const merged = mergeRecipientSuggestions(contacts, history);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("contact");
  });

  it("excludes addresses already entered, case-insensitively", () => {
    const contacts = [s("zoya@acme.com", "Zoya Patel", "contact")];
    const merged = mergeRecipientSuggestions(contacts, [], { exclude: ["ZOYA@acme.com"] });
    expect(merged).toHaveLength(0);
  });

  it("caps to the limit", () => {
    const history = Array.from({ length: 20 }, (_, i) => s(`p${i}@x.com`, null, "history"));
    const merged = mergeRecipientSuggestions([], history, { limit: 5 });
    expect(merged).toHaveLength(5);
  });
});

describe("matchesQuery", () => {
  it("matches on name or email, case-insensitively", () => {
    const c = { name: "Zoya Patel", email: "zoya@acme.com" };
    expect(matchesQuery(c, "zoya")).toBe(true);
    expect(matchesQuery(c, "PATEL")).toBe(true);
    expect(matchesQuery(c, "acme.com")).toBe(true);
    expect(matchesQuery(c, "nope")).toBe(false);
  });

  it("matches everything when the query is empty", () => {
    expect(matchesQuery({ name: null, email: "a@b.com" }, "")).toBe(true);
  });
});

describe("formatRecipientForInsert", () => {
  it("inserts the bare email address, not a display-name header", () => {
    expect(formatRecipientForInsert(s("zoya@acme.com", "Zoya Patel", "contact"))).toBe(
      "zoya@acme.com",
    );
  });
});

describe("currentToken / completedTokens", () => {
  it("splits the in-progress token from completed ones", () => {
    expect(currentToken("john@x.com, jan")).toBe("jan");
    expect(completedTokens("john@x.com, jan")).toEqual(["john@x.com"]);
  });

  it("treats a trailing comma as everything completed", () => {
    expect(currentToken("john@x.com, jane@y.com, ")).toBe("");
    expect(completedTokens("john@x.com, jane@y.com, ")).toEqual(["john@x.com", "jane@y.com"]);
  });

  it("handles an empty field", () => {
    expect(currentToken("")).toBe("");
    expect(completedTokens("")).toEqual([]);
  });
});

describe("insertRecipientToken", () => {
  it("appends to an empty field with a trailing comma-space", () => {
    expect(insertRecipientToken("", s("jane@y.com", "Jane", "contact"))).toBe("jane@y.com, ");
  });

  it("replaces the in-progress token, keeping earlier completed ones", () => {
    expect(insertRecipientToken("john@x.com, jan", s("jane@y.com", "Jane", "contact"))).toBe(
      "john@x.com, jane@y.com, ",
    );
  });

  it("works when nothing has been typed for the current token yet", () => {
    expect(insertRecipientToken("john@x.com, ", s("jane@y.com", null, "history"))).toBe(
      "john@x.com, jane@y.com, ",
    );
  });
});

describe("parseRecipientList", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseRecipientList("a@x.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("splits on semicolons too", () => {
    expect(parseRecipientList("a@x.com; b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("drops empty tokens from trailing separators or blank input", () => {
    expect(parseRecipientList("a@x.com, , b@y.com,")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseRecipientList("")).toEqual([]);
    expect(parseRecipientList("   ")).toEqual([]);
  });

  it("includes the final token even with no trailing separator (unlike completedTokens)", () => {
    expect(parseRecipientList("a@x.com, jane@y.com")).toEqual(["a@x.com", "jane@y.com"]);
  });
});
