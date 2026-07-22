// Propose-then-confirm for AI vault writes (Phase 1). Model output is staged
// as a pending proposal; nothing touches the vault until Jordan approves it in
// the review queue on /meetings. Payloads carry everything execution needs, so
// approval never re-runs the AI.

import type { OwnerClass } from "@/lib/ai";

export type ProposalKind = "meeting-file" | "series-update";

// Review state of a proposed action (docs/decisions/meeting-linking-rules.md,
// "Action ownership states"). Slice B only ever emits `group` (a team/function
// owner) or `unassigned` (an individual owner or none, pending the resolver);
// `assigned` / `suggested` / `ambiguous` / `rejected` are produced by the
// people-linking engine and the review UI in later slices.
export type ActionReviewState =
  | "assigned"
  | "suggested"
  | "ambiguous"
  | "unassigned"
  | "group"
  | "rejected";

// The structured linking contract for one extracted meeting action (Slice B).
// It carries a stable, line-independent identity, an IMMUTABLE record of the
// original extraction, Jordan's editable/approved version, and the review
// scaffolding the UI (Slice C) and the persistence writer (Slice D) will need.
// In Slice B the candidate arrays are always empty and identities are left
// unresolved: no person or account is guessed here. The audit fields satisfy
// docs/decisions/meeting-linking-rules.md "Audit requirements" and AGENTS.md.
export interface MeetingActionProposal {
  actionId: string; // stable id (lib/meetingActionIdentity.ts), minted once
  fingerprint: string; // normalized-text hash of the CURRENT text; hint, not identity

  // ---- original extraction: immutable audit record of the first extraction ----
  originalText: string; // action text as first extracted, never edited
  originalOwnerText: string | null; // owner as first extracted, never edited
  sourceRef: string; // action-level source reference to the original extraction
  provenance: string; // model id or deterministic matcher that produced the extraction

  // ---- approved / editable: Jordan's version (starts equal to the original) ----
  text: string; // editable action text (owner prefix stripped)
  ownerText: string | null; // editable owner ("Scott", "Operations", ...)
  ownerClass: OwnerClass; // me | team | customer | unknown (from the roster pass)
  candidatePersonIds: number[]; // resolver output; [] in Slice B (unresolved)
  candidateAccountIds: number[]; // resolver output; [] in Slice B (unresolved)
  reasons: string[]; // human-readable evidence; populated by the resolver later
  confidence: "high" | "medium" | "low" | "none";
  ownerReviewState: ActionReviewState; // owner link review state
  accountReviewState: ActionReviewState; // account link review state (separate axis)
  isJordans: boolean; // true => a real task in Jordan's views
  due: string | null; // YYYY-MM-DD if concrete
  dueText: string | null; // raw due phrase when not concrete
}

// Current version of the structured meeting-action contract. Bumped when the
// shape changes so consumers can tell a legacy payload from a current one.
export const MEETING_ACTION_CONTRACT_VERSION = 1;

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
  // Slice B additions, all OPTIONAL so already-pending legacy payloads (staged
  // before this slice) remain valid and execute unchanged. `content` stays the
  // canonical rendering; `actions` is additive structured metadata.
  contractVersion?: number; // MEETING_ACTION_CONTRACT_VERSION when `actions` set
  actions?: MeetingActionProposal[]; // structured, stably-identified actions
  relatedAccounts?: string[]; // accounts the meeting is ABOUT (📎), display names
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
