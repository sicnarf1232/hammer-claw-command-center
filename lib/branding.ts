import { getDb, dbConfigured, brandKits } from "@/lib/db";
import { eq } from "drizzle-orm";

// Two-layer branding (Phase 3 PART B). The in-app meeting view uses the APP
// brand; the shared exports (PDF, email HTML) use the resolved CLIENT brand.
// Kits live in the brand_kits table and are resolved by a meeting's workstream;
// no kit -> APP_NEUTRAL fallback. Never restyle the rest of the app UI with these.

export interface BrandKit {
  id?: number;
  name: string;
  workstreamKey: string | null;
  primary: string;
  secondary: string;
  accent: string;
  logoUrl: string | null;
}

// App neutral brand (also the export fallback when a workstream has no kit).
export const APP_NEUTRAL: BrandKit = {
  name: "App neutral",
  workstreamKey: null,
  primary: "#5145e6",
  secondary: "#1f2937",
  accent: "#5145e6",
  logoUrl: null,
};

// Seeded once so Jordan can open Branding, set the crimson palette + upload the
// Merit logo, and test end to end. Placeholder neutral until he edits it.
export const MERIT_PLACEHOLDER: BrandKit = {
  name: "Merit Medical OEM",
  workstreamKey: "merit",
  primary: "#9ca3af",
  secondary: "#4b5563",
  accent: "#9ca3af",
  logoUrl: null,
};

// 6-digit hex -> "rgba(r,g,b,a)" for derived tints (soft backgrounds, borders).
export function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The single theming contract: feed these into the shared template's CSS vars.
export function brandToCssVars(kit: BrandKit): Record<string, string> {
  return {
    "--brand-primary": kit.primary,
    "--brand-secondary": kit.secondary,
    "--brand-accent": kit.accent,
    "--brand-primary-soft": tint(kit.primary, 0.1),
    "--brand-accent-soft": tint(kit.accent, 0.12),
    "--brand-border": tint(kit.primary, 0.35),
  };
}

// Inline `style="--brand-primary: ...; ..."` string for the export HTML root.
export function brandStyleAttr(kit: BrandKit): string {
  return Object.entries(brandToCssVars(kit))
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

// Resolve a meeting's client brand by workstream. Falls back to APP_NEUTRAL when
// the DB is unset or no kit exists for the workstream.
export async function resolveBrandKit(
  workstream: string | null | undefined,
): Promise<BrandKit> {
  if (!dbConfigured() || !workstream) return APP_NEUTRAL;
  try {
    const rows = await getDb()
      .select()
      .from(brandKits)
      .where(eq(brandKits.workstreamKey, workstream))
      .limit(1);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          name: r.name,
          workstreamKey: r.workstreamKey,
          primary: r.primary,
          secondary: r.secondary,
          accent: r.accent,
          logoUrl: r.logoUrl,
        }
      : APP_NEUTRAL;
  } catch {
    return APP_NEUTRAL;
  }
}

// Insert the Merit placeholder kit if no kit exists for "merit". Server-only.
export async function ensureMeritSeed(): Promise<void> {
  if (!dbConfigured()) return;
  const existing = await resolveBrandKit("merit");
  if (existing.workstreamKey === "merit") return;
  await getDb().insert(brandKits).values({
    name: MERIT_PLACEHOLDER.name,
    workstreamKey: "merit",
    primary: MERIT_PLACEHOLDER.primary,
    secondary: MERIT_PLACEHOLDER.secondary,
    accent: MERIT_PLACEHOLDER.accent,
    logoUrl: null,
  });
}
