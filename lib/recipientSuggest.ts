// Pure merge/dedupe logic for the compose To/Cc typeahead (dev-feedback #15).
// Kept side-effect free so it is easy to unit test: contact-name matches rank
// first, email-history suggestions fill in below, everything is deduped by
// lowercased email and anything already entered in the field is excluded.

export interface RecipientSuggestion {
  name: string | null;
  email: string;
  source: "contact" | "history";
}

export interface MergeOpts {
  exclude?: string[];
  limit?: number;
}

const DEFAULT_LIMIT = 8;

function norm(email: string): string {
  return email.trim().toLowerCase();
}

export function mergeRecipientSuggestions(
  contacts: RecipientSuggestion[],
  history: RecipientSuggestion[],
  opts: MergeOpts = {},
): RecipientSuggestion[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const excluded = new Set((opts.exclude ?? []).map(norm).filter(Boolean));
  const seen = new Set<string>();
  const out: RecipientSuggestion[] = [];

  for (const list of [contacts, history]) {
    for (const s of list) {
      const key = norm(s.email);
      if (!key || excluded.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...s, email: key });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Substring match on name or email local part, used to keep history
// suggestions relevant once Jordan has started typing a query.
export function matchesQuery(candidate: { name: string | null; email: string }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    (candidate.name ?? "").toLowerCase().includes(needle) ||
    candidate.email.toLowerCase().includes(needle)
  );
}

// Format a suggestion for insertion into a comma-separated address field.
// Bare email address only: nothing downstream (app/api/mail/route.ts's
// strList, ReplyBox's to/cc arrays) parses a "Name <email>" token back into
// a plain address, so inserting the display name would ship it verbatim to
// Flow B as part of the address.
export function formatRecipientForInsert(s: RecipientSuggestion): string {
  return s.email;
}

// Replace the last comma-separated token in a raw address field with a
// picked suggestion, keeping everything typed before it and appending a
// trailing ", " so the next recipient can be typed immediately.
export function insertRecipientToken(current: string, picked: RecipientSuggestion): string {
  const lastComma = current.lastIndexOf(",");
  const upToLastComma = lastComma === -1 ? "" : current.slice(0, lastComma);
  const prefix = upToLastComma
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
  const email = formatRecipientForInsert(picked);
  return prefix ? `${prefix}, ${email}, ` : `${email}, `;
}

// The token currently being typed: whatever follows the last comma.
export function currentToken(value: string): string {
  const idx = value.lastIndexOf(",");
  return idx === -1 ? value.trim() : value.slice(idx + 1).trim();
}

// Every address token already present in the field (for exclude lists),
// ignoring the one still being typed.
export function completedTokens(value: string): string[] {
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, value.trim().endsWith(",") ? parts.length : Math.max(parts.length - 1, 0));
}

// Final parse of a To/Cc field's raw text into the address list a send call
// actually ships (dev-feedback #18, ReplyBox's editable recipients): unlike
// completedTokens above, this includes the last token even without a
// trailing comma/semicolon, since by send time nothing is "still being
// typed." Comma and semicolon both split, matching Composer's existing
// pending-link parse.
export function parseRecipientList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
