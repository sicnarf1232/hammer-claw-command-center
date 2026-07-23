import { createHash } from "node:crypto";

// Stable identity for meeting action items (Slice B).
//
// Slice A proved the current writer keys actions by Markdown source line
// (lib/meetingActionReconcile.ts), so reorder/edit/remove corrupt identity.
// This module mints a stable, line-independent action id that is carried
// through proposal review, task creation, note editing, and activity history,
// exactly as docs/decisions/meeting-linking-rules.md ("Stable action identity")
// requires. It resolves NO people or accounts; it only assigns identity.
//
// Two distinct ideas live here:
//
//   fingerprint  a hash of the normalized action TEXT. It is only an extraction
//                HINT used to re-associate the same extraction on a re-pull. It
//                changes when the wording changes and MUST NOT be treated as the
//                permanent id.
//   actionId     the permanent, opaque id. Minted ONCE at extraction from
//                (granolaId + fingerprint + duplicate index) so re-pulling an
//                unedited note reproduces the same ids (idempotent reprocessing)
//                and reordering lines does not change them. After minting it is
//                carried, never recomputed, so editing the wording keeps it.

export const ACTION_ID_PREFIX = "act_";

// Lowercase Crockford-style base32 alphabet (no i/l/o/u), digits first.
const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";

function base32(bytes: Buffer, chars: number): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >>> bits) & 31];
      if (out.length === chars) return out;
    }
  }
  if (out.length < chars && bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out.slice(0, chars);
}

// Normalize action text for fingerprinting: trim, collapse internal whitespace,
// lowercase, drop trailing sentence punctuation. Wording tweaks that do not
// change meaning still change the fingerprint; that is fine, the fingerprint is
// only a hint. The permanent id does not depend on this after minting.
export function normalizeActionText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.;:,\s]+$/, "");
}

// Extraction hint: a short, deterministic hash of the normalized text. Survives
// reorder (text unchanged), changes on edit. Never the permanent identity.
export function actionFingerprint(text: string): string {
  return createHash("sha256")
    .update(normalizeActionText(text))
    .digest("hex")
    .slice(0, 16);
}

// Mint one permanent action id from its seed parts. Kept private-ish: callers
// use mintActionIdsForNote so duplicate-text disambiguation is handled in one
// place. `dupIndex` is the occurrence number among same-fingerprint actions in
// the same note (0 for the normal unique-text case), so the seed excludes line
// position and reorder stays stable.
export function mintActionId(
  granolaId: string,
  fingerprint: string,
  dupIndex = 0,
): string {
  const digest = createHash("sha256")
    .update(`${granolaId}#${fingerprint}#${dupIndex}`)
    .digest();
  return ACTION_ID_PREFIX + base32(digest, 22);
}

export interface MintedActionId {
  actionId: string;
  fingerprint: string;
}

// Assign stable ids to every action in a note, in order. Two byte-identical
// action lines get consecutive dupIndex values so their ids differ; identical
// lines are interchangeable, so this stays reorder-invariant for DISTINCT
// actions (the only case that matters). Pure and order-preserving.
export function mintActionIdsForNote(
  granolaId: string,
  texts: string[],
): MintedActionId[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const fingerprint = actionFingerprint(text);
    const dupIndex = seen.get(fingerprint) ?? 0;
    seen.set(fingerprint, dupIndex + 1);
    return { actionId: mintActionId(granolaId, fingerprint, dupIndex), fingerprint };
  });
}
