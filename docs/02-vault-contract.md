# 02 — Vault Contract (parse to THIS)

This is the exact shape of the data in Jordan's vault. The app must parse to this spec. Do not infer your own format. All examples below are real patterns from the vault.

## Folder model

```
The Hammer Claw/                 (repo root)
  000 OS/                        machinery: SCHEMA.md, WORKSTREAM-SPEC.md, templates, scripts
  100 Periodics/                 Daily/ Weekly/ Monthly/ + Meetings-Index.md
  200 Dashboards/                Dataview dashboards (read-only views)
  300 Merit/                     Customers/ People/ Projects/ Meetings/ Sales Ops/ Work/ Email Workspace/ Price List/ Inbox/
  400 Nextech/                   Clients/ People/ Projects/ Marketing/ Meetings/ Inbox/
  500 Sloan/                     Projects/ Meetings/
  600 Personal/                  Bella/ Family/ Coaching/ Personal Assistant/ Inbox/
  700 Notes/                     standalone reference
  900 Archive/                   retired
  memory/                        knowledge graph: people/ projects/ context/ workflows/ style/
```

Meeting notes live in **account subfolders**: `300 Merit/Meetings/<Account>/<note>.md`.

## Required frontmatter (every content note)

```yaml
---
workstream: merit          # merit | nextech | sloan | personal | shared
type: meeting              # see vocabulary below
status: active             # active | in-progress | done | on-hold | reference | archived
created: 2026-05-28        # YYYY-MM-DD
---
```

`type` vocabulary: `customer`, `person`, `project`, `meeting`, `daily`, `weekly`, `monthly`, `dashboard`, `note`, `workflow`, `inbox`, `spec`, `sop`, `template`, `index`, `archive`. (Some legacy notes use freeform `type` like `OEM Account` — tolerate unknown values, do not crash.)

Work-product notes (300 to 600) carry their folder's workstream. Reference notes (`memory/`, `700`, templates, dashboards, periodics) carry `workstream: shared`.

## Task schema (the most important parser)

Source of truth: `000 OS/SCHEMA.md`. A task is up to four indented rows under a checkbox line.

```
- [ ] Short verb-first action title
    [customer:: [[Customer Name]]] [due:: YYYY-MM-DD] [priority:: high]
    Rich description in prose. Who to email, what to bundle, why it matters. Wikilink [[people]] inline.
    Notes: free-form working scratchpad, edited live, written back to source.
```

- Line 1: `- [ ]` (open) or `- [x]` (done) + title.
- Line 2 (indented): inline fields in `[key:: value]` form, space-separated, any order.
- Line 3 (indented, optional): prose description.
- Line 4 (indented, optional): `Notes:` working line.

### Fields

| Field | Values | Required |
|-------|--------|----------|
| `customer` | `[[Wikilink]]` or `internal` | when applicable |
| `due` | `YYYY-MM-DD` | when dated |
| `priority` | `high` / `med` / `low` | recommended |
| `created` | `YYYY-MM-DD` | recommended |
| `workstream` | `merit`/`nextech`/`sloan`/`personal`/`shared` | only when note is shared or task crosses workstreams; else inherit from frontmatter |
| `scheduled` | `YYYY-MM-DD` | optional |
| `draft` | `[[Wikilink]]` | optional |
| `thread` | e.g. `#6` | optional |
| `status` | `waiting` / `blocked` / `someday` | optional |
| `completed` | `YYYY-MM-DD` (auto-set when checked off) | auto |

### Real example

```
- [ ] Notify planning team on Trelleborg stopcock status
    [customer:: [[Trelleborg]]] [due:: 2026-05-21] [priority:: high]
    Send [[Skyler Freeman]] and Will Lay the build-to-Merit-spec disposition. Bundle H3445878 + H3524460. Confirm production dates this week or it escalates Monday.
    [draft:: [[trelleborg-gore-ncr-stopcocks-skyler]]] [thread:: #5]
```

### Notes-line signals (the app should preserve, and may surface)

The schedulers scan `Notes:` lines for:
- **Completion signals**: `DONE`, `COMPLETE`, `✓ done`, `sent`, `replied`, `shipped` at start or end of the line.
- **Commands** (plain language, run on next pass): `Add this workflow to vault memory`, `Archive this draft`, `Roll over to <date>`, `Convert to waiting`, `Split into: X | Y | Z`.

