import { NextResponse, type NextRequest } from "next/server";
import { vaultConfigured } from "@/lib/vault";
import { editAccountNote, WriteBackError } from "@/lib/writeback";
import type { AccountEdit, EditableContact } from "@/lib/accountEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Milestone 2: write an edited account note back to the vault as a commit.
export async function POST(req: NextRequest) {
  if (!vaultConfigured()) {
    return NextResponse.json({ error: "Vault not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path || !path.startsWith("300 Merit/Customers/") || !path.endsWith(".md")) {
    return NextResponse.json(
      { error: "A valid customer account path is required." },
      { status: 400 },
    );
  }

  const edit = coerceEdit(body?.edit);
  if (!edit) {
    return NextResponse.json({ error: "Malformed edit payload." }, { status: 400 });
  }

  try {
    const res = await editAccountNote(path, edit);
    return NextResponse.json({ ok: true, commit: res.commitSha });
  } catch (err) {
    if (err instanceof WriteBackError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const opt = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

function coerceEdit(raw: unknown): AccountEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const contacts: EditableContact[] = Array.isArray(e.contacts)
    ? e.contacts
        .map((c): EditableContact | null => {
          const o = (c ?? {}) as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name.trim() : "";
          if (!name) return null;
          return { name, title: opt(o.title), email: opt(o.email), phone: opt(o.phone) };
        })
        .filter((c): c is EditableContact => c !== null)
    : [];

  return {
    type: opt(e.type),
    region: opt(e.region),
    stage: opt(e.stage),
    status: opt(e.status),
    accountNumber: opt(e.accountNumber),
    overview: typeof e.overview === "string" ? e.overview : "",
    contacts,
  };
}
