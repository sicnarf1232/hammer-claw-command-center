import type { Roster } from "@/lib/vault/types";
import { classifyName } from "@/lib/vault/roster";
import { Chip } from "./chips";

// Render an attendee colored by roster classification: Merit vs customer.
// Unknown names render gray (docs/02: do not crash, default unclassified).
export function Attendee({ name, roster }: { name: string; roster: Roster }) {
  const entry = classifyName(roster, name);
  const tone =
    entry?.classification === "merit"
      ? "merit"
      : entry?.classification === "customer"
        ? "customer"
        : "gray";
  return <Chip tone={tone}>{name}</Chip>;
}
