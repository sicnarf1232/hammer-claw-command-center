import { describe, expect, it } from "vitest";
import { notificationHref } from "./notifyLink";

describe("notificationHref", () => {
  it("prefers an explicit threadKey for new_email", () => {
    expect(notificationHref("new_email", { threadKey: "t:AAQk=" })).toBe(
      "/inbox?selected=t%3AAAQk%3D",
    );
  });

  it("maps a new_email emailId to its m:<id> thread key", () => {
    expect(notificationHref("new_email", { messageId: "<x@y>", emailId: 42 })).toBe(
      "/inbox?selected=m%3A42",
    );
  });

  it("falls back to the inbox when new_email meta has no usable key", () => {
    expect(notificationHref("new_email", { messageId: "<x@y>" })).toBe("/inbox");
    expect(notificationHref("new_email", { emailId: "42" })).toBe("/inbox");
    expect(notificationHref("new_email", null)).toBe("/inbox");
  });

  it("sends due_today to the tasks view", () => {
    expect(notificationHref("due_today", { count: 3, date: "2026-07-13" })).toBe("/tasks");
  });

  it("sends briefs to their dashboard card", () => {
    expect(notificationHref("brief", { path: "100 Periodics/Daily/x.md", kind: "morning" })).toBe(
      "/dashboard#brief",
    );
  });

  it("keeps errors and unknown kinds on the notification log", () => {
    expect(notificationHref("error", null)).toBe("/notifications");
    expect(notificationHref("info", { anything: true })).toBe("/notifications");
    expect(notificationHref("success", undefined)).toBe("/notifications");
  });
});
