import React from "react";
import type { MeetingNote, ActionItem, Roster, Priority } from "@/lib/vault/types";
import type { Series } from "@/lib/vault/series";
import type { SeriesView } from "@/lib/vault";
import { classifyName } from "@/lib/vault";
import { personNameMatches } from "@/lib/vault/people";
import { needsDueDate } from "@/lib/dates";
import { initials } from "@/lib/customerHues";
import { toTaskView, buildAccountLookup, type TaskView } from "@/lib/taskView";
import { type BrandKit, brandToCssVars, paperInk } from "@/lib/branding";
import type { Account } from "@/lib/vault/types";

// Phase 3 PART A. ONE themed meeting/series template, shared by:
//   - the in-app /meetings detail (React, interactive, APP brand)
//   - the Copy-for-email HTML (renderToStaticMarkup, CLIENT brand)
//   - the Download PDF (same HTML, headless/print render in step 2)
// so the three never drift. The document is built once into a DocModel, then
// rendered by <MeetingDoc> using a DocTheme token set. Theming is CSS-vars only
// (brandToCssVars); export tokens fall back to literal hex so dumb email clients
// still color correctly. House style: no em dashes in rendered copy.

/* =============================== content model ============================== */

export type PersonKind = "internal" | "customer";

export interface DocPerson {
  name: string;
  kind?: PersonKind;
  count?: number; // rolling attendance (series)
}

export interface DocAction {
  key: string;
  done: boolean;
  isJordans: boolean;
  owner?: string;
  ownerKind?: PersonKind;
  text: string;
  due?: string;
  flag: boolean; // needs a due date (missing / TBD / vague)
  vague?: string | null; // the vague due text to echo on the flag
  priority?: Priority;
  customer?: string | null; // account label for Jordan's items
  task?: TaskView; // present for Jordan's items, fed to the interactive slot
}

export interface DocClosedAction {
  text: string;
  owner?: string;
  date?: string;
}

export type DocSectionVariant = "decision" | "number" | "watch" | "full";

export interface DocSection {
  heading: string;
  variant: DocSectionVariant;
  items?: string[]; // list variants
  prose?: { heading: string | null; text: string }[]; // full-notes variant
}

export interface DocSession {
  heading: string;
  text: string;
  notePath: string | null;
}

export interface DocModel {
  kind: "meeting" | "series";
  eyebrow: string;
  title: string;
  subtitle?: string;
  accentDot?: boolean; // series color dot beside the title
  meta: { label: string; value: string }[];
  about: { name: string; href?: string }[];
  teams: string[];
  people: DocPerson[];
  stats: { value: string | number; label: string }[];
  tldr?: { label: string; text: string };
  openActions: DocAction[];
  closedActions: DocClosedAction[];
  sections: DocSection[];
  sessions: DocSession[]; // series only
  footerLine: string;
  filenameBase: string;
}

/* ================================ theming ================================== */

// One token set the component reads. In-app tokens point at the app's own CSS
// vars (so dark mode + the palette selector keep working); export tokens use the
// brand vars with literal hex fallbacks (email-safe).
export interface DocTheme {
  primary: string;
  secondary: string;
  accent: string;
  primarySoft: string;
  accentSoft: string;
  border: string;
  paper: string;
  fg: string;
  ink2: string;
  muted: string;
  surface2: string;
  line: string;
  line2: string;
  ok: string;
  warm: string;
  warmSoft: string;
  dueSoft: string;
  dueInk: string;
  logoUrl: string | null;
  fontFamily: string;
}

export const EXPORT_FONT =
  "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

// ONE theme, used by all three surfaces (in-app, email, PDF) so the branding is
// consistent and sticky. Brand colors are emitted as LITERAL hex, never
// `var(--brand-x, ...)`: Outlook's renderer drops CSS custom properties on
// paste/save, so a var()-based border or color renders with no color at all.
// v[name] is already the resolved literal for the brand. The neutral inks
// derive from the paper so the document reads well on white, cream, or dark.
export function docTheme(brand: BrandKit): DocTheme {
  const v = brandToCssVars(brand);
  const tok = (name: keyof typeof v) => v[name];
  const paper = brand.paper || "#ffffff";
  const ink = paperInk(paper);
  return {
    primary: tok("--brand-primary"),
    secondary: tok("--brand-secondary"),
    accent: tok("--brand-accent"),
    primarySoft: tok("--brand-primary-soft"),
    accentSoft: tok("--brand-accent-soft"),
    border: tok("--brand-border"),
    paper,
    fg: ink.fg,
    ink2: ink.ink2,
    muted: ink.muted,
    surface2: ink.surface2,
    line: ink.line,
    line2: ink.line2,
    ok: ink.ok,
    warm: ink.warm,
    warmSoft: ink.warmSoft,
    dueSoft: ink.dueSoft,
    dueInk: ink.dueInk,
    logoUrl: brand.logoUrl,
    fontFamily: EXPORT_FONT,
  };
}

