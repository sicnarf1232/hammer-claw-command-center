"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandKit } from "@/lib/branding";

// Suggested paper backgrounds (kept in sync with PAPERS in lib/branding; copied
// here so this client bundle never imports the server-only branding module).
const PAPERS: { name: string; value: string }[] = [
  { name: "White", value: "#ffffff" },
  { name: "Cream", value: "#faf6ec" },
  { name: "Ivory", value: "#f6f1e3" },
  { name: "Sand", value: "#efe6d3" },
  { name: "Parchment", value: "#f2ead6" },
  { name: "Slate", value: "#1f2533" },
  { name: "Charcoal", value: "#17181c" },
  { name: "Navy", value: "#15203a" },
];

// 6-digit hex -> rgba for soft tints (local copy so this client bundle never
// pulls the server-only branding module).
function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Is this paper dark enough to need light ink? (matches isDarkPaper in branding)
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L < 0.45;
}

const WORKSTREAMS: { value: string; label: string }[] = [
  { value: "merit", label: "Merit (live client)" },
  { value: "sloan", label: "Sloan" },
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
  { value: "", label: "None (app default)" },
];

interface Draft {
  id?: number;
  name: string;
  workstreamKey: string; // "" = none
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
  logoUrl: string | null;
}

const BLANK: Draft = {
  name: "",
  workstreamKey: "",
  primary: "#9f1239",
  secondary: "#4b5563",
  accent: "#e11d48",
  paper: "#ffffff",
  logoUrl: null,
};

function kitToDraft(k: BrandKit): Draft {
  return {
    id: k.id,
    name: k.name,
    workstreamKey: k.workstreamKey ?? "",
    primary: k.primary,
    secondary: k.secondary,
    accent: k.accent,
    paper: k.paper || "#ffffff",
    logoUrl: k.logoUrl,
  };
}

