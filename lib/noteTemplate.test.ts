import { describe, expect, it } from "vitest";
import {
  matchesNoteTemplate,
  parseTemplatedNote,
  triagedFromTemplate,
} from "./noteTemplate";

const TEMPLATED = `# 📝 Stryker Q3 Pipeline Review

📅 07|08|26
🏢 Merit / Stryker
📍 Pipeline review
🔗 Stryker
👥 Jordan Francis, Jennifer Pham, Davis Ruiz

## 📌 TL;DR

Q3 pipeline reviewed. PV quote update committed for July 8. Inari transition pricing pending their acquisition close.

## ✅ Action Items

- [ ] Jordan Francis: Send updated PV quote. Due: 2026-07-08
- [ ] Davis Ruiz: Close remaining 4-5 TUV deficiency documents. Due: Next 2 weeks
- [ ] Confirm Q3 forecast with planning

## 🎯 Key Decisions

- Hold current pricing until Inari acquisition closes

## 📊 Numbers That Matter

- ~400 units/quarter projected
- $1430/TS current PN00135 price

## ⚠️ Watch-Outs

- Greg Chin is the new RA contact for China submissions

## 📖 Full Notes

Long discussion about the resin change timeline and the TGA cert path for Dash Australia.
`;

const FREEFORM = `Meeting with Stryker about pipeline. We talked about pricing and Davis
agreed to close the TUV documents. Jordan will send the PV quote.`;

describe("matchesNoteTemplate", () => {
  it("recognizes Jordan's template", () => {
    expect(matchesNoteTemplate(TEMPLATED)).toBe(true);
  });
  it("rejects freeform notes", () => {
    expect(matchesNoteTemplate(FREEFORM)).toBe(false);
  });
  it("rejects notes with TLDR but no action items structure", () => {
    expect(matchesNoteTemplate("## TL;DR\nStuff happened.")).toBe(false);
  });
});

describe("parseTemplatedNote", () => {
  const p = parseTemplatedNote(TEMPLATED);

  it("extracts the header block", () => {
    expect(p.title).toBe("Stryker Q3 Pipeline Review");
    expect(p.date).toBe("07|08|26");
    expect(p.account).toBe("Stryker");
    expect(p.topic).toBe("Pipeline review");
    expect(p.attendees).toEqual(["Jordan Francis", "Jennifer Pham", "Davis Ruiz"]);
  });

  it("extracts the TL;DR verbatim", () => {
    expect(p.tldr).toContain("PV quote update committed");
  });

  it("parses single-line action items with owner and due", () => {
    expect(p.actionItems).toHaveLength(3);
    expect(p.actionItems[0]).toEqual({
      owner: "Jordan Francis",
      text: "Send updated PV quote",
      due: "2026-07-08",
    });
    expect(p.actionItems[1].due).toBe("Next 2 weeks");
    expect(p.actionItems[2]).toEqual({
      owner: null,
      text: "Confirm Q3 forecast with planning",
      due: null,
    });
  });

  it("extracts the optional sections", () => {
    expect(p.decisions).toEqual(["Hold current pricing until Inari acquisition closes"]);
    expect(p.numbers).toHaveLength(2);
    expect(p.watchouts).toHaveLength(1);
    expect(p.fullNotes).toContain("resin change timeline");
  });
});

// Jordan's real note shape (2026-07-09): H1 sections WITH trailing colons,
// the whole meta block on one line, 🗓 instead of 📅, parentheticals in the
// attendee list, and horizontal rules between sections.
const REAL_WORLD = `# 📝 T.N. | Merit PCN [samples, GTIN, bridge]

🗓 06|18|26 🏢 Merit OEM / T.N. (remote neuro group) 📍 Product Change Notification 📎 Syringe kits (KO4 x2, K12 x2) 👥 Jordan Francis (Merit OEM), Hailey, Scott, Jessica Chen (T.N. side: Daniel, Sapna)

---

# 📌 TL;DR:

Both sides need internal alignment before a clear path forward.

---

# ✅ Action Items:

- [ ] Scott: Compile full list of outstanding EO sterilization documentation. Due: Tomorrow (Jun 19)
- [ ] Jordan Francis: Respond to T.N. with ETA on EO documentation delivery. Due: Tomorrow (Jun 19)

---

# 🎯 Key Decisions:

- EO sterilization docs are required for MDR submission.

---

# ⚠ Watch-Outs:

- Bridge supply window is tight.

---

# 📖 Full Notes:

EO Sterilization Documentation (MDR): details here.
`;

describe("real-world template variant", () => {
  it("matches despite colons, H1 headers, and rules", () => {
    expect(matchesNoteTemplate(REAL_WORLD)).toBe(true);
  });

  it("parses the one-line meta block", () => {
    const p = parseTemplatedNote(REAL_WORLD);
    expect(p.title).toBe("T.N. | Merit PCN [samples, GTIN, bridge]");
    expect(p.date).toBe("06|18|26");
    expect(p.company).toContain("Merit OEM / T.N.");
    expect(p.attendees).toEqual(["Jordan Francis", "Hailey", "Scott", "Jessica Chen"]);
    expect(p.actionItems).toHaveLength(2);
    expect(p.actionItems[0].owner).toBe("Scott");
    expect(p.actionItems[0].due).toBe("Tomorrow (Jun 19)");
    expect(p.watchouts).toEqual(["Bridge supply window is tight."]);
  });
});

describe("triagedFromTemplate", () => {
  const t = triagedFromTemplate(parseTemplatedNote(TEMPLATED), {
    fallbackTitle: "fallback",
    attendees: ["Jordan Francis", "Jennifer Pham"],
    knownAccounts: ["Stryker", "MicroVention Terumo"],
    date: "2026-07-08",
  });

  it("maps to the pipeline shape without AI", () => {
    expect(t.account).toBe("Stryker");
    expect(t.bucket).toBe("Stryker");
    expect(t.title).toBe("Stryker Q3 Pipeline Review");
    expect(t.modelUsed).toContain("template pass-through");
  });

  it("marks Jordan's items and splits ISO due from due phrases", () => {
    expect(t.actionItems[0].isJordans).toBe(true);
    expect(t.actionItems[0].due).toBe("2026-07-08");
    expect(t.actionItems[1].isJordans).toBe(false);
    expect(t.actionItems[1].due).toBeUndefined();
    expect(t.actionItems[1].dueText).toBe("Next 2 weeks");
  });

  it("carries the template's attendee list, falling back to captured attendees", () => {
    expect(t.attendees).toEqual(["Jordan Francis", "Jennifer Pham", "Davis Ruiz"]);
    const noLine = triagedFromTemplate(
      parseTemplatedNote(TEMPLATED.replace(/👥 [^\n]*/, "👥 ")),
      {
        fallbackTitle: null,
        attendees: ["Jordan Francis", "Mike Spencer"],
        knownAccounts: [],
        date: "2026-07-08",
      },
    );
    expect(noLine.attendees).toEqual(["Jordan Francis", "Mike Spencer"]);
  });

  it("falls back to Internal bucket without an account", () => {
    const internal = triagedFromTemplate(
      parseTemplatedNote(TEMPLATED.replace("🔗 Stryker", "🔗 ").replace("🏢 Merit / Stryker", "🏢 ")),
      { fallbackTitle: null, attendees: [], knownAccounts: [], date: "2026-07-08" },
    );
    expect(internal.account).toBeNull();
    expect(internal.bucket).toBe("Internal");
  });
});
