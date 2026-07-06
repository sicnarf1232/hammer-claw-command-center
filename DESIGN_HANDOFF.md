# Main St. — Design Handoff for Claude Code
> Generated from Figma Make prototype session. Hand this file to Claude Code along with screenshots from the prototype canvas.

---

## 0. Context

This doc specifies the full visual and interaction redesign of the **Hammer Claw Command Center** (Next.js / Tailwind / Drizzle). The existing app is functional; this redesign skins it, restructures navigation, and adds several new UI surfaces. The app brand is now **Main St.** (not Film Room).

**Repo:** `sicnarf1232/hammer-claw-command-center`  
**Stack:** Next.js App Router, Tailwind CSS, Drizzle ORM, Vercel

---

## 1. Brand & Design System

### 1.1 Fonts

```css
/* Already in /public/fonts/ — wire via @font-face */
@font-face {
  font-family: 'Sohne';
  src: url('/fonts/Sohne-Buch.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/* Google Fonts fallback */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
```

- **Display / headings:** `'Sohne', 'Plus Jakarta Sans', sans-serif` — used for page titles, wordmark, account names, section headers
- **Body / UI:** `'Inter', sans-serif` — everything else

### 1.2 Color Tokens — Dark Mode (default)

```css
:root {
  /* Surfaces */
  --bg-sunken:    #0B1117;   /* page background */
  --bg-nav:       #111821;   /* sidebar + top headers */
  --bg-card:      #1C2433;   /* cards, panels */
  --bg-raised:    #243040;   /* hover, selected rows */
  --bg-hi:        #2D3A4F;   /* active/selected state */

  /* Text */
  --text-primary:   #F2F2EE;
  --text-secondary: rgba(242,242,238,0.65);
  --text-muted:     rgba(242,242,238,0.38);
  --text-ghost:     rgba(242,242,238,0.15);

  /* Accent — Sea Glass */
  --sg:        #36B3A6;
  --sg-press:  #2A9084;
  --sg-hover:  #5CC6BB;
  --sg-tint:   #B4E4DF;
  --sg-soft:   rgba(54,179,166,0.10);
  --sg-border: rgba(54,179,166,0.22);

  /* Borders */
  --border:    rgba(166,173,180,0.13);
  --border-md: rgba(166,173,180,0.22);

  /* Status */
  --danger:      #D8695C;
  --danger-soft: rgba(216,105,92,0.12);
  --warn:        #E0A458;
  --warn-soft:   rgba(224,164,88,0.12);
  --info:        #5C9CD8;
  --info-soft:   rgba(92,156,216,0.12);
  --success:     #36B3A6;
  --success-soft:rgba(54,179,166,0.10);

  /* Client identity (Merit OEM — keep as-is) */
  --merit-red:  #D8695C;
  --merit-soft: rgba(216,105,92,0.12);

  /* Radius */
  --r-sm: 6px;
  --r-md: 9px;
  --r-lg: 12px;
  --r-xl: 16px;
  --r-full: 9999px;
}
```

### 1.3 Color Tokens — Light Mode

```css
.light {
  --bg-sunken:    #F2F2EE;
  --bg-nav:       #FFFFFF;
  --bg-card:      #FFFFFF;
  --bg-raised:    #F0F0EB;
  --bg-hi:        #E5E5DF;

  --text-primary:   #0B1117;
  --text-secondary: rgba(11,17,23,0.68);
  --text-muted:     rgba(11,17,23,0.40);
  --text-ghost:     rgba(11,17,23,0.08);

  --sg:        #2A9084;
  --sg-press:  #1F7068;
  --sg-hover:  #36B3A6;
  --sg-soft:   rgba(42,144,132,0.09);
  --sg-border: rgba(42,144,132,0.25);

  --border:    rgba(11,17,23,0.09);
  --border-md: rgba(11,17,23,0.16);

  --danger:      #B84D42;
  --danger-soft: rgba(184,77,66,0.09);
  --warn:        #B86B20;
  --warn-soft:   rgba(184,107,32,0.10);
  --info:        #3A78C4;
  --info-soft:   rgba(58,120,196,0.10);
}
```

