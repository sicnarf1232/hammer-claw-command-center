import { describe, expect, it } from "vitest";
import { pickReplyTarget, type ReplyTargetMessage } from "./read";

const SELF = "jordan.francis@merit.com";

function msg(over: Partial<ReplyTargetMessage>): ReplyTargetMessage {
  return {
    id: 1,
    direction: "inbound",
    messageId: "<m1@x>",
    fromEmail: "zoya@terumo.com",
    toAddrs: [SELF],
    cc: [],
    subject: "GTIN alignment",
    sentAt: new Date("2026-07-01T10:00:00Z"),
    receivedAt: null,
    ...over,
  };
}

describe("pickReplyTarget", () => {
  it("anchors on the newest inbound message with a messageId", () => {
    const target = pickReplyTarget(
      [
        msg({ id: 1, sentAt: new Date("2026-07-01T10:00:00Z") }),
        msg({ id: 2, direction: "outbound", fromEmail: SELF, sentAt: new Date("2026-07-02T10:00:00Z"), messageId: "<m2@x>" }),
        msg({ id: 3, messageId: "<m3@x>", sentAt: new Date("2026-07-03T10:00:00Z") }),
        msg({ id: 4, messageId: null, sentAt: new Date("2026-07-04T10:00:00Z") }),
      ],
      SELF,
    );
    expect(target?.emailId).toBe(3);
    expect(target?.messageId).toBe("<m3@x>");
  });

  it("builds a reply-all set excluding the sending identity, sender first", () => {
    const target = pickReplyTarget(
      [
        msg({
          fromEmail: "zoya@terumo.com",
          toAddrs: [SELF, "mike@terumo.com", "Zoya@Terumo.com"],
          cc: ["quality@terumo.com", SELF.toUpperCase()],
        }),
      ],
      SELF,
    );
    expect(target?.to).toEqual(["zoya@terumo.com", "mike@terumo.com"]);
    expect(target?.cc).toEqual(["quality@terumo.com"]);
  });

  it("returns null when there is no inbound anchor", () => {
    expect(
      pickReplyTarget(
        [msg({ direction: "outbound", fromEmail: SELF })],
        SELF,
      ),
    ).toBeNull();
    expect(pickReplyTarget([], SELF)).toBeNull();
  });

  it("falls back to receivedAt when sentAt is missing", () => {
    const target = pickReplyTarget(
      [
        msg({ id: 1, sentAt: null, receivedAt: new Date("2026-07-05T08:00:00Z"), messageId: "<a@x>" }),
        msg({ id: 2, sentAt: null, receivedAt: new Date("2026-07-04T08:00:00Z"), messageId: "<b@x>" }),
      ],
      SELF,
    );
    expect(target?.emailId).toBe(1);
  });
});
