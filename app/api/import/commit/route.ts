import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { dbConfigured, getDb } from "@/lib/db";
import { getDocument, openDocumentBlob } from "@/lib/documents";
import { ensurePricingSchema } from "@/lib/pricing/schema";
import {
  parseSpreadsheet,
  headerSignature,
  applyMapping,
  planAgreementCommit,
  type ColumnMapping,
  type ExistingAgreement,
} from "@/lib/importer/engine";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function rowsOf(res: unknown): Record<string, unknown>[] {
  return Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : (((res as { rows?: unknown })?.rows ?? []) as Record<string, unknown>[]);
}

// Step 2 of the price import: Jordan CONFIRMED the mapping. This is the only
// path that writes agreement facts. Re-parses the stored file (never trusts a
// client-side parse), applies the confirmed mapping, resolves accounts
// (upload-time picker wins over a mapped account column), supersedes live
// same-tier rows, stamps confirmed_by, and saves the ruleset for next time.
// body: { documentId, accountId?, mapping, saveRulesetName? }
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const documentId = Number(body?.documentId);
  const pickerAccountId = Number.isInteger(body?.accountId) ? Number(body.accountId) : null;
  const mapping = body?.mapping as ColumnMapping | undefined;
  if (!Number.isInteger(documentId) || !mapping?.columns || !mapping?.defaults) {
    return NextResponse.json(
      { error: "documentId and a confirmed mapping are required." },
      { status: 400 },
    );
  }
  try {
    await ensurePricingSchema();
    const db = getDb();
    const doc = await getDocument(documentId);
    if (!doc?.blobUrl) {
      return NextResponse.json({ error: "Source document not found." }, { status: 404 });
    }
    const blob = await openDocumentBlob(doc.blobUrl);
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Could not read the stored file." }, { status: 502 });
    }
    const bytes = new Uint8Array(
      await new Response(blob.stream as unknown as ReadableStream).arrayBuffer(),
    );
    const sheet = parseSpreadsheet(bytes);
    const today = todayISO();
    const { drafts, issues } = applyMapping(sheet, mapping, today);

    // Resolve accounts: picker wins; else the mapped account column by name.
    const accountRows = rowsOf(
      await db.execute(sql`select id, name from accounts`),
    ).map((r) => ({ id: Number(r.id), name: String(r.name) }));
    const byName = new Map(accountRows.map((a) => [a.name.trim().toLowerCase(), a.id]));
    const resolved: Array<(typeof drafts)[number] & { accountId: number }> = [];
    const skipped: Array<{ rowIndex: number; issue: string }> = [...issues];
    for (const d of drafts) {
      const accountId =
        pickerAccountId ??
        (d.accountName ? byName.get(d.accountName.trim().toLowerCase()) ?? null : null);
      if (accountId == null) {
        skipped.push({
          rowIndex: d.rowIndex,
          issue: d.accountName
            ? `unknown account "${d.accountName}"`
            : "no account (pick one or map an account column)",
        });
        continue;
      }
      resolved.push({ ...d, accountId });
    }

    const accountIds = [...new Set(resolved.map((d) => d.accountId))];
    const existing: ExistingAgreement[] = accountIds.length
      ? rowsOf(
          await db.execute(sql`
            select id, account_id, part_number, min_qty, effective_date, expires, superseded_by
            from account_price_agreements
            where account_id = any(${accountIds})
          `),
        ).map((r) => ({
          id: Number(r.id),
          accountId: Number(r.account_id),
          partNumber: String(r.part_number),
          minQty: Number(r.min_qty),
          effectiveDate: String(r.effective_date),
          expires: r.expires == null ? null : String(r.expires),
          supersededBy: r.superseded_by == null ? null : Number(r.superseded_by),
        }))
      : [];
    const plan = planAgreementCommit(existing, resolved, today);

    // Ruleset upsert (before the batch row so we can reference its id).
    const signature = headerSignature(sheet.headers);
    let rulesetId: number | null = null;
    const saveName = typeof body?.saveRulesetName === "string" ? body.saveRulesetName.trim() : "";
    if (saveName) {
      const up = rowsOf(
        await db.execute(sql`
          insert into import_rulesets (name, header_signature, filename_pattern, mapping)
          values (${saveName}, ${signature}, ${doc.fileName ?? null}, ${JSON.stringify(mapping)}::jsonb)
          on conflict (header_signature)
          do update set name = excluded.name, mapping = excluded.mapping,
                        updated_at = now(), last_used_at = now()
          returning id
        `),
      );
      rulesetId = up[0] ? Number(up[0].id) : null;
    } else {
      await db.execute(
        sql`update import_rulesets set last_used_at = now() where header_signature = ${signature}`,
      );
    }

    // Execute: insert each agreement, then stamp superseded_by on the rows it
    // replaces. confirmed_by is Jordan by construction (he pressed Commit).
    const insertedIds: number[] = [];
    for (const d of plan.insert) {
      const ins = rowsOf(
        await db.execute(sql`
          insert into account_price_agreements
            (account_id, part_number, unit_price, currency, min_qty,
             effective_date, expires, origin, source_document_id,
             import_batch_id, confirmed_by)
          values (${d.accountId}, ${d.partNumber}, ${d.unitPrice}, ${d.currency},
                  ${d.minQty}, ${d.effectiveDate}, ${d.expires}, ${d.origin},
                  ${documentId}, null, 'jordan')
          returning id
        `),
      );
      insertedIds.push(Number(ins[0]?.id));
    }
    let superseded = 0;
    for (const s of plan.supersede) {
      const byId = insertedIds[s.byInsertIndex];
      if (!byId) continue;
      await db.execute(sql`
        update account_price_agreements
        set superseded_by = ${byId}, updated_at = now()
        where id = ${s.existingId} and superseded_by is null
      `);
      superseded += 1;
    }
    const batch = rowsOf(
      await db.execute(sql`
        insert into import_batches
          (ruleset_id, source_document_id, account_id, file_name,
           row_count, inserted, superseded, skipped)
        values (${rulesetId}, ${documentId}, ${pickerAccountId}, ${doc.fileName ?? null},
                ${sheet.rows.length}, ${insertedIds.length}, ${superseded}, ${skipped.length})
        returning id
      `),
    );
    if (batch[0] && insertedIds.length) {
      await db.execute(sql`
        update account_price_agreements set import_batch_id = ${Number(batch[0].id)}
        where id = any(${insertedIds})
      `);
    }

    return NextResponse.json({
      ok: true,
      inserted: insertedIds.length,
      superseded,
      skipped,
      rulesetSaved: rulesetId != null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed." },
      { status: 500 },
    );
  }
}
