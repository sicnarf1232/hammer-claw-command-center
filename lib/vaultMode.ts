// VAULT_MODE gate for GitHub writes (DB-CUTOVER stage 4). One choke point in
// lib/github.ts consults this; individual writers never check it themselves.
//
//   readonly   - only the deliberate export may write; everything else throws
//   readwrite  - writes commit to the vault (pre-cutover behavior; set
//                VAULT_MODE=readwrite explicitly to restore it)
//
// DEFAULT IS READONLY as of the cutover flip (2026-07-07): the app database
// is the source of truth and the vault is written only by the export. This
// commit also flipped CLAUDE.md rule 2.

export type VaultMode = "readonly" | "readwrite";

export function vaultMode(): VaultMode {
  return process.env.VAULT_MODE === "readwrite" ? "readwrite" : "readonly";
}

export class VaultReadOnlyError extends Error {
  constructor(path?: string) {
    super(
      `Vault is read-only (VAULT_MODE). Writes go to the app database; the vault is written only by the explicit export.${path ? ` Blocked write: ${path}` : ""}`,
    );
    this.name = "VaultReadOnlyError";
  }
}
