import React from "react";
import {
  MeetingDoc,
  clientDocTheme,
  meetingToDoc,
  seriesToDoc,
  EXPORT_FONT,
  type DocModel,
} from "@/lib/meetingTemplate";
import { type BrandKit, brandStyleAttr, resolveBrandKit } from "@/lib/branding";
import {
  getMeetingNoteByPath,
  getSeriesByPath,
  getSeriesView,
  getRoster,
} from "@/lib/vault";
import type { Roster } from "@/lib/vault/types";
import { listAccounts } from "@/lib/accounts";
import { workstreamFromPath } from "@/lib/taskView";

// The shared template rendered to an HTML string for Copy-for-email and the PDF
// (step 2). Next's App Router bans react-dom/server anywhere in its build graph,
// so we serialize the <MeetingDoc> element tree ourselves. The component uses
// only intrinsic tags + inline style objects, which keeps this tiny and means
// there is still ONE template (the React component) feeding all three surfaces.

// React-style props that take a unitless number; everything else gets "px".
const UNITLESS = new Set([
  "fontWeight",
  "lineHeight",
  "opacity",
  "zIndex",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
]);
const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link"]);
const ATTR_RENAME: Record<string, string> = { className: "class", htmlFor: "for" };

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}
function styleToString(style: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === false) continue;
    const val = typeof v === "number" && !UNITLESS.has(k) ? `${v}px` : String(v);
    parts.push(`${kebab(k)}:${val}`);
  }
  return parts.join(";");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string") return escapeText(node);
  if (typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(serialize).join("");
  if (React.isValidElement(node)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = node as React.ReactElement<any>;
    const type = el.type;
    if (type === React.Fragment) {
      return serialize(el.props.children);
    }
    if (typeof type === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return serialize((type as (p: any) => React.ReactNode)(el.props));
    }
    if (typeof type === "string") {
      const { children, style, ...rest } = el.props as Record<string, unknown>;
      let attrs = "";
      if (style && typeof style === "object") {
        const s = styleToString(style as Record<string, unknown>);
        if (s) attrs += ` style="${escapeAttr(s)}"`;
      }
      for (const [k, v] of Object.entries(rest)) {
        if (v == null || v === false) continue;
        const name = ATTR_RENAME[k] ?? k;
        if (v === true) {
          attrs += ` ${name}`; // bare boolean attribute, e.g. <details open>
          continue;
        }
        if (typeof v !== "string" && typeof v !== "number") continue;
        attrs += ` ${name}="${escapeAttr(String(v))}"`;
      }
      if (VOID_TAGS.has(type)) return `<${type}${attrs}/>`;
      return `<${type}${attrs}>${serialize(children as React.ReactNode)}</${type}>`;
    }
  }
  return "";
}

// Load a meeting or series, resolve its client brand by workstream, and render
// the shared template to HTML. One loader behind both the email-copy route and
// the print/PDF route, so the email and the PDF cannot drift.
export async function buildShareHtml(
  target: { path?: string; seriesPath?: string },
  opts: { expandClosed?: boolean } = {},
): Promise<{ html: string; filename: string } | null> {
  const [accounts, roster] = await Promise.all([
    listAccounts().catch(() => []),
    getRoster().catch(() => new Map() as Roster),
  ]);

  if (target.seriesPath) {
    const series = await getSeriesByPath(target.seriesPath);
    if (!series) return null;
    const view = await getSeriesView(series).catch(() => ({
      outstanding: [],
      closed: [],
      sessions: [],
      stats: { attendance: [], sessions: 0, actionsOpen: 0, actionsClosed: 0, decisions: 0 },
    }));
    const brand = await resolveBrandKit(workstreamFromPath(series.path));
    const model = seriesToDoc(series, view, {
      roster,
      accounts,
      eyebrowLead: brand.workstreamKey ? brand.name : "Film Room",
    });
    return { html: renderShareHtml(model, brand, opts), filename: model.filenameBase };
  }

  if (target.path) {
    const note = await getMeetingNoteByPath(target.path);
    if (!note) return null;
    const brand = await resolveBrandKit(workstreamFromPath(note.path));
    const model = meetingToDoc(note, {
      roster,
      accounts,
      eyebrowLead: brand.workstreamKey ? brand.name : "Film Room",
    });
    return { html: renderShareHtml(model, brand, opts), filename: model.filenameBase };
  }

  return null;
}

// Sets the brand CSS vars on the root via brandStyleAttr so the var() tokens
// resolve; the literal fallbacks baked into clientDocTheme keep it colored in
// clients that strip custom properties.
export function renderShareHtml(
  model: DocModel,
  brand: BrandKit,
  opts: { expandClosed?: boolean } = {},
): string {
  const theme = clientDocTheme(brand);
  const inner = serialize(
    React.createElement(MeetingDoc, { model, theme, expandClosed: opts.expandClosed }),
  );
  return (
    `<div style="${brandStyleAttr(brand)};max-width:680px;margin:0 auto;padding:8px 12px;` +
    `background:#ffffff;font-family:${EXPORT_FONT};font-size:15px;line-height:1.55;color:#1f2733">` +
    inner +
    `</div>`
  );
}
