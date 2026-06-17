// Single Granola API client for all Granola access (mirrors the lib/github.ts
// convention). Reads meeting notes for the Granola-pull feature.
//
// API: https://docs.granola.ai/api-reference
//   Base:  https://public-api.granola.ai
//   Auth:  Authorization: Bearer <GRANOLA_API_KEY>   (key looks like grn_...)
//   List:  GET /v1/notes?created_after=<ISO>&page_size=30&cursor=...
//   Get:   GET /v1/notes/{not_id}?include=transcript
// Only notes that already have an AI summary are returned. Rate limit: 25 burst
// per 5s, 5 req/s sustained, so detail reads are done sequentially upstream.

const BASE_URL = "https://public-api.granola.ai";

export function granolaConfigured(): boolean {
  return Boolean(process.env.GRANOLA_API_KEY);
}

export class GranolaNotConfiguredError extends Error {
  constructor() {
    super("GRANOLA_API_KEY is not set. The Granola pull is unavailable.");
    this.name = "GranolaNotConfiguredError";
  }
}

export class GranolaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GranolaApiError";
  }
}

export interface GranolaPerson {
  name: string | null;
  email: string;
}

export interface GranolaNoteSummary {
  id: string;
  object: "note";
  title: string | null;
  owner: GranolaPerson;
  created_at: string;
  updated_at: string;
}

export interface GranolaCalendarEvent {
  event_title: string | null;
  invitees: { email: string }[];
  organiser: string | null;
  calendar_event_id: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
}

export interface GranolaFolder {
  id: string;
  object: "folder";
  name: string;
  parent_folder_id: string | null;
}

export interface GranolaTranscriptLine {
  speaker: { source: string; diarization_label?: string };
  text: string;
  start_time?: string;
  end_time?: string;
}

export interface GranolaNote extends GranolaNoteSummary {
  web_url: string;
  calendar_event: GranolaCalendarEvent | null;
  attendees: GranolaPerson[];
  folder_membership: GranolaFolder[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: GranolaTranscriptLine[] | null;
}

function apiKey(): string {
  const key = process.env.GRANOLA_API_KEY;
  if (!key) throw new GranolaNotConfiguredError();
  return key;
}

async function granolaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
    },
    // Always read fresh from Granola; the vault is the durable cache.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GranolaApiError(
      res.status,
      `Granola ${path} returned ${res.status}. ${text.slice(0, 200)}`.trim(),
    );
  }
  return (await res.json()) as T;
}

interface ListResponse {
  notes: GranolaNoteSummary[];
  hasMore: boolean;
  cursor: string | null;
}

// List every note created after the given ISO timestamp, following pagination
// to the end (page_size max is 30). Bounded to 20 pages as a runaway guard.
export async function listNotesCreatedAfter(
  createdAfterISO: string,
): Promise<GranolaNoteSummary[]> {
  const out: GranolaNoteSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      created_after: createdAfterISO,
      page_size: "30",
    });
    if (cursor) params.set("cursor", cursor);
    const data = await granolaGet<ListResponse>(`/v1/notes?${params}`);
    out.push(...(data.notes ?? []));
    if (!data.hasMore || !data.cursor) break;
    cursor = data.cursor;
  }
  return out;
}

// Fetch a single note's full detail. Transcript is omitted by default (it is
// large and the summary carries the meeting content used for filing).
export async function getNote(
  id: string,
  includeTranscript = false,
): Promise<GranolaNote> {
  const q = includeTranscript ? "?include=transcript" : "";
  return granolaGet<GranolaNote>(`/v1/notes/${id}${q}`);
}
