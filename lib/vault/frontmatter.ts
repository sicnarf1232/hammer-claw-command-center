import { parse as parseYaml } from "yaml";
import type { Frontmatter } from "./types";

export interface SplitDocument {
  frontmatter: Frontmatter;
  body: string; // markdown after the closing fence
}

const FENCE = "---";

// Split a markdown document into its leading YAML frontmatter and the body.
// Tolerant: a missing or malformed frontmatter block yields an empty
// frontmatter and the whole text as body (never throws).
export function splitFrontmatter(input: string): SplitDocument {
  // Normalize line endings so the fence test is reliable.
  const text = input.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  // Frontmatter must start on the very first line with a `---` fence.
  if (lines[0]?.trim() !== FENCE) {
    return { frontmatter: emptyFrontmatter(), body: input };
  }

  // Find the closing fence.
  let closing = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) {
      closing = i;
      break;
    }
  }
  if (closing === -1) {
    // No closing fence: treat as no frontmatter rather than swallowing the file.
    return { frontmatter: emptyFrontmatter(), body: input };
  }

  const yamlText = lines.slice(1, closing).join("\n");
  const body = lines.slice(closing + 1).join("\n");
  return { frontmatter: parseFrontmatterYaml(yamlText), body };
}

export function parseFrontmatterYaml(yamlText: string): Frontmatter {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(yamlText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed YAML: tolerate, surface nothing rather than crash.
    raw = {};
  }

  return {
    workstream: asString(raw.workstream),
    type: asString(raw.type),
    status: asString(raw.status),
    created: asString(raw.created),
    date: asString(raw.date),
    raw,
  };
}

function emptyFrontmatter(): Frontmatter {
  return { raw: {} };
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  // Dates may be parsed by YAML into Date objects; normalize to ISO date.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
