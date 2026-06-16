import type { Roster, Workstream } from "@/lib/vault/types";
import { classifyName } from "@/lib/vault/roster";
import { WORKSTREAMS } from "@/lib/workstreams";

export interface EmailLike {
  fromName?: string | null;
  fromEmail?: string | null;
  toAddrs?: string[] | null;
  subject?: string | null;
}

export interface Classification {
  workstream?: Workstream;
  account?: string;
  reason: string; // short human explanation, shown in /inbox
}

// Suggest a workstream + likely account for a flagged email. Best-effort and
// editable in /inbox; never auto-files. Deterministic, no AI needed.
export function classifyEmail(
  email: EmailLike,
  roster: Roster,
  accountNames: string[] = [],
): Classification {
  const to = (email.toAddrs ?? []).map((a) => a.toLowerCase());
  const reasons: string[] = [];

  // 1) Workstream by the recipient identity it was sent to.
  let workstream: Workstream | undefined;
  for (const ws of Object.values(WORKSTREAMS)) {
    if (ws.email && to.includes(ws.email.toLowerCase())) {
      workstream = ws.workstream;
      reasons.push(`addressed to ${ws.label} (${ws.email})`);
      break;
    }
  }

  // 2) Fallback: workstream by sender domain.
  const senderDomain = (email.fromEmail ?? "").split("@")[1]?.toLowerCase();
  if (!workstream && senderDomain) {
    if (senderDomain.endsWith("merit.com")) {
      workstream = "merit";
      reasons.push(`sender domain ${senderDomain}`);
    }
  }

  // 3) Account: sender in the roster as a customer contact -> their account.
  let account: string | undefined;
  if (email.fromName) {
    const entry = classifyName(roster, email.fromName);
    if (entry?.classification === "customer" && entry.account) {
      account = entry.account;
      reasons.push(`${email.fromName} is a contact at ${account}`);
      if (!workstream) workstream = "merit"; // customer contacts are Merit accounts
    }
  }

  // 4) Account by name appearing in the subject (known account list).
  if (!account && email.subject) {
    const subj = email.subject.toLowerCase();
    const hit = accountNames.find((n) => n && subj.includes(n.toLowerCase()));
    if (hit) {
      account = hit;
      reasons.push(`subject mentions ${hit}`);
    }
  }

  return {
    workstream,
    account,
    reason: reasons.length ? reasons.join("; ") : "no strong signal, please pick",
  };
}