export default function BrandingManager({
  kits,
  blobEnabled,
}: {
  kits: BrandKit[];
  blobEnabled: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    kits[0] ? kitToDraft(kits[0]) : BLANK,
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function selectKit(k: BrandKit | null) {
    setMsg(null);
    setErr(null);
    setDraft(k ? kitToDraft(k) : BLANK);
  }

  function onLogoFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    if (file.size > 1_500_000) {
      setErr("Logo is large (over 1.5 MB). Use a smaller PNG/SVG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setErr(null);
    setMsg(null);
    if (!draft.name.trim()) {
      setErr("Give the kit a name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name.trim(),
          workstreamKey: draft.workstreamKey || null,
          primary: draft.primary,
          secondary: draft.secondary,
          accent: draft.accent,
          paper: draft.paper,
          logoUrl: draft.logoUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not save the kit.");
        return;
      }
      setMsg("Saved.");
      if (data.kit) setDraft(kitToDraft(data.kit));
      router.refresh();
    } catch {
      setErr("Network error saving the kit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[210px_1fr_300px]">
      {/* Kit list */}
      <aside className="flex flex-col gap-1.5">
        <p className="eyebrow mb-1 text-muted">Kits</p>
        {kits.map((k) => {
          const active = draft.id === k.id;
          return (
            <button
              key={k.id}
              onClick={() => selectKit(k)}
              className="flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors"
              style={{
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active ? "var(--accent-soft)" : "var(--surface-2)",
              }}
            >
              <span className="flex shrink-0 gap-0.5">
                {[k.primary, k.secondary, k.accent].map((c, i) => (
                  <span key={i} className="h-4 w-2.5 rounded-[2px]" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-fg">{k.name}</span>
                <span className="block text-2xs text-muted">
                  {k.workstreamKey ?? "no workstream"}
                </span>
              </span>
            </button>
          );
        })}
        <button
          onClick={() => selectKit(null)}
          className="mt-1 rounded-[10px] border border-dashed px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-fg"
          style={{ borderColor: "var(--line-2)" }}
        >
          + New kit
        </button>
      </aside>

      {/* Editor */}
      <section className="card p-5">
        <div className="grid gap-4">
          <Field label="Kit name">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Merit Medical OEM"
              className="input"
            />
          </Field>

          <Field label="Workstream" hint="Exports for this workstream use this kit.">
            <select
              value={draft.workstreamKey}
              onChange={(e) => set("workstreamKey", e.target.value)}
              className="input"
            >
              {WORKSTREAMS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField label="Primary" value={draft.primary} onChange={(v) => set("primary", v)} />
            <ColorField label="Secondary" value={draft.secondary} onChange={(v) => set("secondary", v)} />
            <ColorField label="Accent" value={draft.accent} onChange={(v) => set("accent", v)} />
          </div>

          <Field label="Paper" hint="The note background, across all three views.">
            <div className="flex flex-wrap items-center gap-2">
              {PAPERS.map((p) => {
                const active = draft.paper.toLowerCase() === p.value.toLowerCase();
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set("paper", p.value)}
                    title={p.name}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className="h-8 w-8 rounded-[8px] border-2"
                      style={{
                        background: p.value,
                        borderColor: active ? "var(--accent)" : "var(--line-2)",
                      }}
                    />
                    <span className="text-[10px] text-muted">{p.name}</span>
                  </button>
                );
              })}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft.paper) ? draft.paper : "#ffffff"}
                onChange={(e) => set("paper", e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border bg-transparent p-0.5"
                style={{ borderColor: "var(--line)" }}
                aria-label="Custom paper color"
                title="Custom"
              />
            </div>
          </Field>

          <Field
            label="Logo"
            hint={
              blobEnabled
                ? "Stored in Vercel Blob."
                : "No Blob store yet, so the logo is saved inline (works, but heavier)."
            }
          >
            <div className="flex items-center gap-3">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.logoUrl}
                  alt="Logo preview"
                  className="h-10 w-auto max-w-[140px] rounded border object-contain p-1"
                  style={{ borderColor: "var(--line)", background: "#fff" }}
                />
              ) : (
                <span className="text-sm text-muted">No logo</span>
              )}
              <label className="btn btn-ghost cursor-pointer px-3 py-1 text-xs">
                {draft.logoUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {draft.logoUrl && (
                <button
                  onClick={() => set("logoUrl", null)}
                  className="text-xs font-semibold text-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
            </div>
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="btn btn-primary px-4 py-1.5 text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create kit"}
            </button>
            {msg && <span className="text-sm text-[color:var(--ok)]">{msg}</span>}
            {err && <span className="text-sm text-danger">{err}</span>}
          </div>
        </div>
      </section>

      {/* Live preview */}
      <aside>
        <p className="eyebrow mb-2 text-muted">Export preview</p>
        <Preview draft={draft} />
      </aside>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-muted">{hint}</span>}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-fg">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
          style={{ borderColor: "var(--line)" }}
          aria-label={`${label} color picker`}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input font-mono text-xs uppercase"
          spellCheck={false}
        />
      </div>
    </label>
  );
}

// A faithful mini of the export document, themed by the live draft colors +
// paper, so every brand element has a visible role and the paper choice shows.
function Preview({ draft }: { draft: Draft }) {
  const lead = (draft.name || "Brand").toUpperCase();
  const dark = isDark(draft.paper);
  const fg = dark ? "#f4f4f5" : "#1f2733";
  const muted = dark ? "rgba(255,255,255,0.56)" : "#6b7280";
  const cardBg = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.035)";
  const cardLine = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  return (
    <div className="sticky top-4">
      <div
        className="rounded-[12px] border p-4"
        style={{ borderColor: "var(--line)", background: draft.paper, color: fg }}
      >
        {draft.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.logoUrl} alt="" className="mb-2 h-6 w-auto max-w-[120px] object-contain" />
        )}
        {/* Eyebrow + footer rule + TL;DR border + internal chip = PRIMARY */}
        <div className="text-[9px] font-bold uppercase" style={{ letterSpacing: "0.18em", color: draft.primary }}>
          {lead} · MEETING NOTES
        </div>
        {/* Title + section headings = SECONDARY */}
        <div className="mt-1 text-[15px] font-bold leading-tight" style={{ color: draft.secondary }}>
          GTIN Alignment
        </div>
        <div className="text-[10px]" style={{ color: muted }}>
          June 17, 2026 · MicroVention Terumo
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
            style={{ border: `1px solid ${cardLine}` }}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold"
              style={{ background: tint(draft.primary, 0.18), color: draft.primary }}
            >
              JO
            </span>
            Jordan
          </span>
        </div>

        {/* Stat values = ACCENT */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {["3", "2", "1"].map((v, i) => (
            <div
              key={i}
              className="flex flex-col items-center rounded-[8px] border p-1.5"
              style={{ borderColor: cardLine, background: cardBg }}
            >
              <span className="text-[15px] font-bold leading-none" style={{ color: draft.accent }}>
                {v}
              </span>
              <span className="mt-0.5 text-[7px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: muted }}>
                {["People", "Open", "Done"][i]}
              </span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 rounded-[8px] p-2.5 text-[11px] leading-snug"
          style={{ background: tint(draft.primary, 0.14), borderLeft: `3px solid ${draft.primary}` }}
        >
          Merit needs a valid GTIN before sample builds.
        </div>

        {/* A section row: index + accent + SECONDARY heading */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[9px] font-bold tabular-nums" style={{ color: draft.accent }}>
            01
          </span>
          <span className="text-[9px] font-bold uppercase" style={{ letterSpacing: "0.1em", color: draft.secondary }}>
            Key Decisions
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rotate-45 rounded-[1px]" style={{ background: draft.primary }} />
          <span className="text-[11px]">Hold sample builds until the GTIN is confirmed.</span>
        </div>

        <div
          className="mt-3 flex items-center justify-between border-t-2 pt-2 text-[9px]"
          style={{ borderColor: draft.primary, color: muted }}
        >
          <span>{draft.name || "Brand"} · Confidential</span>
          {draft.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.logoUrl} alt="" className="h-4 w-auto max-w-[60px] object-contain" />
          ) : (
            <span>Hammer Claw</span>
          )}
        </div>
      </div>

      {/* Legend: where each element shows up */}
      <div className="mt-3 grid gap-1.5 text-2xs">
        <Legend color={draft.primary} label="Primary" where="eyebrow, chips, borders, callout" />
        <Legend color={draft.secondary} label="Secondary" where="title + section headings" />
        <Legend color={draft.accent} label="Accent" where="stat numbers, section index" />
        <Legend color={draft.paper} label="Paper" where="note background (all 3 views)" />
      </div>
    </div>
  );
}

function Legend({ color, label, where }: { color: string; label: string; where: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-[3px] border"
        style={{ background: color, borderColor: "var(--line-2)" }}
      />
      <span className="font-semibold text-fg">{label}</span>
      <span className="text-muted">{where}</span>
    </div>
  );
}
