import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";

const acct = (
  name: string,
  slug: string,
  contacts: { name: string; title?: string; email?: string; phone?: string }[] = [],
) => ({
  name,
  slug,
  sourcePath: `300 Merit/Customers/${name}.md`,
  contacts,
});

describe("reconcile — people identity", () => {
  it("folds a short owner name into the full-name attendee via an alias", () => {
    const r = reconcile({
      accounts: [],
      roster: [{ name: "Nick Francis", classification: "merit" }],
      series: [],
      meetings: [
        {
          sourcePath: "m1.md",
          title: "Sync",
          attendees: ["Nick Francis"],
          actionItems: [
            { text: "do thing", done: false, owner: "Nick", isJordans: false, sourceLine: 5 },
          ],
        },
      ],
    });
    // One Nick, with "Nick" as an alias (not a second person).
    const nicks = r.people.filter((p) => /nick/i.test(p.fullName));
    expect(nicks).toHaveLength(1);
    expect(nicks[0].aliases).toContain("Nick");
    expect(r.report.merges).toContainEqual({ person: "Nick Francis", alias: "Nick" });
  });

  it("classifies Jordan internal + self, and aliases 'Jordan'", () => {
    const r = reconcile({ accounts: [], roster: [], series: [], meetings: [] });
    const j = r.people.find((p) => p.isSelf);
    expect(j?.fullName).toBe("Jordan Francis");
    expect(j?.classification).toBe("internal");
    expect(j?.aliases).toContain("Jordan");
  });

  it("makes account contacts customer + linked to the account", () => {
    const r = reconcile({
      accounts: [acct("Stryker", "stryker", [{ name: "Mike Spencer", title: "Neuro" }])],
      roster: [],
      series: [],
      meetings: [],
    });
    const ms = r.people.find((p) => p.fullName === "Mike Spencer");
    expect(ms?.classification).toBe("customer");
    expect(ms?.accountSlug).toBe("stryker");
    expect(ms?.title).toBe("Neuro");
  });

  it("flags an ambiguous bare first name instead of mis-merging", () => {
    // Two real people: "Mike" (internal boss) and "Mike Spencer" (customer).
    const r = reconcile({
      accounts: [acct("Stryker", "stryker", [{ name: "Mike Spencer" }])],
      roster: [{ name: "Mike", classification: "merit" }],
      series: [],
      meetings: [
        { sourcePath: "m.md", title: "X", attendees: ["Mike"], actionItems: [] },
      ],
    });
    // "Mike" exactly matches the person "Mike" -> resolves to him (not ambiguous,
    // because exact beats fuzzy). Now a name that is ONLY fuzzy across two:
    const r2 = reconcile({
      accounts: [acct("Stryker", "stryker", [{ name: "Mike Spencer" }])],
      roster: [{ name: "Mike Jones", classification: "merit" }],
      series: [],
      meetings: [
        { sourcePath: "m.md", title: "X", attendees: ["Mike"], actionItems: [] },
      ],
    });
    expect(r2.report.unresolvedNames.some((u) => u.name === "Mike")).toBe(true);
    expect(r.people.some((p) => p.fullName === "Mike")).toBe(true);
  });

  it("links meetings/tasks to accounts and counts everything", () => {
    const r = reconcile({
      accounts: [acct("Stryker", "stryker", [])],
      roster: [{ name: "Nick Francis", classification: "merit" }],
      series: [{ name: "Nick / Jordan 1:1", cadence: "Weekly" }],
      meetings: [
        {
          sourcePath: "300 Merit/Meetings/Stryker/2026-06-01 - Sync.md",
          date: "2026-06-01",
          title: "Sync",
          customer: "Stryker",
          attendees: ["Jordan Francis", "Nick Francis"],
          series: "Nick / Jordan 1:1",
          actionItems: [
            { text: "follow up", done: false, isJordans: true, sourceLine: 9 },
          ],
        },
      ],
    });
    expect(r.meetings[0].accountSlug).toBe("stryker");
    expect(r.meetings[0].isInternal).toBe(false);
    expect(r.meetings[0].attendeeKeys.length).toBe(2);
    expect(r.tasks[0].accountSlug).toBe("stryker");
    expect(r.tasks[0].isJordans).toBe(true);
    expect(r.report.counts.meetings).toBe(1);
    expect(r.report.counts.series).toBe(1);
  });
});
