import type { MeetingNote } from "@/lib/vault/types";
import type { Series } from "@/lib/vault/series";
import { needsDueDate } from "@/lib/dates";

// Phase D: a normalized "share document" model for a meeting note or a rolling
// series, plus a clean email-HTML renderer. The PDF renderer (lib/meetingPdf)
// consumes the same model, so meeting and series share one layout engine. Pure
// (no network, no pdf-lib), so it is unit-tested directly.

export interface ShareAction {
  done: boolean;
  owner?: string;
  text: string;
  due?: string;
  flag: boolean; // needs a due date (missing / TBD / vague)
}

export type ShareBlock =
  | { type: "tldr"; label: string; text: string }
  | { type: "actions"; items: ShareAction[] }
  | { type: "bullets"; heading: string; items: string[] }
  | { type: "prose"; heading: string; text: string }
  | { type: "log"; heading: string; entries: { heading: string; text: string }[] };

export interface ShareDoc {
  kind: "meeting" | "series";
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  blocks: ShareBlock[];
  filenameBase: string; // for the download filename (no extension)
}

const SECTION_ORDER = ["Key Decisions", "Numbers That Matter", "Watch-Outs"];

function bulletsOf(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

export function meetingToShareDoc(note: MeetingNote): ShareDoc {
  const meta: { label: string; value: string }[] = [];
  if (note.customer?.display) meta.push({ label: "Account", value: note.customer.display });
  if (note.topic) meta.push({ label: "Topic", value: note.topic });
  if (note.attendees.length)
    meta.push({ label: "Attendees", value: note.attendees.join(", ") });

  const blocks: ShareBlock[] = [];
  if (note.sections["TL;DR"]) {
    blocks.push({ type: "tldr", label: "TL;DR", text: note.sections["TL;DR"] });
  }
  blocks.push({
    type: "actions",
    items: note.actionItems.map((ai) => ({
      done: ai.done,
      owner: ai.owner,
      text: ai.text,
      due: ai.due,
      flag: needsDueDate(ai.due),
    })),
  });
  for (const h of SECTION_ORDER) {
    if (note.sections[h]) blocks.push({ type: "bullets", heading: h, items: bulletsOf(note.sections[h]) });
  }
  if (note.sections["Full Notes"]) {
    blocks.push({ type: "prose", heading: "Full Notes", text: note.sections["Full Notes"] });
  }

  const base = note.path.split("/").pop()?.replace(/\.md$/, "") || note.title;
  return {
    kind: "meeting",
    title: note.title,
    subtitle: note.date,
    meta,
    blocks,
    filenameBase: base,
  };
}

export function seriesToShareDoc(series: Series): ShareDoc {
  const meta: { label: string; value: string }[] = [];
  if (series.cadence) meta.push({ label: "Cadence", value: series.cadence });
  if (series.participants.length)
    meta.push({ label: "People", value: series.participants.join(", ") });
  if (series.updated) meta.push({ label: "Latest", value: series.updated });

  const blocks: ShareBlock[] = [];
  blocks.push({
    type: "tldr",
    label: "Current State",
    text: series.currentState || "(none yet)",
  });
  if (series.log.length) {
    blocks.push({
      type: "log",
      heading: "Sessions",
      entries: series.log.map((e) => ({ heading: e.heading, text: e.text.trim() })),
    });
  }

  const sessions = series.log.length;
  return {
    kind: "series",
    title: series.name,
    subtitle: `Rolling notes · ${sessions} session${sessions === 1 ? "" : "s"}`,
    meta,
    blocks,
    filenameBase: series.name,
  };
}

// ---- email HTML ----

// Strip em dashes (house style) from any rendered text.
function noEmDash(s: string): string {
  return s.replace(/—/g, ", ");
}

function esc(s: string): string {
  return noEmDash(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A clean, inline-styled HTML fragment Jordan can paste into an email body.
// Inline styles only (email clients strip <style>); no em dashes.
export function renderMeetingEmailHtml(doc: ShareDoc): string {
  const ACCENT = "#4f46e5";
  const INK = "#1f2733";
  const MUTED = "#6b7280";
  const WARM = "#b45309";

  const h2 = (t: string) =>
    `<div style="font:700 12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};margin:22px 0 8px">${esc(t)}</div>`;

  const parts: string[] = [];
  parts.push(
    `<div style="max-width:640px;margin:0 auto;font:400 15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${INK}">`,
  );
  parts.push(
    `<div style="font:700 11px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT}">Film Room</div>`,
  );
  parts.push(
    `<div style="font:700 24px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${INK};margin:6px 0 2px">${esc(doc.title)}</div>`,
  );
  if (doc.subtitle)
    parts.push(`<div style="color:${MUTED};font-size:13px">${esc(doc.subtitle)}</div>`);
  if (doc.meta.length) {
    parts.push(`<div style="margin-top:8px;font-size:13px;color:${MUTED}">`);
    for (const m of doc.meta)
      parts.push(
        `<div><span style="font-weight:600;color:${INK}">${esc(m.label)}:</span> ${esc(m.value)}</div>`,
      );
    parts.push(`</div>`);
  }
  parts.push(
    `<div style="height:2px;background:${ACCENT};margin:14px 0 4px;border-radius:2px"></div>`,
  );

  for (const b of doc.blocks) {
    if (b.type === "tldr") {
      parts.push(h2(b.label));
      parts.push(`<div style="white-space:pre-wrap">${esc(b.text)}</div>`);
    } else if (b.type === "actions") {
      parts.push(h2("Action Items"));
      if (!b.items.length) {
        parts.push(`<div style="color:${MUTED}">None captured.</div>`);
      } else {
        parts.push(`<div>`);
        for (const it of b.items) {
          const box = it.done ? "&#9745;" : "&#9744;";
          const owner = it.owner ? `<b>${esc(it.owner)}:</b> ` : "";
          const due = it.flag
            ? ` <span style="color:${WARM};font-weight:600">[needs due date${it.due && it.due.toLowerCase() !== "tbd" ? ": " + esc(it.due) : ""}]</span>`
            : it.due
              ? ` <span style="color:${MUTED}">[due ${esc(it.due)}]</span>`
              : "";
          parts.push(
            `<div style="margin:4px 0"><span style="color:${ACCENT}">${box}</span> ${owner}${esc(it.text)}${due}</div>`,
          );
        }
        parts.push(`</div>`);
      }
    } else if (b.type === "bullets") {
      parts.push(h2(b.heading));
      parts.push(`<ul style="margin:0;padding-left:20px">`);
      for (const it of b.items) parts.push(`<li style="margin:3px 0">${esc(it)}</li>`);
      parts.push(`</ul>`);
    } else if (b.type === "prose") {
      parts.push(h2(b.heading));
      for (const line of b.text.split("\n")) {
        const sub = line.match(/^###\s+(.+?)\s*$/);
        if (sub) {
          parts.push(
            `<div style="font-weight:600;margin:10px 0 2px;color:${INK}">${esc(sub[1])}</div>`,
          );
        } else if (line.trim()) {
          parts.push(`<div style="white-space:pre-wrap">${esc(line)}</div>`);
        }
      }
    } else if (b.type === "log") {
      parts.push(h2(b.heading));
      for (const e of b.entries) {
        parts.push(
          `<div style="border-left:3px solid ${ACCENT};padding:2px 0 2px 12px;margin:10px 0">`,
        );
        parts.push(`<div style="font-weight:700">${esc(e.heading)}</div>`);
        parts.push(
          `<div style="color:${MUTED};white-space:pre-wrap;font-size:14px">${esc(e.text)}</div>`,
        );
        parts.push(`</div>`);
      }
    }
  }

  parts.push(
    `<div style="margin-top:22px;border-top:2px solid ${ACCENT};padding-top:8px;color:${MUTED};font-size:12px">Film Room · Confidential · Hammer Claw Vault</div>`,
  );
  parts.push(`</div>`);
  return parts.join("\n");
}
