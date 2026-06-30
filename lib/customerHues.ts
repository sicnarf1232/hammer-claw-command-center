// Per-customer accent hues for the Film Room UI: color-codes customers across
// avatars, section dots, and meeting-row bars/dates/kickers. Known customers get
// fixed hues; anything else cycles the same palette deterministically by name.

export interface Hue {
  hue: string; // solid accent
  soft: string; // 8-digit hex (hue + low alpha) so it works in light AND dark
}

function withAlpha(hex: string, alpha = "20"): string {
  return `${hex}${alpha}`;
}

const KNOWN: { match: string; hue: string }[] = [
  { match: "stryker", hue: "#5145E6" },
  { match: "gore", hue: "#0E9F8E" },
  { match: "angiosafe", hue: "#E4584A" },
  { match: "intuitive", hue: "#B852CC" },
  { match: "cook", hue: "#D98A0B" },
  { match: "internal", hue: "#4A4A63" },
  { match: "unfiled", hue: "#4A4A63" },
];

const CYCLE = [
  "#5145E6",
  "#0E9F8E",
  "#E4584A",
  "#B852CC",
  "#D98A0B",
  "#2E7DD1",
  "#C2456E",
  "#3FA34D",
];

export function customerHue(name: string): Hue {
  const key = (name ?? "").trim().toLowerCase();
  for (const k of KNOWN) {
    if (key === k.match || key.includes(k.match)) {
      return { hue: k.hue, soft: withAlpha(k.hue) };
    }
  }
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = CYCLE[h % CYCLE.length];
  return { hue, soft: withAlpha(hue) };
}

export function initials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  // First + last word, so multi-word names give matching initials.
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function isInternalBucket(bucket: string): boolean {
  return /^(internal|unfiled|personal)$/i.test((bucket ?? "").trim());
}
