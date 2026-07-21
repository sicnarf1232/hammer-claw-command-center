import { desc, sql } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emails as emailsT } from "@/lib/db/schema";
import { isSelfAddress } from "@/lib/firehose/map";

// Suggested recipients from email history (dev-feedback #15, part 2): people
// who have frequently been co-recipients alongside whoever is already
// entered, or, when nothing is entered yet, the most-recently-corresponded-
// with people. Reads ONLY address + timestamp columns, never body_text /
// body_html, and caps the row scan, per this app's Neon egress discipline
// (see lib/firehose/read.ts's SCAN_COLUMNS comment for the house convention;
// this query runs on every keystroke's debounce, so it stays cheap).

const ROW_LIMIT = 400;

export interface HistorySuggestion {
  name: string | null;
  email: string;
  count: number;
  lastAt: number; // epoch ms, 0 when unknown
}

export async function recipientHistorySuggestions(
  context: string[],
  limit = 8,
): Promise<HistorySuggestion[]> {
  if (!dbConfigured()) return [];
  try {
    const db = getDb();
    const rows = await db
      .select({
        fromEmail: emailsT.fromEmail,
        fromName: emailsT.fromName,
        toAddrs: emailsT.toAddrs,
        cc: emailsT.cc,
        recipients: emailsT.recipients,
        sentAt: emailsT.sentAt,
        receivedAt: emailsT.receivedAt,
        createdAt: emailsT.createdAt,
      })
      .from(emailsT)
      .orderBy(desc(sql`coalesce(${emailsT.sentAt}, ${emailsT.receivedAt}, ${emailsT.createdAt})`))
      .limit(ROW_LIMIT);

    const ctx = new Set(context.map((c) => c.toLowerCase().trim()).filter(Boolean));
    const nameByEmail = new Map<string, string>();
    const freq = new Map<string, number>();
    const lastAt = new Map<string, number>();

    for (const r of rows) {
      const at = (r.sentAt ?? r.receivedAt ?? r.createdAt)?.getTime() ?? 0;
      const addrs = new Set<string>();
      if (r.fromEmail) {
        const e = r.fromEmail.toLowerCase();
        addrs.add(e);
        if (r.fromName) nameByEmail.set(e, r.fromName);
      }
      for (const a of r.toAddrs ?? []) addrs.add(a.toLowerCase());
      for (const a of r.cc ?? []) addrs.add(a.toLowerCase());
      for (const p of r.recipients ?? []) {
        if (!p.email) continue;
        const e = p.email.toLowerCase();
        addrs.add(e);
        if (p.name) nameByEmail.set(e, p.name);
      }

      const rowTouchesContext = ctx.size === 0 || Array.from(addrs).some((a) => ctx.has(a));
      if (!rowTouchesContext) continue;

      for (const a of addrs) {
        if (!a || isSelfAddress(a) || ctx.has(a)) continue;
        freq.set(a, (freq.get(a) ?? 0) + 1);
        if (!lastAt.has(a) || at > (lastAt.get(a) ?? 0)) lastAt.set(a, at);
      }
    }

    const out: HistorySuggestion[] = Array.from(freq.entries()).map(([email, count]) => ({
      email,
      name: nameByEmail.get(email) ?? null,
      count,
      lastAt: lastAt.get(email) ?? 0,
    }));
    out.sort((a, b) => (ctx.size ? b.count - a.count || b.lastAt - a.lastAt : b.lastAt - a.lastAt));
    return out.slice(0, limit);
  } catch {
    return [];
  }
}
