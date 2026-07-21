import { eq, inArray } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { emailExtractions } from "@/lib/db/schema";
import { ensureFirehoseSchema } from "@/lib/firehose/schema";
import { aiConfigured, extractEmailAsks } from "@/lib/ai";

// Cache for the AI ask/provide extraction (dev-feedback #14 Part 2). One row
// per email, computed lazily and reused across page views and matching calls
// rather than re-run on every render, mirroring ensureTriageForKeys's
// lazy-compute-then-cache shape in lib/firehose/triage.ts. Extraction is the
// only AI step in the smart-linkage feature; everything downstream of this
// module (lib/taskEmailMatch.ts's phraseOverlapsText/scoreTaskContentPair)
// is a plain deterministic string check.

export interface EmailExtraction {
  asks: string[];
  provides: string[];
  model: string | null;
}

// Primary direction (thread view): the currently open thread's latest
// inbound message, where the full body is already loaded. Computes and
// caches on first view, reads the cache on every view after that.
export async function ensureEmailExtraction(
  emailId: number,
  subject: string,
  bodyText: string,
): Promise<EmailExtraction | null> {
  if (!dbConfigured() || !aiConfigured()) return null;
  await ensureFirehoseSchema();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(emailExtractions)
    .where(eq(emailExtractions.emailId, emailId))
    .limit(1);
  if (existing) {
    return { asks: existing.asks ?? [], provides: existing.provides ?? [], model: existing.model };
  }
  if (!subject.trim() && !bodyText.trim()) return { asks: [], provides: [], model: null };
  try {
    const result = await extractEmailAsks({ subject, bodyText });
    await db
      .insert(emailExtractions)
      .values({ emailId, asks: result.asks, provides: result.provides, model: result.modelUsed })
      .onConflictDoUpdate({
        target: emailExtractions.emailId,
        set: { asks: result.asks, provides: result.provides, model: result.modelUsed },
      });
    return { asks: result.asks, provides: result.provides, model: result.modelUsed };
  } catch (err) {
    console.error("[emailExtraction] failed for", emailId, err);
    return null;
  }
}

// Secondary direction (tasks page: a task against recent inbound emails
// generally). Read-only and best effort: NEVER triggers a fresh AI call, so
// a page render with many candidate emails stays bounded. Emails without a
// cached row simply contribute no asks/provides signal there; Part 1's
// stricter qualifying bar (part number / named sender) still applies to
// them on its own.
export async function getCachedEmailExtractions(
  emailIds: number[],
): Promise<Map<number, EmailExtraction>> {
  const out = new Map<number, EmailExtraction>();
  if (!dbConfigured() || !emailIds.length) return out;
  try {
    await ensureFirehoseSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(emailExtractions)
      .where(inArray(emailExtractions.emailId, emailIds));
    for (const r of rows) {
      out.set(r.emailId, { asks: r.asks ?? [], provides: r.provides ?? [], model: r.model });
    }
  } catch {
    /* table absent or query failed; best effort */
  }
  return out;
}
