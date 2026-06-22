"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Internal-vs-customer accent colors, saved in the browser (localStorage) so
// Jordan can match his branding. Defaults: internal red, customer blue.
export interface BrandColors {
  internal: string;
  customer: string;
}
const DEFAULTS: BrandColors = { internal: "#dc2626", customer: "#2563eb" };
const KEY = "brandColors";

export const PALETTE = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#16a34a",
  "#0d9488", "#2563eb", "#4f46e5", "#7c3aed", "#db2777", "#475569",
];

const Ctx = createContext<{
  colors: BrandColors;
  set: (c: Partial<BrandColors>) => void;
}>({ colors: DEFAULTS, set: () => {} });

export function BrandColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<BrandColors>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setColors({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore malformed storage
    }
  }, []);
  const set = (c: Partial<BrandColors>) =>
    setColors((prev) => {
      const next = { ...prev, ...c };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage unavailable; stays in-memory for the session
      }
      return next;
    });
  return <Ctx.Provider value={{ colors, set }}>{children}</Ctx.Provider>;
}

export const useBrandColors = () => useContext(Ctx);

// Translucent tint for chip backgrounds (6-digit hex + alpha).
export function tintFor(kind: "internal" | "customer" | undefined, colors: BrandColors): string | null {
  if (kind === "internal") return colors.internal;
  if (kind === "customer") return colors.customer;
  return null;
}

// A small palette selector for the two team colors.
export function BrandColorSettings() {
  const { colors, set } = useBrandColors();
  return (
    <div className="card p-4">
      <p className="eyebrow mb-3 text-muted">Team colors</p>
      <SwatchRow label="Internal team" value={colors.internal} onPick={(c) => set({ internal: c })} />
      <div className="mt-3">
        <SwatchRow label="Customer" value={colors.customer} onPick={(c) => set({ customer: c })} />
      </div>
      <p className="mt-3 text-2xs text-muted">Saved in this browser.</p>
    </div>
  );
}

function SwatchRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: value }} />
        <span className="font-medium text-fg">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-label={`Set ${label} to ${c}`}
            className="h-6 w-6 rounded-md transition-transform hover:scale-110"
            style={{ background: c, outline: value === c ? "2px solid var(--fg)" : "none", outlineOffset: 1 }}
          />
        ))}
      </div>
    </div>
  );
}
