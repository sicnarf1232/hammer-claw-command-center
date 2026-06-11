import type { Wikilink } from "./types";

// Parse a single wikilink body (the text between [[ and ]]).
//   "Target"                    -> { target: "Target", basename: "Target" }
//   "Target|Alias"              -> { target: "Target", alias: "Alias" }
//   "memory/people/Scott|Scott" -> { target: "memory/people/Scott", basename: "Scott", alias: "Scott" }
export function parseWikilinkBody(body: string): Wikilink {
  const trimmed = body.trim();
  const pipe = trimmed.indexOf("|");
  let target = trimmed;
  let alias: string | undefined;
  if (pipe !== -1) {
    target = trimmed.slice(0, pipe).trim();
    alias = trimmed.slice(pipe + 1).trim() || undefined;
  }
  const basename = basenameOf(target);
  return {
    target,
    basename,
    alias,
    display: alias ?? basename,
  };
}

// Strip a path-qualified target to its display basename.
//   "memory/people/Scott" -> "Scott"
export function basenameOf(target: string): string {
  const parts = target.split("/");
  return parts[parts.length - 1].trim();
}

// Parse the first wikilink found in a string, if any.
const WIKILINK_RE = /\[\[([^\]]+)\]\]/;

export function parseFirstWikilink(text: string): Wikilink | undefined {
  const m = text.match(WIKILINK_RE);
  if (!m) return undefined;
  return parseWikilinkBody(m[1]);
}

// Parse all wikilinks found in a string.
export function parseAllWikilinks(text: string): Wikilink[] {
  const out: Wikilink[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(parseWikilinkBody(m[1]));
  }
  return out;
}
