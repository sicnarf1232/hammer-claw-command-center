import { describe, it, expect } from "vitest";
import { resolveTaskSourceLink } from "./taskSourceLink";

describe("resolveTaskSourceLink", () => {
  it("returns null for an app-created task (no vault file behind it)", () => {
    expect(resolveTaskSourceLink("db:tasks")).toBeNull();
  });

  it("returns null for an empty sourceFile", () => {
    expect(resolveTaskSourceLink("")).toBeNull();
  });

  it("links a meeting note using the same /meetings?note= pattern as TaskLinkedMeetings", () => {
    const path = "300 Merit/Meetings/Duran/2026-06-17 - GTIN Alignment.md";
    expect(resolveTaskSourceLink(path)).toEqual({
      label: "2026-06-17 - GTIN Alignment.md",
      href: `/meetings?note=${encodeURIComponent(path)}`,
    });
  });

  it("links a customer note to the account page when an accountSlug is known", () => {
    const path = "300 Merit/Customers/Duran.md";
    expect(resolveTaskSourceLink(path, "duran")).toEqual({
      label: "Duran.md",
      href: "/accounts?a=duran",
    });
  });

  it("gives a customer note a label with no link when the account slug is unknown", () => {
    const path = "300 Merit/Customers/Duran.md";
    expect(resolveTaskSourceLink(path)).toEqual({ label: "Duran.md", href: null });
  });

  it("gives a project or other note a label with no link (no viewer exists yet)", () => {
    const path = "300 Merit/Projects/Trelleborg.md";
    expect(resolveTaskSourceLink(path)).toEqual({ label: "Trelleborg.md", href: null });
  });
});