The app does not have to execute these, but must not mangle them. When the app edits a Notes line, write back to the source file's `Notes:` line exactly.

### Title rules (for any task the app generates)

Verb first, one clause, under 8 words, no customer/people/PO numbers/drafts in the title (those are fields or description). No literal `]` inside description text other than wikilinks.

### Parser pseudocode

```
for each markdown file in scope:
  strip frontmatter (YAML between leading --- fences)
  scan lines:
    if line matches /^(\s*)- \[( |x)\] (.+)$/:
      task = { done: $2 == 'x', title: $3.trim(), fields: {}, description: '', notes: '' }
      look ahead at more-indented lines:
        extract all [key:: value] pairs into task.fields  (value may be [[wikilink]])
        first non-field prose line -> task.description
        line starting 'Notes:' -> task.notes
      task.workstream = task.fields.workstream ?? frontmatter.workstream
      task.sourceFile = path ; task.sourceLine = lineNo  (needed for write-back)
      emit task
```

Wikilink form: `[[Target]]` or `[[Target|Alias]]` or path-qualified `[[memory/people/Scott|Scott]]`. Strip to basename for display, keep full target for linking.

## Meeting notes

Frontmatter (real example):

```yaml
---
workstream: merit
type: meeting
status: active
created: 2026-05-28
date: 2026-05-28
meeting_time: 2:30 PM MDT
customer: "[[MicroVention Terumo]]"
attendees: [Jordan Francis, Haley Nelson, Scott Taylor, Ben Skousen, Daniel Koi]
series: Terumo / Merit PCN Recurring
granola_id: d1d749cd-99a7-4f72-9e59-4dcbabc15f92
---
```

Body has `## TL;DR`, `## Notes`, `## Decisions`, `## Action Items`. Action items use a **dual-capture** pattern, both forms appear under `## Action Items`:

```
## Action Items

- [ ] Zoya: Follow up on internal part number creation timeline
- [ ] Jordan: Send updated validation memos for extrusion facility to Terumo
    [customer:: [[MicroVention Terumo]]] [created:: 2026-05-28] [priority:: high]
- [x] Jordan: Set up biweekly meetings with current group
    [customer:: [[MicroVention Terumo]]] [created:: 2026-05-28] [priority:: med]
```

- **Jordan's items** carry the inline-field metadata row (these are real tasks, surface them in the task views).
- **Others' items** are plain `- [ ] Owner: task` with the owner as a `Name:` prefix and no field row. Capture owner + task; these are tracking, not Jordan's tasks.
- Do not drop the others-capture. The existing meeting-notes viewer renders both, and dropping it silently loses action items.

## Roster (team classification: Merit vs customer)

Source: `memory/context/merit.md`. Used to color attendees (Merit vs customer). Parse these sections for wikilinks:

- `## Leadership` and `## Merit Internal People` -> classify those names as **merit**.
- `## Customer Contacts` -> names are **customer**; trailing `([[Account]])` marks their account.
- `## Team Overrides` -> lines like `Name = merit|customer`. **Apply these last, authoritatively** (they resolve same-name collisions).

```
build map name -> merit|customer
  add Leadership + Merit Internal People as merit
  add Customer Contacts as customer
  apply Team Overrides last (override any prior)
unknown name -> default gray/unclassified, do not crash
```

## Meetings index

`100 Periodics/Meetings-Index.md` is the **single source of truth for "what meetings exist."** Do not crawl the Meetings folders directly for listings. It is a markdown table:

```
| Date | Bucket | Title | Note |
|------|--------|-------|------|
| 2026-06-05 | Stryker | TMV Memo & PPAP Alignment | [[2026-06-05 - TMV Memo & PPAP Alignment]] |
```

Parse the table; resolve each `[[basename]]` to a file by searching the Meetings folders for a matching filename.

## Sample fixtures for unit tests

Use these real strings as parser test fixtures (they exercise the tricky cases):

1. Task with all fields + draft + thread (Trelleborg example above).
2. Done task `- [x]` with `[completed:: ...]`.
3. Meeting action item, Jordan's, with field row.
4. Meeting action item, other owner, plain `- [ ] Zoya: ...`.
5. Roster line with same-name override (`Kirk = merit`).
6. Wikilink with alias and path-qualified form.

Copy the literal examples from this doc into `lib/vault/__fixtures__/` and assert the parsed output.
