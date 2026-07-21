import { NextResponse, type NextRequest } from "next/server";
import { searchContacts } from "@/lib/peopleSearch";
import { recipientHistorySuggestions } from "@/lib/recipientHistory";
import { mergeRecipientSuggestions, type RecipientSuggestion } from "@/lib/recipientSuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 8;

// Recipient typeahead for the compose To/Cc fields (dev-feedback #15): name/
// email contact matches rank first, email-history suggestions (frequent
// co-recipients of whatever is already entered, or most-recent when nothing
// is entered yet) fill in below, merged and deduped.
// GET /api/people/search?q=<partial text>&exclude=<comma addresses already
// entered, in this field or the other one>
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const exclude = (req.nextUrl.searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const [contacts, history] = await Promise.all([
      searchContacts(q, LIMIT),
      recipientHistorySuggestions(exclude, LIMIT),
    ]);

    const contactSuggestions: RecipientSuggestion[] = contacts.map((c) => ({
      name: c.name,
      email: c.email,
      source: "contact",
    }));
    let historySuggestions: RecipientSuggestion[] = history.map((h) => ({
      name: h.name,
      email: h.email,
      source: "history",
    }));
    if (q) {
      const needle = q.toLowerCase();
      historySuggestions = historySuggestions.filter(
        (s) => (s.name ?? "").toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle),
      );
    }

    const results = mergeRecipientSuggestions(contactSuggestions, historySuggestions, {
      exclude,
      limit: LIMIT,
    });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 500 },
    );
  }
}