// Scoped CSS variable overrides for the in-app paper card. App components
// rendered inside the branded document (PersonLink, TaskRow, .chip) style
// themselves with the page theme's variables; in dark mode that puts
// near-white ink on white paper. Re-pointing both variable families (hex vars
// for inline styles, --c-* RGB triples for Tailwind tokens) at the document
// theme keeps every descendant readable on the paper, in either app theme.
export function paperCssVars(t: DocTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--canvas": t.paper,
    "--surface": t.paper,
    "--surface-2": t.surface2,
    "--hi": t.surface2,
    "--ink": t.fg,
    "--ink-2": t.ink2,
    "--ink-3": t.muted,
    "--muted": t.muted,
    "--line": t.line,
    "--line-2": t.line2,
    "--accent": t.accent,
    "--accent-2": t.accent,
    "--accent-soft": t.accentSoft,
    "--warm": t.warm,
    "--warm-soft": t.warmSoft,
    "--due": t.dueInk,
    "--due-soft": t.dueSoft,
  };
  const triples: Array<[string, string]> = [
    ["--c-page", t.paper],
    ["--c-surface", t.paper],
    ["--c-surface-2", t.surface2],
    ["--c-hi", t.surface2],
    ["--c-fg", t.fg],
    ["--c-ink-2", t.ink2],
    ["--c-muted", t.muted],
    ["--c-border", t.line],
    ["--c-line-2", t.line2],
    ["--c-accent", t.accent],
    ["--c-accent-soft", t.accentSoft],
    ["--c-warm", t.warm],
    ["--c-warm-soft", t.warmSoft],
    ["--c-due", t.dueInk],
    ["--c-due-soft", t.dueSoft],
    ["--c-ok", t.ok],
  ];
  for (const [name, hex] of triples) {
    const rgb = hexTriple(hex);
    if (rgb) vars[name] = rgb;
  }
  return vars;
}

