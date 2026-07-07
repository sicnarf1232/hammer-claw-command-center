// VAULT_MODE gate for GitHub writes (DB-CUTOVER stage 4). One choke point in
// lib/github.ts consults this; individual writers never check it themselves.
//
//   readwrite  - writes commit to the vault (pre-cutover behavior)
//   readonly   - only the deliberate export may write; everything else throws
//
// Default is readwrite until the cutover flip (Phase 2 step 8) changes the
// default to readonly in the same commit that flips CLAUDE.md rule 2.

export type VaultMode = "readonly" | "readwrite";

export function vaultMode(): VaultMode {
  return process.env.VAULT_MODE === "readonly" ? "readonly" : "readwrite";
}

export class VaultReadOnlyError extends Error {
  constructor(path?: string) {
    super(
      `Vault is read-only (VAULT_MODE). Writes go to the app database; the vault is written only by the explicit export.${path ? ` Blocked write: ${path}` : ""}`,
    );
    this.name = "VaultReadOnlyError";
  }
}
