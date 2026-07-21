import { describe, it, expect } from "vitest";
import {
  formatMonthDay,
  formatMonthDayYear,
  formatEmailLinkedText,
  formatMeetingLinkedText,
  formatStatusChangeText,
} from "./taskUpdates";

describe("formatMonthDay", () => {
  it("formats an ISO date with no leading zero and no year", () => {
    expect(formatMonthDay("2026-07-26")).toBe("Jul 26");
  });
  it("returns null for an invalid or missing date", () => {
    expect(formatMonthDay(null)).toBeNull();
    expect(formatMonthDay(undefined)).toBeNull();
    expect(formatMonthDay("not-a-date")).toBeNull();
  });
});

describe("formatMonthDayYear", () => {
  it("formats an ISO date with the year", () => {
    expect(formatMonthDayYear("2026-01-05")).toBe("Jan 5, 2026");
  });
  it("returns null for an invalid date", () => {
    expect(formatMonthDayYear("2026-13-40")).toBeNull();
  });
});

describe("formatEmailLinkedText", () => {
  it("builds the sentence from subject and sender name", () => {
    expect(formatEmailLinkedText("Re: PCN 1234", "Scott Ridley", "scott@customer.com")).toBe(
      'Linked to email: "Re: PCN 1234" from Scott Ridley.',
    );
  });
  it("falls back to the email address when no name is known", () => {
    expect(formatEmailLinkedText("Quote request", null, "buyer@customer.com")).toBe(
      'Linked to email: "Quote request" from buyer@customer.com.',
    );
  });
  it("falls back to placeholders for missing subject and sender", () => {
    expect(formatEmailLinkedText(null, null, null)).toBe(
      'Linked to email: "(no subject)" from an unknown sender.',
    );
  });
  it("strips vault field markers from the subject", () => {
    expect(formatEmailLinkedText("Re: [priority::high] PCN update", "Scott", null)).toBe(
      'Linked to email: "Re: PCN update" from Scott.',
    );
  });
});

describe("formatMeetingLinkedText", () => {
  it("builds the sentence from title and date", () => {
    expect(formatMeetingLinkedText("Q3 Business Review", "2026-07-14")).toBe(
      'Linked to meeting: "Q3 Business Review" (Jul 14, 2026).',
    );
  });
  it("omits the parenthetical when no date is known", () => {
    expect(formatMeetingLinkedText("Kickoff", null)).toBe('Linked to meeting: "Kickoff".');
  });
  it("falls back to a placeholder title", () => {
    expect(formatMeetingLinkedText(null, null)).toBe('Linked to meeting: "(untitled meeting)".');
  });
});

describe("formatStatusChangeText", () => {
  it("describes an account set", () => {
    expect(formatStatusChangeText("account", "Terumo Medical")).toBe("Account set to Terumo Medical.");
  });
  it("describes an account cleared", () => {
    expect(formatStatusChangeText("account", null)).toBe("Account cleared.");
  });
  it("describes a type change", () => {
    expect(formatStatusChangeText("type", "PCN")).toBe("Type changed to PCN.");
  });
  it("describes a status change, title-cased", () => {
    expect(formatStatusChangeText("status", "waiting")).toBe("Status changed to Waiting.");
  });
  it("defaults a cleared status to Open", () => {
    expect(formatStatusChangeText("status", null)).toBe("Status changed to Open.");
  });
  it("describes a due date set", () => {
    expect(formatStatusChangeText("due", "2026-07-26")).toBe("Due date set to Jul 26.");
  });
  it("describes a due date cleared", () => {
    expect(formatStatusChangeText("due", null)).toBe("Due date cleared.");
  });
});
