# Figma UX/UI fixes (Jordan, 2026-07-07) — implementation spec

Source: Jordan's Figma review. Implement in full; check off as shipped.

## FIX 1 — Inbox: panel-based layout (slide transition)
Thread detail slides in as a panel WITHIN /inbox (not a separate page).
- No selection: [FolderSidebar 186px] [ThreadList flex-1]
- Selected: [FolderSidebar 28px] [ThreadList 340px fixed] [ThreadDetail flex-1]
- Selection is state (selectedKey), not router.push. /inbox/[key] remains for
  direct links but redirects to /inbox?selected=[key].
- Slide: detail wrapper transition transform .25s cubic-bezier(0.22,1,0.36,1),
  opacity .2s; mount translateX(20px)/opacity 0 -> 0/1. List width .22s ease;
  sidebar width .22s ease.

## FIX 2 — Brain panel integration
- Thread open + brain open: Nav(52) + Folder(28) + List(280) + Detail(flex-1
  min 320) + Brain(300).
- Brain header: "Ask Brain" + new chat + collapse toggle (‹). Collapsed = 36px
  icon strip. Persist 'brain-open' in localStorage.
- No thread: Folder(186) + List(flex-1) + Brain(300).
- Messages: user right-aligned bg-raised; AI left-aligned sea-glass soft bg +
  Sparkles icon. Input pinned bottom: rounded input + sea-glass Ask button.

## FIX 3 — Thread detail (in-panel) structure, top to bottom
1. Sticky header: back, subject (font-display bold), Forward/Flag/Archive,
   count · who.
2. Participant strip, one compact row: External [red dots], Internal [teal].
3. AI Summary card (sea-glass soft, collapsible, "✦ AI SUMMARY").
4. Triage bar: pathway pills (active = filled pathway color; inactive ghost)
   + "Mark reviewed ->".
5. Unmapped sender: ONE inline muted line under triage bar ("⚠ Sender not
   linked to an account. Link account ->"), NOT a card.
6. Suggested attachments: collapsible chip row; chip click attaches to reply.
7. Messages: header avatar/name -> to · External|Internal badge · time; body
   truncated to 3 lines with "Show more"; signature + quoted text behind one
   "Signature & quoted text" toggle.
8. Reply composer pinned at bottom, contained card: "Reply to [name]" +
   collapse; "✦ Draft with AI, describe tone or context…" italic input;
   textarea; amber "X external recipients, review before sending" when
   external; [Draft with AI] outline + [Review & send] primary; "Send to all"
   is a toggle.

## FIX 4 — Inbox row chip hierarchy (strict)
1. High: bold, danger color + danger-soft bg. 2. Pathway: category color/soft
bg. 3. Account: customerHue color + 15% bg. 4. Status (Reviewed/Replied):
sea-glass/muted, smaller. 5. Attachment: muted, smallest. All chips
rounded-full text-[10px] font-medium px-2 py-0.5. Drop "Needs review" chip
when the thread already has a pathway.

## FIX 5 — Unresolved sender de-emphasis
Thread detail: the inline line from FIX 3.5. List row: dashed "?" avatar +
small dashed "Link account" chip only; no card.

## FIX 6 — Nav structure (restore DESIGN_HANDOFF §2.2)
Primary: Dashboard · Inbox (count badge) · Accounts · Meetings. Separator +
TOOLS eyebrow. Secondary: Today · Ask · Tasks · Contacts · Quote · Library.
Bottom: Branding · Activity (unread badge) · Settings · Theme toggle. Theme
toggle label flips (dark -> "Light mode"). Brain toggle reachable from nav or
floating button, not only inside the inbox.
