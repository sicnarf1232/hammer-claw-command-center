import type { Workstream } from "./vault/types";

// Workstream identity table (docs/01). Any output that carries an identity
// (email draft, filed note, PDF) must use the right folder, email, and brand.
// Getting this wrong is the highest-consequence failure mode, so unknown or
// missing identity must stop and ask, never guess.

export interface WorkstreamIdentity {
  workstream: Workstream;
  label: string;
  folder: string; // vault folder prefix for filed notes
  email: string | null; // sender identity; null = ask Jordan before sending
  brand: string | null;
  accent: string; // tailwind text color class for chips
  // Folder where flagged emails get filed for this workstream.
  inboxFolder: string | null;
}

// NOTE: Sloan's sending email is marked TBD in docs/01 ("ask"). Until Jordan
// provides it, sloan email is null and the reply flow refuses to draft as sloan.
// Tracked in PUNCHLIST.md.
export const WORKSTREAMS: Record<Workstream, WorkstreamIdentity> = {
  merit: {
    workstream: "merit",
    label: "Merit",
    folder: "300 Merit",
    email: "jordan.francis@merit.com",
    brand: "Merit Medical OEM",
    accent: "text-merit",
    inboxFolder: "300 Merit/Inbox",
  },
  nextech: {
    workstream: "nextech",
    label: "Nextech",
    folder: "400 Nextech",
    email: "jordan@nextechadv.ai",
    brand: "Nextech AI",
    accent: "text-nextech",
    inboxFolder: "400 Nextech/Inbox",
  },
  sloan: {
    workstream: "sloan",
    label: "Sloan",
    folder: "500 Sloan",
    email: null, // TBD — ask Jordan (PUNCHLIST)
    brand: "Sloan AI",
    accent: "text-sloan",
    inboxFolder: null, // 500 Sloan has no Inbox/ in the folder model; ask before filing
  },
  personal: {
    workstream: "personal",
    label: "Personal",
    folder: "600 Personal",
    email: null,
    brand: null,
    accent: "text-personal",
    inboxFolder: "600 Personal/Inbox",
  },
  shared: {
    workstream: "shared",
    label: "Shared",
    folder: "",
    email: null,
    brand: null,
    accent: "text-shared",
    inboxFolder: null,
  },
};

export function identityFor(ws: Workstream): WorkstreamIdentity {
  return WORKSTREAMS[ws];
}

// Can the app send/draft as this workstream without asking Jordan first?
export function canDraftAs(ws: Workstream): boolean {
  return WORKSTREAMS[ws].email !== null;
}