Toggle by adding/removing `.light` class on `<html>`. Persist in `localStorage`.

### 1.4 Logo Assets

```
/public/fonts/Sohne-Buch.woff2         ← already present
/public/logos/mainst-mark-dark.png     ← dark navy mark (use on LIGHT backgrounds)
/public/logos/mainst-mark-light.png    ← ivory mark (use on DARK backgrounds)
/public/logos/mainst-logo-dark.png     ← full wordmark, dark (use on LIGHT bg)
/public/logos/mainst-logo-light.png    ← full wordmark, light (use on DARK bg)
```

Move from `imports/` → `public/logos/` during implementation.

**Rule:** `isDark → mark-light.png` / `isLight → mark-dark.png`

### 1.5 Tailwind Config additions

```ts
// tailwind.config.ts — extend theme
colors: {
  sunken:  'var(--bg-sunken)',
  nav:     'var(--bg-nav)',
  card:    'var(--bg-card)',
  raised:  'var(--bg-raised)',
  hi:      'var(--bg-hi)',
  fg:      'var(--text-primary)',
  dim:     'var(--text-secondary)',
  muted:   'var(--text-muted)',
  sg:      'var(--sg)',
  sgSoft:  'var(--sg-soft)',
  border:  'var(--border)',
  danger:  'var(--danger)',
  dangerSoft: 'var(--danger-soft)',
  warn:    'var(--warn)',
  warnSoft:'var(--warn-soft)',
},
fontFamily: {
  display: ["'Sohne'", "'Plus Jakarta Sans'", "sans-serif"],
  sans:    ["'Inter'", "sans-serif"],
},
```

---

## 2. Global Layout

### 2.1 App Shell

```
┌──────────────┬───────────────────────────────────────────┐
│  Sidebar     │  Content area (flex-1)                    │
│  220px       │                                           │
│  (collapses  │  Inbox: FolderSidebar + ThreadList +     │
│   to 52px)   │         ThreadDetail                      │
│              │  All other views: full width              │
└──────────────┴───────────────────────────────────────────┘
```

- Sidebar is `position: fixed` on desktop, bottom tab bar on mobile (<768px)
- Content area has `overflow-y: auto` per view
- All transitions use `transition: all 0.22s ease`

### 2.2 Sidebar — Two-tier nav

**Primary tier** (full size, prominent):
- Dashboard (`/`) 
- Inbox (`/inbox`)
- Accounts (`/accounts`)
- Meetings (`/meetings`)

**Separator** — a thin `border-t` + "TOOLS" eyebrow label (hidden when collapsed)

**Secondary tier** (same size, after separator):
- Today (`/today`)
- Ask (`/ask`)
- Tasks (`/tasks`)
- Contacts (`/contacts`)
- Quote (`/quote`)
- Library (`/library`)

**Bottom tier** (smaller, always at bottom):
- Branding (`/branding`)
- Activity (`/notifications`) — show count badge "3" in danger color
- Settings (`/settings`)
- Theme toggle (Moon icon) — toggles light/dark, label flips "Light mode" / "Dark mode"

**Collapsed state (52px):**
- Show only icons + logo mark
- Inbox shows a 6px sea glass dot badge
- Activity shows a 6px red dot badge
- Tooltip on hover shows label
- Active state: 2.5px left accent bar in sea glass color

**Collapse trigger:** clicking any nav item auto-collapses to 52px. A `‹ ›` chevron in logo row toggles manually.

### 2.3 Mobile layout (<768px)

- No sidebar — hidden
- Bottom tab bar: Home | Inbox | Accounts | Today | More
- Inbox folder list = bottom sheet (slide up) triggered by tapping the current folder name
- Thread detail = full-screen overlay, slide in from right
- Pathway manager = full-screen overlay

---

## 3. Screen Specs

### 3.1 Dashboard (`/dashboard` or `/`)

**Make this the default landing route** (currently `/meetings`).

**Layout:** Full-width, no fixed side panels.

