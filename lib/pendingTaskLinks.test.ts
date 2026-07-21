import { describe, expect, it } from "vitest";
import { pendingLinkMatches } from "./pendingTaskLinks";

const BASE_CREATED = new Date("2026-07-20T10:00:00Z");

describe("pendingLinkMatches", () => {
  it("matches on exact subject + overlapping recipient within the window", () => {
    const ok = pendingLinkMatches(
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], createdAt: BASE_CREATED },
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], sentAt: new Date("2026-07-20T10:05:00Z") },
    );
    expect(ok).toBe(true);
  });

  it("matches case-insensitively and ignores a leading Re:/Fwd: prefix", () => {
    const ok = pendingLinkMatches(
      { subject: "Quote follow-up", toAddrs: ["ZOYA@acme.com"], createdAt: BASE_CREATED },
      { subject: "RE: quote follow-up", toAddrs: ["zoya@acme.com"], sentAt: new Date("2026-07-20T10:02:00Z") },
    );
    expect(ok).toBe(true);
  });

  it("rejects a subject mismatch", () => {
    const ok = pendingLinkMatches(
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], createdAt: BASE_CREATED },
      { subject: "Something else entirely", toAddrs: ["zoya@acme.com"], sentAt: new Date("2026-07-20T10:02:00Z") },
    );
    expect(ok).toBe(false);
  });

  it("rejects when no recipient overlaps", () => {
    const ok = pendingLinkMatches(
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], createdAt: BASE_CREATED },
      { subject: "Quote follow-up", toAddrs: ["amir@acme.com"], sentAt: new Date("2026-07-20T10:02:00Z") },
    );
    expect(ok).toBe(false);
  });

  it("rejects once outside the 30-minute window", () => {
    const ok = pendingLinkMatches(
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], createdAt: BASE_CREATED },
      { subject: "Quote follow-up", toAddrs: ["zoya@acme.com"], sentAt: new Date("2026-07-20T10:45:00Z") },
    );
    expect(ok).toBe(false);
  });

  it("rejects an empty subject on either side", () => {
    const ok = pendingLinkMatches(
      { subject: null, toAddrs: ["zoya@acme.com"], createdAt: BASE_CREATED },
      { subject: null, toAddrs: ["zoya@acme.com"], sentAt: new Date("2026-07-20T10:02:00Z") },
    );
    expect(ok).toBe(false);
  });
});
