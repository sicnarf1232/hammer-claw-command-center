// Propose-then-confirm for AI vault writes (Phase 1). Model output is staged
// as a pending proposal; nothing touches the vault until Jordan approves it in
// the review queue on /meetings. Payloads carry everything execution needs, so
// approval never re-runs the AI.

export type ProposalKind = "meeting-file" | "series-update";

export type ProposalStatus =
  | "pending"
  | "approved" // decided + executed
  | "rejected"
  | "error" // approved but execution failed; re-pull stages it fresh
  | "expired" // pending too long, lazily swept
  | "superseded";

// A Granola meeting, fully triaged and rendered, waiting to be written into
// the vault. `content` is the exact markdown the approval will commit.
export interface MeetingFilePayload {
  granolaId: string;
  title: string;
  date: string; // YYYY-MM-DD
  path: string; // vault path the note will be written to
  content: string; // fully rendered note markdown
  workstream: string;
  bucket: string;
  account: string | null;
  attendees: string[];
  tldr: string;
  // Customer contacts the meeting surfaced that are missing from the account
  // note; written (best-effort) alongside the meeting on approval.
  contactsToAdd: {
    accountPath: string;
    accountName: string;
    names: string[];
  } | null;
  seriesName: string | null; // matched rolling series, display only
}

// A rolling-series refresh for one filed meeting. The AI output (logBullets +
// currentState) is frozen at staging; the deterministic merge
// (applyMeetingToSeries) runs at execution time against a FRESH read of the
// series doc, so a doc that changed between staging and approval is never
// clobbered.
export interface SeriesUpdatePayload {
  seriesPath: string;
  seriesName: string;
  cadence?: string;
  date: string; // meeting date YYYY-MM-DD
  meetingTitle: string;
  meetingBasename: string;
  logBullets: string[];
  currentState: string;
}

export type ProposalPayload = MeetingFilePayload | SeriesUpdatePayload;

export interface ProposalRow {
  id: number;
  kind: ProposalKind;
  dedupeKey: string | null;
  parentId: number | null;
  payload: unknown;
  summary: string | null;
  status: ProposalStatus;
  model: string | null;
  error: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  executedAt: Date | null;
}