**Sections:**
```
┌─ Header ───────────────────────────────────────────────────────┐
│  "Good morning, Jordan."  [date]         [Floating Ask bar]    │
├────────────────────────────┬───────────────────┬───────────────┤
│  TODAY'S COMMITS (1/3 col) │  INBOX + ACCOUNTS │  RIGHT RAIL   │
│  • Commit task cards       │  (1/3 col)        │  (300px)      │
│  • Add from queue          │  • Inbox snapshot │  • Upcoming   │
│  • Overdue <details>       │  • Accts needing  │    meetings   │
│                            │    attention      │  • Activity   │
│                            │                   │  • Ask recent │
└────────────────────────────┴───────────────────┴───────────────┘
```

**Floating Ask bar:**
```tsx
<div className="flex items-center gap-2 bg-card border border-border-md rounded-xl px-3 py-2 min-w-[320px]">
  <Sparkles size={14} className="text-sg" />
  <input placeholder="Ask anything about your work…" className="bg-transparent outline-none text-fg text-sm flex-1" />
</div>
```

**Today's Commits card:** Tasks the user has explicitly chosen to do today. Shown as expandable task cards with a checkbox. Separate from the overdue backlog which is in a collapsed `<details>` element.

**Inbox snapshot:** 3 stat tiles (Needs attention / Flagged / Needs reply) + 3 most recent threads needing action.

**Accounts needing attention:** Accounts with `overdueCount > 0`, showing the count, avatar, link to account.

**Right rail:** Upcoming meetings (next 3), recent activity feed, quick Ask history.

---

### 3.2 Inbox (`/inbox`) — Existing, reskin

**Three-column layout:**
```
[Folder sidebar 186px] [Thread list flex] [Thread detail flex — when open]
```

Both sidebar and thread list auto-collapse when thread detail opens. Folder sidebar collapses to 28px strip; thread list fixes to 360px.

**Folder sidebar:** Top group (Needs attention, Sent, Flagged, Reviewed, All mail, Archived) + "PATHWAYS" section header + pathway items with colored dot. "Manage" button + "Add pathway" dashed button at bottom. "Hide ‹" collapse tab.

**Thread list row — anatomy (top to bottom):**
1. Sender name (bold if unread) + message count badge + timestamp
2. Subject line with outbound arrow if sent
3. AI summary line (sea glass spark icon + text, 2-line clamp)
4. Chip row: `Priority HIGH` → `Pathway` → `Account` → `Reviewed/Replied` → `Attachment`

**State indicators (2 dots max, inline with sender name):**
- Sea glass dot = unread (clears on open)
- Amber dot = needs action (AI-flagged, clears on "Mark reviewed" only)

**Hover reveal (row):** Checkbox + 4 quick-action buttons: pathway assign (popover), flag, snooze (4 quick options popover), archive.

**Unmapped sender:** Dashed "?" avatar + "Link account" dashed chip instead of account chip.

**Thread detail — panels (top to bottom):**
1. Back button + subject + message count + Forward/Flag/Archive
2. Participant map strip: External (danger chips) | Internal (sea glass chips)
3. Three-state legend row + "Mark reviewed" button
4. AI Summary card (sea glass tint bg)
5. Cross-customer playbook panel (amber — only shows for quality-pcn and quote-request pathways)
6. Triage bar (all pathway buttons, active = filled)
7. Action composer (add task / link to task from this thread)
8. Messages (external = neutral card, internal = indented + sea glass border, collapsed by default)
9. Reply composer (with AI draft field, recipient warning, "Review & send" → recipient modal)

**Cross-customer playbook panel:**
- Collapsed by default, amber border
- Shows prior work on same topic across other accounts
- References documents from Library