// "#rrggbb" -> "r g b" (the format Tailwind's rgb(var(...)) tokens expect).
// Non-hex values (rgba tints) are skipped; those vars keep the page theme.
function hexTriple(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/* ================================= mappers ================================= */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function longDate(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}, ${m[1]}`;
}

// House style: strip em/en dashes from any rendered copy.
export function clean(s: string): string {
  return (s ?? "").replace(/\s*[—–]\s*/g, " - ");
}

function bulletsOf(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

// Roster classification -> chip side. Jordan is always internal.
function personKind(roster: Roster, name: string): PersonKind | undefined {
  if (personNameMatches(name, "Jordan Francis")) return "internal";
  const c = classifyName(roster, name)?.classification;
  return c === "merit" ? "internal" : c === "customer" ? "customer" : undefined;
}

export interface DocContext {
  roster: Roster;
  accounts: Pick<Account, "name" | "slug" | "path">[];
  eyebrowLead: string; // brand name (export) or account/app label (in-app)
  accountHref?: (name: string) => string | undefined; // About links (in-app)
}

const SECTION_VARIANTS: { heading: string; variant: DocSectionVariant }[] = [
  { heading: "Key Decisions", variant: "decision" },
  { heading: "Numbers That Matter", variant: "number" },
  { heading: "Watch-Outs", variant: "watch" },
];

export function meetingToDoc(note: MeetingNote, ctx: DocContext): DocModel {
  const lookup = buildAccountLookup(ctx.accounts);

  const meta: { label: string; value: string }[] = [];
  if (note.customer?.display) meta.push({ label: "Account", value: note.customer.display });
  if (note.topic) meta.push({ label: "Topic", value: note.topic });

  // Owners count as attendees; fold short owner names into matching attendees.
  const ownerNames = Array.from(
    new Set(
      note.actionItems
        .map((ai) => ai.owner ?? (ai.isJordans ? "Jordan Francis" : ""))
        .filter(Boolean),
    ),
  );
  const extraOwners = ownerNames.filter(
    (o) => !note.attendees.some((a) => personNameMatches(a, o)),
  );
  const people: DocPerson[] = [...note.attendees, ...extraOwners].map((name) => ({
    name,
    kind: personKind(ctx.roster, name),
  }));

  const openActions: DocAction[] = [];
  const closedActions: DocClosedAction[] = [];
  note.actionItems.forEach((ai, i) => {
    if (ai.done) {
      closedActions.push({ text: ai.text, owner: ai.owner });
      return;
    }
    openActions.push(mapAction(ai, i, ctx.roster, lookup));
  });

  const sections: DocSection[] = [];
  let decisionCount = 0;
  for (const s of SECTION_VARIANTS) {
    if (note.sections[s.heading]) {
      const items = bulletsOf(note.sections[s.heading]);
      if (s.variant === "decision") decisionCount = items.length;
      sections.push({ heading: s.heading, variant: s.variant, items });
    }
  }
  if (note.sections["Full Notes"]) {
    sections.push({
      heading: "Full Notes",
      variant: "full",
      prose: splitProse(note.sections["Full Notes"]),
    });
  }

  const tldr = note.sections["TL;DR"]
    ? { label: "TL;DR", text: note.sections["TL;DR"] }
    : undefined;

  const stats = [
    { value: people.length, label: "People" },
    { value: openActions.length, label: "Open items" },
    { value: closedActions.length, label: "Closed" },
    { value: decisionCount, label: "Decisions" },
  ];

  const about = (note.relatedAccounts ?? []).map((name) => ({
    name,
    href: ctx.accountHref?.(name),
  }));

  const base = note.path.split("/").pop()?.replace(/\.md$/, "") || note.title;
  return {
    kind: "meeting",
    eyebrow: `${ctx.eyebrowLead} · MEETING NOTES`,
    title: note.title,
    subtitle: longDate(note.date),
    meta,
    about,
    teams: note.teams ?? [],
    people,
    stats,
    tldr,
    openActions,
    closedActions,
    sections,
    sessions: [],
    footerLine: `${ctx.eyebrowLead} · Confidential`,
    filenameBase: base,
  };
}

export function seriesToDoc(
  series: Series,
  view: SeriesView,
  ctx: DocContext,
): DocModel {
  const lookup = buildAccountLookup(ctx.accounts);

  const people: DocPerson[] = view.stats.attendance.map((a) => ({
    name: a.name,
    kind: personKind(ctx.roster, a.name),
    count: a.count,
  }));

  const openActions: DocAction[] = view.outstanding.map((t, i) => {
    const tv = toTaskView(t, lookup);
    return {
      key: `${t.sourceFile}:${t.sourceLine}:${i}`,
      done: false,
      isJordans: true,
      owner: undefined,
      text: tv.title,
      due: tv.due,
      flag: needsDueDate(tv.due),
      vague: needsDueDate(tv.due) && tv.due && tv.due.toLowerCase() !== "tbd" ? tv.due : null,
      priority: tv.priority,
      customer: tv.customer && tv.customer !== "internal" ? tv.customer : null,
      task: tv,
    };
  });

  const closedActions: DocClosedAction[] = view.closed.map((c) => ({
    text: c.text,
    date: c.date,
  }));

  const stats = [
    { value: view.stats.sessions, label: "Sessions" },
    { value: view.stats.actionsOpen, label: "Items open" },
    { value: view.stats.actionsClosed, label: "Items closed" },
    { value: view.stats.decisions, label: "Decisions" },
    { value: view.stats.latestDate ? longDate(view.stats.latestDate) : "—", label: "Latest" },
  ];

  return {
    kind: "series",
    eyebrow: `${ctx.eyebrowLead} · ROLLING NOTES`,
    title: series.name,
    subtitle: `Rolling notes · ${series.cadence ?? "no set cadence"}`,
    accentDot: true,
    meta: [],
    about: [],
    teams: [],
    people,
    stats,
    tldr: { label: "Rolling TL;DR", text: series.currentState || "(none yet)" },
    openActions,
    closedActions,
    sections: [],
    sessions: view.sessions,
    footerLine: `${ctx.eyebrowLead} · Confidential`,
    filenameBase: series.name,
  };
}

function mapAction(
  ai: ActionItem,
  i: number,
  roster: Roster,
  lookup: Map<string, { slug: string; name: string }>,
): DocAction {
  const flag = needsDueDate(ai.due);
  const tv = ai.isJordans && ai.task ? toTaskView(ai.task, lookup) : undefined;
  const customer = tv && tv.customer && tv.customer !== "internal" ? tv.customer : null;
  return {
    key: `${ai.sourceFile}:${ai.sourceLine}:${i}`,
    done: ai.done,
    isJordans: ai.isJordans,
    owner: ai.owner,
    ownerKind: ai.owner ? personKind(roster, ai.owner) : undefined,
    text: ai.text,
    due: ai.due,
    flag,
    vague: flag && ai.due && ai.due.toLowerCase() !== "tbd" ? ai.due : null,
    priority: tv?.priority,
    customer,
    task: tv,
  };
}

function splitProse(body: string): { heading: string | null; text: string }[] {
  const blocks: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; text: string } | null = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      current = { heading: h[1].trim(), text: "" };
      blocks.push(current);
    } else {
      if (!current) {
        current = { heading: null, text: "" };
        blocks.push(current);
      }
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  return blocks;
}

/* ============================== the template =============================== */

export interface MeetingDocSlots {
  // In-app interactive overrides. Absent -> static markup (exports).
  renderPerson?: (p: DocPerson) => React.ReactNode;
  renderJordanAction?: (a: DocAction) => React.ReactNode;
  sessionHref?: (notePath: string) => string;
  renderAbout?: (a: { name: string; href?: string }) => React.ReactNode;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

export function MeetingDoc({
  model,
  theme,
  slots = {},
  expandClosed = false,
}: {
  model: DocModel;
  theme: DocTheme;
  slots?: MeetingDocSlots;
  expandClosed?: boolean; // print/PDF: render closed actions expanded
}) {
  const t = theme;
  // One compact byline instead of stacked rows (date · account · topic), which
  // wasted vertical space in the email copy.
  const headerLine = [model.subtitle, ...model.meta.map((m) => m.value)]
    .map((s) => clean(s ?? ""))
    .filter(Boolean)
    .join("  ·  ");
  return (
    <div style={{ fontFamily: t.fontFamily, color: t.fg }}>
      {t.logoUrl && (
        <div style={{ marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.logoUrl}
            alt=""
            style={{ height: 36, width: "auto", maxWidth: 220, objectFit: "contain" }}
          />
        </div>
      )}
      <div style={{ ...EYEBROW, color: t.primary }}>{clean(model.eyebrow)}</div>

      <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 700, margin: "6px 0 2px", color: t.secondary }}>
        {model.accentDot && <span style={{ color: t.primary }}>&#9679;&nbsp;</span>}
        {clean(model.title)}
      </h1>
      {headerLine && (
        <div style={{ color: t.muted, fontSize: 13 }}>{headerLine}</div>
      )}

      {(model.about.length > 0 || model.teams.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {model.about.length > 0 && (
            <ChipRow label="About" theme={t}>
              {model.about.map((a) =>
                slots.renderAbout ? (
                  <React.Fragment key={a.name}>{slots.renderAbout(a)}</React.Fragment>
                ) : (
                  <Chip key={a.name} theme={t}>{clean(a.name)}</Chip>
                ),
              )}
            </ChipRow>
          )}
          {model.teams.length > 0 && (
            <ChipRow label="Teams" theme={t}>
              {model.teams.map((tm) => (
                <Chip key={tm} theme={t}>{clean(tm)}</Chip>
              ))}
            </ChipRow>
          )}
        </div>
      )}

      {model.people.length > 0 && (
        <Section theme={t} label={model.kind === "series" ? "People involved" : "Attendees"}>
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 2 }}>
            {model.people.map((p, i) => (
              <React.Fragment key={p.name}>
                {i > 0 && "\u00A0\u00A0\u00A0"}
                {slots.renderPerson ? slots.renderPerson(p) : <PersonChip person={p} theme={t} />}
              </React.Fragment>
            ))}
          </div>
        </Section>
      )}

      {model.stats.length > 0 && <StatRow stats={model.stats} theme={t} />}

      {model.tldr && (
        <Section theme={t} label={model.tldr.label}>
          <div
            style={{
              borderRadius: 14,
              padding: "16px 18px",
              background: t.primarySoft,
              borderLeft: `4px solid ${t.primary}`,
            }}
          >
            <Prose text={model.tldr.text} theme={t} />
          </div>
        </Section>
      )}

      <Section theme={t} label={`Action items${model.openActions.length ? ` · ${model.openActions.length}` : ""}`}>
        {model.openActions.length === 0 ? (
          <div style={{ fontSize: 14, color: t.muted }}>Nothing open.</div>
        ) : (
          <div>
            {model.openActions.map((a) => (
              <div key={a.key} style={{ marginBottom: 8 }}>
                {a.isJordans && a.task && slots.renderJordanAction
                  ? slots.renderJordanAction(a)
                  : <ActionCard action={a} theme={t} />}
              </div>
            ))}
          </div>
        )}
        {model.closedActions.length > 0 && (
          <details style={{ marginTop: 10 }} open={expandClosed || undefined}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: t.muted }}>
              {model.closedActions.length} closed
            </summary>
            <div style={{ marginTop: 8 }}>
              {model.closedActions.map((c, i) => (
                <div key={i} style={{ marginBottom: 4, fontSize: 14, color: t.muted }}>
                  <span style={{ color: t.ok }}>&#9745;</span>
                  {"\u00A0"}
                  <span style={{ textDecoration: "line-through" }}>
                    {c.owner ? `${clean(c.owner)}: ` : ""}
                    {clean(c.text)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </Section>

      {model.sections.map((s, i) => (
        <SectionBlock key={s.heading} index={i + 1} section={s} theme={t} />
      ))}

      {model.sessions.length > 0 && (
        <Section theme={t} label={`Meetings in this series · ${model.sessions.length}`}>
          <div>
            {model.sessions.map((s, i) => {
              const href = s.notePath ? slots.sessionHref?.(s.notePath) : undefined;
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 8,
                    border: `1px solid ${t.line}`,
                    borderLeft: `3px solid ${t.primary}`,
                    borderRadius: 12,
                    padding: 14,
                    background: t.surface2,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.fg }}>
                    {clean(s.heading)}
                    {href && (
                      <>
                        {"\u00A0\u00A0"}
                        <a href={href} style={{ fontSize: 12, fontWeight: 600, color: t.primary, textDecoration: "none" }}>
                          Open note &rarr;
                        </a>
                      </>
                    )}
                  </div>
                  {s.text.trim() && (
                    <div style={{ marginTop: 6 }}>
                      <Prose text={s.text} theme={t} muted />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <footer
        style={{
          marginTop: 30,
          borderTop: `2px solid ${t.primary}`,
          paddingTop: 12,
          fontSize: 12,
          color: t.muted,
        }}
      >
        <span>{clean(model.footerLine)}</span>
        {t.logoUrl ? (
          <div style={{ marginTop: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.logoUrl} alt="" style={{ height: 22, width: "auto" }} />
          </div>
        ) : (
          <span>&nbsp;&nbsp;·&nbsp;&nbsp;Source · Hammer Claw Vault</span>
        )}
      </footer>
    </div>
  );
}

/* ----------------------------- sub-components ------------------------------ */

function Section({
  label,
  theme,
  children,
}: {
  label: string;
  theme: DocTheme;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...EYEBROW, color: theme.muted, marginBottom: 10 }}>{clean(label)}</div>
      {children}
    </div>
  );
}

function ChipRow({
  label,
  theme,
  children,
}: {
  label: string;
  theme: DocTheme;
  children: React.ReactNode;
}) {
  // Outlook-safe: plain block, label + chips inline, separated by explicit nbsp.
  const arr = React.Children.toArray(children);
  return (
    <div style={{ fontSize: 13, color: theme.ink2, marginBottom: 4, lineHeight: 1.9 }}>
      <span style={{ fontWeight: 600, color: theme.fg }}>{label}:</span>
      {arr.map((c, i) => (
        <React.Fragment key={i}>
          {"\u00A0\u00A0"}
          {c}
        </React.Fragment>
      ))}
    </div>
  );
}

function Chip({ theme, children }: { theme: DocTheme; children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "2px 9px",
        borderRadius: 999,
        border: `1px solid ${theme.line2}`,
        fontSize: 12.5,
        color: theme.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function PersonChip({ person, theme }: { person: DocPerson; theme: DocTheme }) {
  const isCustomer = person.kind === "customer";
  const bg = isCustomer ? theme.accentSoft : person.kind === "internal" ? theme.primarySoft : theme.surface2;
  const fg = isCustomer ? theme.accent : person.kind === "internal" ? theme.primary : theme.ink2;
  // Outlook-safe: no inline-flex/gap (dropped on paste). Initials badge is a
  // plain inline span; an explicit &nbsp; separates it from the name.
  return (
    <span style={{ fontSize: 12.5, color: theme.fg, whiteSpace: "nowrap" }}>
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 6,
          background: bg,
          color: fg,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {initials(person.name)}
      </span>
      {"\u00A0"}
      <span>{clean(person.name)}</span>
      {person.count != null && person.count > 0 && (
        <span style={{ color: theme.muted, fontSize: 11, fontWeight: 600 }}>
          {"\u00A0"}
          {person.count}&times;
        </span>
      )}
    </span>
  );
}

// Stat row as a real <table> (not flex/grid): Outlook strips display:flex/grid
// on paste and collapses the row to stacked full-width blocks. A table with one
// <td> per stat (plus thin spacer <td>s) survives. Card styling stays on the td.
function StatRow({
  stats,
  theme,
}: {
  stats: { value: string | number; label: string }[];
  theme: DocTheme;
}) {
  const pct = Math.floor(100 / stats.length);
  return (
    <table
      style={{
        width: "100%",
        marginTop: 18,
        borderCollapse: "separate",
        borderSpacing: 0,
        tableLayout: "fixed",
      }}
    >
      <tbody>
        <tr>
          {stats.map((s, i) => {
            const numeric =
              typeof s.value === "number" || /^\d+$/.test(String(s.value));
            return (
              <React.Fragment key={s.label}>
                {i > 0 && <td style={{ width: 10 }} />}
                <td
                  style={{
                    width: `${pct}%`,
                    textAlign: "center",
                    verticalAlign: "middle",
                    padding: 12,
                    border: `1px solid ${theme.line}`,
                    borderRadius: 14,
                    background: theme.surface2,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      lineHeight: 1.1,
                      color: theme.accent,
                      fontSize: numeric ? 24 : 15,
                      wordBreak: "break-word",
                    }}
                  >
                    {clean(String(s.value))}
                  </div>
                  <div style={{ ...EYEBROW, color: theme.muted, marginTop: 4, fontSize: 10 }}>
                    {clean(s.label)}
                  </div>
                </td>
              </React.Fragment>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

function ActionCard({ action, theme }: { action: DocAction; theme: DocTheme }) {
  const t = theme;
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 12,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${action.isJordans ? t.primary : t.line2}`,
      }}
    >
      <div>
        {/* Outlook-safe: the checkbox is a span prefix inside the SAME div as
            the text, so it does not split onto its own line. */}
        <div style={{ fontSize: 14, color: t.fg }}>
          <span style={{ color: action.done ? t.ok : t.muted }}>
            {action.done ? "☑" : "☐"}
          </span>
          {"\u00A0"}
          {action.owner && <b style={{ color: ownerColor(action.ownerKind, t) }}>{clean(action.owner)}: </b>}
          {clean(action.text)}
          {action.priority && <>{"\u00A0\u00A0"}<PriorityPill priority={action.priority} theme={t} /></>}
          {action.customer && <>{"\u00A0\u00A0"}<Chip theme={t}>{clean(action.customer)}</Chip></>}
          {!action.flag && action.due && (
            <>{"\u00A0\u00A0"}<Pill bg={t.dueSoft} fg={t.dueInk}>due {clean(action.due)}</Pill></>
          )}
          {action.flag && (
            <>{"\u00A0\u00A0"}<Pill bg={t.warmSoft} fg={t.warm}>
              &#9873; needs due date{action.vague ? ` · ${clean(action.vague)}` : ""}
            </Pill></>
          )}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: t.muted }}>
          {action.isJordans ? "Jordan" : "tracking only"}
        </div>
      </div>
    </div>
  );
}

