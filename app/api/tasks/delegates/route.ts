import { NextResponse, type NextRequest } from "next/server";
import { searchPeople } from "@/lib/peopleSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delegate typeahead for the /tasks "Delegated to" field (dev-feedback #20):
// name/email search over the same people table RecipientField's
// /api/people/search already searches, via a lighter-weight sibling
// (lib/peopleSearch.ts's searchPeople) that also returns the numeric id the
// delegate wire format needs. GET ?q=<partial name or email>
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await searchPeople(q, 8);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 500 },
    );
  }
}
