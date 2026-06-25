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
// consistent and sticky. Brand colors are `var(--brand-x, #literal)` so they
// resolve from the CSS vars in-app and survive mail clients that strip custom
// properties on export; the neutral inks derive from the paper so the document
// reads well on white, cream, or a dark background.
export function docTheme(brand: BrandKit): DocTheme {
  const v = brandToCssVars(brand);
  const tok = (name: keyof typeof v) => `var(${name}, ${v[name]})`;
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 2px" }}>
        {model.accentDot && (
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 999,
              background: t.primary,
              flexShrink: 0,
            }}
          />
        )}
        <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 700, margin: 0, color: t.secondary }}>
          {clean(model.title)}
        </h1>
      </div>
      {headerLine && (
        <div style={{ color: t.muted, fontSize: 13 }}>{headerLine}</div>
      )}

      {(model.about.length > 0 || model.teams.length > 0) && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {model.people.map((p) =>
              slots.renderPerson ? (
                <React.Fragment key={p.name}>{slots.renderPerson(p)}</React.Fragment>
              ) : (
                <PersonChip key={p.name} person={p} theme={t} />
              ),
            )}
          </div>
        </Section>
      )}

      {model.stats.length > 0 && (
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: `repeat(${model.stats.length}, minmax(0, 1fr))`,
            gap: 10,
          }}
        >
          {model.stats.map((s) => (
            <StatCard key={s.label} value={s.value} label={s.label} theme={t} />
          ))}
        </div>
      )}

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
          <div style={{ display: "grid", gap: 8 }}>
            {model.openActions.map((a) =>
              a.isJordans && a.task && slots.renderJordanAction ? (
                <React.Fragment key={a.key}>{slots.renderJordanAction(a)}</React.Fragment>
              ) : (
                <ActionCard key={a.key} action={a} theme={t} />
              ),
            )}
          </div>
        )}
        {model.closedActions.length > 0 && (
          <details style={{ marginTop: 10 }} open={expandClosed || undefined}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: t.muted }}>
              {model.closedActions.length} closed
            </summary>
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {model.closedActions.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 14, color: t.muted }}>
                  <span style={{ color: t.ok }}>&#9745;</span>
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
          <div style={{ display: "grid", gap: 8 }}>
            {model.sessions.map((s, i) => {
              const href = s.notePath ? slots.sessionHref?.(s.notePath) : undefined;
              return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${t.line}`,
                    borderLeft: `3px solid ${t.primary}`,
                    borderRadius: 12,
                    padding: 14,
                    background: t.surface2,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.fg }}>{clean(s.heading)}</div>
                    {href && (
                      <a href={href} style={{ fontSize: 12, fontWeight: 600, color: t.primary, textDecoration: "none" }}>
                        Open note &rarr;
                      </a>
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 12,
          color: t.muted,
        }}
      >
        <span>{clean(model.footerLine)}</span>
        {t.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logoUrl} alt="" style={{ height: 22, width: "auto", objectFit: "contain" }} />
        ) : (
          <span>Source · Hammer Claw Vault</span>
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
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 13, color: theme.ink2 }}>
      <span style={{ fontWeight: 600, color: theme.fg }}>{label}:</span>
      {children}
    </div>
  );
}

function Chip({ theme, children }: { theme: DocTheme; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        borderRadius: 999,
        border: `1px solid ${theme.line2}`,
        fontSize: 12.5,
        color: theme.fg,
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
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px 2px 2px",
        borderRadius: 999,
        border: `1px solid ${theme.line2}`,
        fontSize: 12.5,
        color: theme.fg,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: 7,
          background: bg,
          color: fg,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {initials(person.name)}
      </span>
      <span>{clean(person.name)}</span>
      {person.count != null && person.count > 0 && (
        <span style={{ color: theme.muted, fontSize: 11, fontWeight: 600 }}>{person.count}&times;</span>
      )}
    </span>
  );
}

function StatCard({
  value,
  label,
  theme,
}: {
  value: string | number;
  label: string;
  theme: DocTheme;
}) {
  const numeric = typeof value === "number" || /^\d+$/.test(String(value));
  return (
    <div
      style={{
        minHeight: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
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
        {clean(String(value))}
      </div>
      <div style={{ ...EYEBROW, color: theme.muted, marginTop: 4, fontSize: 10 }}>{clean(label)}</div>
    </div>
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
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ marginTop: 1, fontSize: 14, color: action.done ? t.ok : t.muted }}>
          {action.done ? "☑" : "☐"}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, color: t.fg }}>
            {action.owner && <b style={{ color: ownerColor(action.ownerKind, t) }}>{clean(action.owner)}: </b>}
            {clean(action.text)}
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5, marginLeft: 8, verticalAlign: "middle" }}>
              {action.priority && <PriorityPill priority={action.priority} theme={t} />}
              {action.customer && <Chip theme={t}>{clean(action.customer)}</Chip>}
              {!action.flag && action.due && (
                <Pill bg={t.dueSoft} fg={t.dueInk}>due {clean(action.due)}</Pill>
              )}
              {action.flag && (
                <Pill bg={t.warmSoft} fg={t.warm}>
                  &#9873; needs due date{action.vague ? ` · ${clean(action.vague)}` : ""}
                </Pill>
              )}
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: t.muted }}>
            {action.isJordans ? "Jordan" : "tracking only"}
          </div>
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
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 8px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.accent, fontVariantNumeric: "tabular-nums" }}>
          {String(index).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: t.secondary }}>
          {clean(section.heading)}
        </span>
      </div>
      {section.variant === "full" ? (
        <div style={{ display: "grid", gap: 12 }}>
          {(section.prose ?? []).map((b, i) => (
            <div key={i}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
  if (variant === "watch") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            flexShrink: 0,
            borderRadius: 999,
            background: t.warm,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          !
        </span>
        <span style={{ fontSize: 15, color: t.fg }}>{clean(text)}</span>
      </div>
    );
  }
  if (variant === "number") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 14px",
          marginBottom: 4,
          borderRadius: 12,
          background: t.accentSoft,
          border: `1px solid ${t.line}`,
        }}
      >
        <span style={{ flexShrink: 0, fontSize: 14, color: t.accent }}>&#9670;</span>
        <span style={{ fontSize: 15, color: t.fg }}>{clean(text)}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
      <span
        style={{
          flexShrink: 0,
          width: 11,
          height: 11,
          borderRadius: 2,
          background: t.primary,
          transform: "rotate(45deg)",
        }}
      />
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