**Action composer (Backlog item D):**
- "Add action from this thread" → expands
- Two modes: "Create task" (title + due date + priority + auto-links to account) or "Link to existing" (shows account's open tasks)

**Pathway manager (slide-in from right):**
- List of pathways with: up/down reorder, color picker (7 palette options), rename (click pencil → inline edit), delete, count
- "Add new pathway" with name + color
- Save / Discard buttons

---

### 3.3 Today (`/today`) — Two tabs

**Tab 1: Focus queue**

```
[Morning brief card — sea glass bg]
  "5 overdue tasks · 3 need replies in inbox · Stryker call at 2:00 PM"

[2-column grid]
Left: "Today's commits"                Right: "Overdue backlog" (collapsed <details>)
  • Commit task cards (completable)       • List of overdue tasks
  • "Add from queue" section               • "Add today" button on each
  • Tasks not yet committed
```

**Commit task card:** Checkbox (priority-colored border when unchecked), task title, account chip, due/overdue date. Click anywhere to toggle done (fades + strikethrough).

**Tab 2: Build your day** → see §3.4

---

### 3.4 Build Your Day (tab within Today)

**Split layout: 280px left + flex right**

**Left panel — task queue:**
- Day stats: 3 tiles (Meetings / Task time / Open time available)
- "AI: Plan my day" button → auto-schedules using greedy slot-fill algorithm
- Rolled-over tasks from yesterday (amber card at top)
- Unscheduled tasks grouped: Overdue → Due soon → This week
- Per-task "Schedule" → expands inline: start time select + duration buttons (15m/30m/45m/1h/1.5h/2h) + "Add to day" + Cancel

**Right panel — day timeline (8am–7pm):**
- 30-min slot rows, 52px each
- Time labels on left every full hour
- Calendar events (pulled from Outlook via Microsoft Graph, same auth as email) shown as fixed blocks with meeting label, title, time range — not movable
- Scheduled task blocks: colored by account, left-bordered by urgency color (red/amber/sea glass), show task name + account + duration
- Each task block has: "Mark done" (turns teal), "→ Tomorrow" (rollover), "×" (remove)
- Red "now" line at current time position
- Rollover summary at bottom of panel

**Rollover logic:** Task blocks not marked done at end of day auto-queue for next day. The underlying task stays open; only the time-block intention moves. Tomorrow's plan shows a "Rolled from yesterday" amber chip.

**Calendar sync:** Microsoft Graph `/me/calendarView` — same OAuth token already used for email. Request calendar events for today's date range on page load.

---

### 3.5 Tasks (`/tasks`) — Enhanced

**Default view: Grouped by account** (toggle to table view)

**Account group header:**
- Avatar + account name (in account color) + task count
- "X overdue" badge (danger) + "X needs update" badge (amber) if applicable
- "From Granola" badge if any tasks came from meeting extraction

**Enhanced task card (expandable):**

Collapsed row:
```
[checkbox] [task title]    [type chip]  [urgency label]  [Send update btn?]  [›]
           [account chip · "from meeting" chip · "X/Y internal steps"]
```

Expanded (click anywhere on row):
```
┌─ Internal progress ─────────────────┐  ┌─ Customer update ──────────────────┐
│ progress bar (X/Y done)             │  │  Last: [date] or "Never"           │
│ ☑ Step text → Owner                 │  │  Note if blocked internally        │
│ ☐ Step text → Owner (blocking)      │  │  [Draft "still working on it"]     │
│ + Add step                          │  │  → opens textarea with AI draft    │
└─────────────────────────────────────┘  │  [Send in thread / Send email]  [×] │
                                         └────────────────────────────────────┘

[If linked thread:]
📧 Thread subject · sender · time ago          [Reply in thread →]

[Schedule for today →]  Opens Build Your Day tab with task pre-selected
```

**Urgency system:**
- `daysUntilDue < 0` → red left border, "Xd overdue" red label
- `daysUntilDue 0–2` → amber left border, "Xd left" amber label  
- `daysUntilDue 3–7` → sea glass label
- `> 7` → gray date label, no border accent

**"Send update" button:** Appears on collapsed row when task has an account AND is within 5 days or overdue AND no update sent today. Button color matches urgency (danger/warn). Click → expands card + opens draft.

**AI update draft logic:**
- Overdue: apologetic, "within 1–2 business days"
- 1–3 days: proactive heads-up, "targeting [date]"
- On track: reassurance, "everything on track"
- Blocked internally: never reveal specifics, says "still coordinating a few internal steps"

**"Send in original thread"** when task has a `linkedThread` key — sends reply in the Outlook thread via existing `/api/reply` endpoint.

**Table view:** Shows Task / Account / Type / Urgency (dot + label) / Due. Toggled via icon buttons in header.

**Nudge bar:** If any tasks are within 5 days or overdue, shows amber bar at top of page with count and prompt.

**Quick add:** "+" row at bottom of each account group. Inline input → creates task linked to that account on Enter.

---

### 3.6 Accounts (`/accounts`) — Enhanced

**Same two-pane layout.** Add to existing:

**Account detail header:** Add "Link emails" and "Add task" buttons (right side of header row).

**Tab additions:**
- **Emails tab:** Shows `InboxThread` records where `accountSlug` matches this account. Same row design as inbox thread list (mini version). "Unmapped? Link more →" CTA at bottom.
- **Contacts tab:** Uses the relationship health row component (see §3.8).

**Account list sidebar:** Add "Link emails" shortcut action on hover of each account row.

---

### 3.7 Meetings (`/meetings`) — Reskin only

Existing functionality, visual reskin:
- "Synced from vault · just now" = sea glass check chip
- "Pull from Granola" = outline button
- Filter tabs (All / Customers / Series / Month) = pill buttons, sea glass active
- "Jump back in" = horizontal card scroll, category label in account color
- Stats panel = right rail with bold numbers in sea glass
- Month-grouped list = clean rows with date / category chip / title / "Open →"
- Meeting → Task pipeline: action items from a meeting should surface in Tasks with `fromMeeting: true` and a `Video` icon

---

### 3.8 Contacts (`/contacts`) — Rebuilt as Relationship Health

**Not a directory — a relationship health view.**

**Layout:** Main content + 280px right rail

**Main content:**
- Search bar: "Search people across all accounts…"
- "Needs attention" section (if any): people with pending reply or last email >14 days
- By account sections: account name header + `PersonRow` for each mapped contact

**PersonRow:**
```
[avatar] [Name]              [awaiting reply] or [gone quiet] badge    [Xd ago]
         [Role · Company]                                               [X tasks]
```
- `pendingReply` → danger "awaiting reply" badge
- `lastEmail > 14` → amber "gone quiet" badge
- Clickable → links to contact profile in their account

**Right rail:**
- "Primary contacts by account" — one row per account: color dot + account name + primary contact name + last touch date + reply badge if pending
- Info callout: "Full contact profiles, email history, and tasks live inside each Account. This view is relationship health at a glance."

---

### 3.9 Ask (`/ask`) — Reskin + persist

- Existing Q&A functionality
- Add: floating Ask bar also appears on Dashboard (see §3.1)
- Chat history should persist in session
- Empty state: 4 example prompts in 2×2 grid
- AI response: shows source attribution (which account/meeting/task it drew from)
- Consider: keyboard shortcut (⌘K) to focus Ask from anywhere

---

### 3.10 Library (`/library`) — Reskin + category filter

- Upload button top-right
- Category filter chips: All / ISO / Drawing / PCN / Quote / Spec / Biocomp
- Document card: category chip + filename + source + date + description + × remove
- Show "Used in X Ask responses" if document was referenced by brain
- Auto-suggest category on upload based on filename

---

### 3.11 Quote (`/quote`) — Reskin

- Catalog search as primary (not buried in accordion)
- "Recent quotes" above the fold, not at bottom — show last 3 with "clone" action
- Live PDF preview panel (right side, updates on form change)
- Validation errors shown inline per field, not in a separate list
- "New quote" = primary button; "Save quote" = outline

---

### 3.12 Branding (`/branding`) — Reskin

- Kit list left (180px)
- Editor center
- **Live export preview right** — updates in real-time as colors change
- Preview uses actual recent meeting content, not placeholder text
- Color pickers inline with usage note ("Primary → eyebrow/chips/borders")
- Paper background selector as pill buttons

---

### 3.13 Activity (`/notifications`) — Reskin + make actionable

**Route fix:** The nav item points to `/notifications` but the label says "Activity". Either add a redirect or rename the route to `/activity`.

- Each notification card has a **primary action button** right on the card: "Reply", "Open thread", "Mark done", "View brief"
- Click-to-read (unread dot clears)
- Type badges: `new_email` (sea glass), `brief` (amber), `due_today` (danger)
- Consider: move to a bell icon dropdown in the nav header for quick access; keep the full `/activity` page for history

---

### 3.14 Settings (`/settings`) — Reskin + voice preview

- Voice config cards: greeting, sign-off, formality toggle, length toggle, tone textarea
- "Suggest my voice" = AI reads sent mail and drafts profile (already implemented)
- **Add: voice preview button** — shows a sample AI-drafted email using current settings
- **Add: per-workstream voice** — Merit voice vs personal voice may differ
- Save button = sea glass primary, pinned bottom-right

---

## 4. Component Library

### 4.1 Chip

```tsx
// Usage: <Chip label="Quote" color={T.sg} bg={T.sgSoft} bold />
className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
// bold variant: font-bold
```

### 4.2 Button variants

```tsx
// Primary (sea glass)
"inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] bg-sg text-[#0B1117] text-sm font-bold transition-all"
"hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(54,179,166,0.28)]"

// Outline
"inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] border border-border-md bg-transparent text-dim text-sm font-medium"
"hover:border-sg hover:text-sg"

// Ghost
"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-transparent text-muted text-sm"
"hover:bg-raised"
```

### 4.3 Input

```tsx
"w-full px-3.5 py-2 rounded-[9px] border border-border-md bg-[rgba(255,255,255,0.04)] text-fg text-sm placeholder:text-muted outline-none focus:ring-2 focus:ring-sg/40 transition-colors"
// Light mode: bg-[rgba(11,17,23,0.04)]
```

### 4.4 Card

```tsx
"rounded-[12px] border border-border bg-card"
// elevated: shadow-[0_2px_14px_rgba(54,179,166,0.06)]
```

### 4.5 Eyebrow label

```tsx
"text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted"
// font-family: Sohne or Plus Jakarta Sans
```

### 4.6 Urgency indicator (tasks)

```tsx
function urgencyStyles(daysUntilDue: number) {
  if (daysUntilDue < 0)  return { color: 'var(--danger)',  border: 'border-l-[3px] border-l-danger' }
  if (daysUntilDue <= 2) return { color: 'var(--warn)',    border: 'border-l-[3px] border-l-warn' }
  if (daysUntilDue <= 7) return { color: 'var(--sg)',      border: 'border-l-[1px] border-l-border' }
  return { color: 'var(--text-muted)', border: 'border-l-[1px] border-l-border' }
}
```

---

## 5. Interaction Patterns

### 5.1 Auto-collapse

| Trigger | Effect |
|---|---|
| Click nav item | Nav sidebar → 52px icon rail |
| Open thread detail | Folder sidebar → 28px strip |
| Close thread (back button) | Folder sidebar → 186px restored |
| Nav `‹ ›` button | Manual toggle nav |
| Folder "Hide" button | Manual toggle folder |

All transitions: `transition: width 0.22s ease, padding 0.22s ease`

### 5.2 Hover reveal (inbox rows)

On row hover: show checkbox (opacity 0 → 1) + 4 quick-action icon buttons (opacity 0 → 1). Transition `0.12s`. Clicking checkbox enters multi-select mode (shows bulk action bar).

### 5.3 Multi-select (inbox)

When `checkedKeys.size > 0`, show bulk action bar below the inbox header:
- "X selected" · Mark reviewed · Archive · Assign pathway (dropdown) · Clear

### 5.4 Light/Dark toggle

- Store in `localStorage` key `"theme"` (`"light"` | `"dark"`)
- Toggle `.light` class on `<html>` element
- Swap logo mark: dark bg → `mark-light.png`, light bg → `mark-dark.png`
- Smooth: add `transition: background 0.2s, color 0.2s` to root `<body>`

### 5.5 Snooze options

Four quick options: Tomorrow morning (+16h) / This Friday (+3d) / Next Monday (+5d) / In two weeks (+14d).  
Render as a small popover positioned below the snooze icon button.

---

## 6. New API Surfaces Needed

The following UI features require new or extended API endpoints:

| Feature | Endpoint needed |
|---|---|
| Customer update email from task | Reuse `POST /api/reply` with `linkedThread` key |
| Calendar events for day planner | `GET /api/calendar/today` → Microsoft Graph `/me/calendarView` |
| Task internal checklist | Add `checklist` JSON column to tasks table |
| Task `linkedThread` | Add `inbox_thread_key` FK to tasks table |
| Task `lastCustomerUpdate` | Add `last_customer_update` date to tasks table |
| Task `fromMeeting` flag | Already extractable from Granola task source |
| Contacts last-email date | Derive from inbox threads by sender domain/email |
| Cross-customer playbook | `GET /api/brain/playbook?topic=quality-pcn&account=X` → Opus synthesis |
| Build Your Day blocks | `GET/POST /api/day-plan` → persist scheduled blocks (date + taskId + start + duration) |

---

## 7. Implementation Priority

### Phase 1 — Visual reskin (no schema changes)
1. Update `globals.css` with new CSS custom properties (light + dark tokens)
2. Wire Söhne font via `@font-face`
3. Update `Nav.tsx` — two-tier structure, auto-collapse, logo swap, theme toggle
4. Update `InboxList.tsx` — chip hierarchy, hover reveal, state dots
5. Update all page headers — Sohne display font, correct spacing
6. Light/dark toggle with `localStorage` persistence

### Phase 2 — New views (no schema changes)
7. Dashboard page (`/dashboard`, set as default route)
8. Today page — tabs + Focus queue + Build Your Day planner (mock calendar until Graph endpoint)
9. Tasks page — grouped view, enhanced card with urgency
10. Contacts page — relationship health view

### Phase 3 — Enhanced thread detail
11. Cross-customer playbook panel (query existing brain)
12. Action composer in thread detail (create task / link task)
13. Participant map
14. Attach-to-reply in ReplyBox

### Phase 4 — Schema + new APIs
15. Add `checklist`, `linked_thread_key`, `last_customer_update` to tasks table
16. Calendar sync endpoint (Microsoft Graph)
17. Day plan persistence endpoint
18. Contact last-email-date derivation

---

## 8. Files to Touch

```
app/layout.tsx                  → set default route to /dashboard, add theme class logic
app/globals.css                 → all CSS custom properties, font-face
app/page.tsx                    → redirect to /dashboard
app/dashboard/page.tsx          → NEW: dashboard view
app/today/page.tsx              → add Build Your Day tab
app/tasks/page.tsx              → enhanced task view
app/contacts/page.tsx           → relationship health view
app/accounts/[slug]/page.tsx    → add Emails tab, Contacts tab, Link emails btn
app/settings/page.tsx           → add voice preview
app/notifications/page.tsx      → actionable cards, route alias

components/Nav.tsx              → two-tier, collapse, theme toggle, logo swap
components/InboxList.tsx        → chip hierarchy, hover reveal, multi-select
components/InboxItem.tsx        → update to new card style
components/ThreadDetail.tsx     → new: playbook panel, action composer, participant map
components/TaskCard.tsx         → NEW: enhanced task card with checklist + update
components/DayPlanner.tsx       → NEW: Build Your Day timeline
components/DashboardView.tsx    → NEW: dashboard layout
components/ContactsView.tsx     → NEW: relationship health
components/ReplyBox.tsx         → add attach-to-reply
```

---

## 9. Screenshot Reference

Take screenshots from the Figma Make prototype canvas for these views (use as visual reference alongside this doc):

- [ ] Dashboard — full view
- [ ] Inbox — thread list with hover actions visible
- [ ] Inbox — thread detail open (3-pane), playbook panel expanded
- [ ] Today — Focus queue tab
- [ ] Today — Build Your Day tab with calendar + task blocks
- [ ] Tasks — grouped view, one card expanded (showing checklist + customer update draft)
- [ ] Tasks — "Send update" button visible on collapsed row
- [ ] Accounts — detail view with Emails tab active
- [ ] Contacts — relationship health view
- [ ] Settings — voice config
- [ ] Sidebar — collapsed state (52px icon rail)
- [ ] Light mode — any view showing the ivory/white theme

---

*End of handoff. Questions about specific interactions or edge cases should reference the prototype session conversation history.*
