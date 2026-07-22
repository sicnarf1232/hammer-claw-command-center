// Plain-data fixtures for Slice A characterization tests. No database, no AI, no
// network. Meeting notes are raw Markdown in Jordan's template shape so the real
// `parseMeetingNote` parser assigns the same `sourceLine` values production sees.
//
// Rosters are parsed with the real `parseRoster`. Everything here is inert data.

// ---- Meeting notes: action reorder / edit / removal / split / merge ----
//
// All five share the same header so only the Action Items block differs. The
// 0-based line index of each "- [ ]" checkbox line is what the current writer
// treats as the action's identity.

const HEADER = `# Intuitive Surgical -- weekly sync

🗓 2026-07-20 🏢 Merit OEM 📍 Q3 supply 👥 Jordan Francis (Merit OEM), Amy Lee (Intuitive)

## TL;DR

Weekly supply sync.

## Action Items
`;

// Baseline: three actions in their original order.
export const NOTE_BASELINE = `${HEADER}- [ ] Jordan: Send the updated Q3 forecast.
- [ ] Amy: Confirm the revised GTIN list.
- [ ] Jordan: Chase the open CAPA with Quality.

## Key Decisions

- Hold pricing for Q3.
`;

// Reorder: same three actions, order rotated. Text is identical; only the line
// positions change.
export const NOTE_REORDERED = `${HEADER}- [ ] Jordan: Chase the open CAPA with Quality.
- [ ] Jordan: Send the updated Q3 forecast.
- [ ] Amy: Confirm the revised GTIN list.

## Key Decisions

- Hold pricing for Q3.
`;

// Edit: same order and same lines, but the wording of the second action changed.
export const NOTE_EDITED = `${HEADER}- [ ] Jordan: Send the updated Q3 forecast.
- [ ] Amy: Confirm the revised GTIN list by Friday.
- [ ] Jordan: Chase the open CAPA with Quality.

## Key Decisions

- Hold pricing for Q3.
`;

// Removal: the middle action ("Amy: Confirm...") is deleted. The two survivors
// keep their text but the third now sits on the second's old line.
export const NOTE_REMOVED = `${HEADER}- [ ] Jordan: Send the updated Q3 forecast.
- [ ] Jordan: Chase the open CAPA with Quality.

## Key Decisions

- Hold pricing for Q3.
`;

// Split: the third action is split into two more specific actions.
export const NOTE_SPLIT = `${HEADER}- [ ] Jordan: Send the updated Q3 forecast.
- [ ] Amy: Confirm the revised GTIN list.
- [ ] Jordan: Chase the open CAPA with Quality.
- [ ] Jordan: Draft the CAPA closure memo.

## Key Decisions

- Hold pricing for Q3.
`;

// Merge: the first two actions are merged into one.
export const NOTE_MERGED = `${HEADER}- [ ] Jordan: Send the Q3 forecast and confirm the GTIN list.
- [ ] Jordan: Chase the open CAPA with Quality.

## Key Decisions

- Hold pricing for Q3.
`;

// ---- Reprocessing: the same Granola note pulled twice ----
//
// Byte-identical content. Reprocessing must be idempotent.
export const NOTE_GRANOLA_FIRST_PULL = NOTE_BASELINE;
export const NOTE_GRANOLA_SECOND_PULL = NOTE_BASELINE;

// ---- Internal meeting concerning a customer account ----
//
// No `customer:` frontmatter (so the meeting is internal) but the body names the
// customer it is ABOUT via the 📎 marker and in an action owned by a team.
export const NOTE_INTERNAL_ABOUT_CUSTOMER = `# Merit Quality huddle

🗓 2026-07-21 🏢 Merit OEM 📍 Intuitive CAPA 📎 Intuitive Surgical 👥 Jordan Francis (Merit OEM), Nick Patel (Merit OEM)

## TL;DR

Internal huddle about the Intuitive CAPA.

## Action Items

- [ ] Operations: Pull the affected lot travelers.
- [ ] Scott: Review the Intuitive complaint history.

## Key Decisions

- Escalate to Field Assurance.
`;

// ---- Rosters ----

// Two ACTIVE, distinct people who are both called "Scott": one Merit-internal,
// one a customer contact at Intuitive. The roster is a Map keyed by exact name,
// so two people sharing the literal first name "Scott" cannot both be
// represented under that key. Full names are used here to keep both present.
export const ROSTER_TWO_SCOTTS = `
## Leadership

- [[Jordan Francis]]

## Merit Internal People

- [[Scott Reyes]]

## Customer Contacts

- [[Scott Palmer]] ([[Intuitive Surgical]])
- [[Amy Lee]] ([[Intuitive Surgical]])
`;

// A roster where the ONLY "Scott" entries collapse onto the same map key because
// both are recorded as the bare first name "Scott". This is the duplicate-name
// ambiguity the linking rules warn about.
export const ROSTER_COLLIDING_SCOTTS = `
## Merit Internal People

- [[Scott]]

## Customer Contacts

- [[Scott]] ([[Intuitive Surgical]])
`;

// Standard roster: Jordan + Nick are Merit; Amy is a customer contact.
export const ROSTER_BASIC = `
## Leadership

- [[Jordan Francis]]

## Merit Internal People

- [[Nick Patel]]

## Customer Contacts

- [[Amy Lee]] ([[Intuitive Surgical]])
`;

// ---- Templated note for the template-passthrough vs AI-shape characterization.
//
// This note follows Jordan's meeting template, so `matchesNoteTemplate` is true
// and the pull skips the AI pass and uses `parseTemplatedNote` /
// `triagedFromTemplate` instead.
export const NOTE_TEMPLATED_PASSTHROUGH = `# Intuitive Surgical -- weekly sync

🗓 2026-07-20 🏢 Merit OEM 📍 Q3 supply 👥 Jordan Francis (Merit OEM), Amy Lee (Intuitive)

## TL;DR

Weekly supply sync.

## Action Items

- [ ] Jordan: Send the updated Q3 forecast. Due: 2026-07-25
- [ ] Amy: Confirm the revised GTIN list. Due: next week

## Key Decisions

- Hold pricing for Q3.

## Numbers That Matter

- Q3 volume 12k units.

## Full Notes

Detailed discussion of the forecast.
`;
