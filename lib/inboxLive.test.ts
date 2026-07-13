import { describe, expect, it } from "vitest";
import { matchesFolder, mergeThreadDelta } from "./inboxLive";
import type { InboxThread } from "@/components/InboxWorkspace";

function thread(over: Partial<InboxThread>): InboxThread {
  return {
    key: "t:1",
    subject: "GTIN alignment",
    preview: "Latest inbound",
    lastAtISO: "2026-07-13T10:00:00.000Z",
    count: 1,
    inbound: 1,
    outbound: 0,
    lastDirection: "inbound",
    who: "Zoya",
    accountName: null,
    accountSlug: null,
    needsReview: false,
    hasAttachments: false,
    flagged: false,
    replied: false,
    unread: true,
    summary: null,
    pathway: null,
    priority: null,
    needsReply: false,
    reviewed: false,
    archived: false,
    linkedTask: null,
    ...over,
  };
}

describe("matchesFolder", () => {
  it("keeps archived threads out of everything but Archived", () => {
    const t = thread({ archived: true, flagged: true });
    expect(matchesFolder(t, "archived")).toBe(true);
    expect(matchesFolder(t, "flagged")).toBe(false);
    expect(matchesFolder(t, "all")).toBe(false);
  });

  it("attention needs an unreviewed flag, needs-review, or needs-reply", () => {
    expect(matchesFolder(thread({ flagged: true }), "attention")).toBe(true);
    expect(matchesFolder(thread({ needsReply: true }), "attention")).toBe(true);
    expect(matchesFolder(thread({ flagged: true, reviewed: true }), "attention")).toBe(false);
    expect(matchesFolder(thread({}), "attention")).toBe(false);
  });

  it("all mail is a working queue: reviewed threads triage away", () => {
    expect(matchesFolder(thread({}), "all")).toBe(true);
    expect(matchesFolder(thread({ reviewed: true }), "all")).toBe(false);
    expect(matchesFolder(thread({ reviewed: true }), "reviewed")).toBe(true);
  });

  it("treats unknown keys as pathway folders", () => {
    expect(matchesFolder(thread({ pathway: "logistics" }), "logistics")).toBe(true);
    expect(matchesFolder(thread({ pathway: "fyi" }), "logistics")).toBe(false);
    expect(matchesFolder(thread({ outbound: 2 }), "sent")).toBe(true);
  });
});

describe("mergeThreadDelta", () => {
  it("updates existing rows in place, keyed by thread key", () => {
    const existing = [
      thread({ key: "t:1", unread: false, preview: "old" }),
      thread({ key: "t:2", lastAtISO: "2026-07-13T09:00:00.000Z" }),
    ];
    const fresh = thread({
      key: "t:1",
      unread: true,
      preview: "new inbound",
      lastAtISO: "2026-07-13T11:00:00.000Z",
    });
    const { threads, added } = mergeThreadDelta(existing, [fresh], "all");
    expect(added).toBe(0);
    expect(threads).toHaveLength(2);
    expect(threads[0]).toBe(fresh); // updated AND resorted to the top
  });

  it("prepends genuinely new threads that belong in the current folder", () => {
    const existing = [thread({ key: "t:1", lastAtISO: "2026-07-13T09:00:00.000Z" })];
    const fresh = thread({ key: "t:9", lastAtISO: "2026-07-13T12:00:00.000Z" });
    const { threads, added } = mergeThreadDelta(existing, [fresh], "all");
    expect(added).toBe(1);
    expect(threads.map((t) => t.key)).toEqual(["t:9", "t:1"]);
  });

  it("skips new threads that do not match the folder, but still updates known ones", () => {
    const existing = [thread({ key: "t:1" })];
    const knownUpdate = thread({ key: "t:1", preview: "newer" });
    const stranger = thread({ key: "t:9", pathway: "fyi" });
    const { threads, added } = mergeThreadDelta(existing, [knownUpdate, stranger], "logistics");
    expect(added).toBe(0);
    expect(threads).toHaveLength(1);
    expect(threads[0].preview).toBe("newer");
  });

  it("returns the same array reference when nothing changes", () => {
    const existing = [thread({ key: "t:1" })];
    expect(mergeThreadDelta(existing, [], "all").threads).toBe(existing);
    const stranger = thread({ key: "t:9", reviewed: true });
    expect(mergeThreadDelta(existing, [stranger], "all").threads).toBe(existing);
  });
});