function ownerColor(kind: PersonKind | undefined, t: DocTheme): string {
  return kind === "customer" ? t.accent : kind === "internal" ? t.primary : t.fg;
}

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "1px 8px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", med: "Med", low: "Low" };
function PriorityPill({ priority, theme }: { priority: Priority; theme: DocTheme }) {
  const color = priority === "high" ? theme.warm : priority === "med" ? theme.accent : theme.muted;
  return <Pill bg={theme.surface2} fg={color}>{PRIORITY_LABEL[priority]}</Pill>;
}

function SectionBlock({
  index,
  section,
  theme,
}: {
  index: number;
  section: DocSection;
  theme: DocTheme;
}) {
  const t = theme;
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>
          {String(index).padStart(2, "0")}
        </span>
        {"\u00A0\u00A0"}
        <span style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: t.secondary }}>
          {clean(section.heading)}
        </span>
      </div>
      {section.variant === "full" ? (
        <div>
          {(section.prose ?? []).map((b, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {b.heading && (
                <div style={{ marginBottom: 2, fontSize: 14, fontWeight: 600, color: t.fg }}>{clean(b.heading)}</div>
              )}
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: t.ink2 }}>
                {clean(b.text.trim())}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {(section.items ?? []).map((it, i) => (
            <ListItem key={i} text={it} variant={section.variant} theme={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function ListItem({
  text,
  variant,
  theme,
}: {
  text: string;
  variant: DocSectionVariant;
  theme: DocTheme;
}) {
  const t = theme;
  // Outlook-safe: no flex. Marker is an inline span with an explicit &nbsp;
  // before the text (CSS gap/margin can be dropped on paste).
  if (variant === "watch") {
    return (
      <div style={{ padding: "10px 0", fontSize: 15, color: t.fg }}>
        <span
          style={{
            padding: "0 7px",
            borderRadius: 999,
            background: t.warm,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          !
        </span>
        {"\u00A0"}
        <span>{clean(text)}</span>
      </div>
    );
  }
  if (variant === "number") {
    return (
      <div
        style={{
          padding: "10px 14px",
          marginBottom: 4,
          borderRadius: 12,
          background: t.accentSoft,
          border: `1px solid ${t.line}`,
          fontSize: 15,
          color: t.fg,
        }}
      >
        <span style={{ fontSize: 14, color: t.accent }}>&#9670;</span>
        {"\u00A0"}
        <span>{clean(text)}</span>
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 0", fontSize: 15, color: t.fg }}>
      <span style={{ color: t.primary }}>&#9670;</span>
      {"\u00A0"}
      <span style={{ fontSize: 15, color: t.fg }}>{clean(text)}</span>
    </div>
  );
}

// Lightweight prose: bullet lists + **bold** + [[wikilink]] display text.
function Prose({ text, theme, muted = false }: { text: string; theme: DocTheme; muted?: boolean }) {
  const color = muted ? theme.muted : theme.fg;
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key}`} style={{ margin: "4px 0", paddingLeft: 20 }}>
        {items.map((b, j) => (
          <li key={j} style={{ margin: "3px 0" }}>{renderInline(b, theme)}</li>
        ))}
      </ul>,
    );
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flush(String(i));
    if (!line.trim() || line.trim() === "---") return;
    blocks.push(<p key={i} style={{ margin: "4px 0" }}>{renderInline(line, theme)}</p>);
  });
  flush("end");
  if (!blocks.length) return <div style={{ fontSize: 14, color: theme.muted }}>(none yet)</div>;
  return <div style={{ fontSize: 14, lineHeight: 1.55, color }}>{blocks}</div>;
}

function renderInline(text: string, theme: DocTheme): React.ReactNode {
  const cleaned = clean(
    text.replace(/\[\[([^\]]+)\]\]/g, (_, inner: string) => {
      const parts = inner.split("|");
      const target = (parts[1] ?? parts[0]).trim();
      return target.split("/").pop() ?? target;
    }),
  );
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(cleaned))) {
    if (m.index > last) nodes.push(cleaned.slice(last, m.index));
    nodes.push(
      <strong key={k++} style={{ fontWeight: 600, color: theme.fg }}>
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) nodes.push(cleaned.slice(last));
  return nodes;
}
