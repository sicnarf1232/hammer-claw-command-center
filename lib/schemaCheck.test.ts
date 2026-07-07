import { describe, expect, it } from "vitest";
import { diffSchema, summarizeFks, EXPECTED_SCHEMA, type LiveColumn } from "./schemaCheck";

const EXPECTED = {
  accounts: ["id", "name", "slug"],
  documents: ["id", "title", "spec"],
} as const;

function live(...pairs: Array<[string, string]>): LiveColumn[] {
  return pairs.map(([table, column]) => ({ table, column }));
}

describe("diffSchema", () => {
  it("reports a clean match", () => {
    const d = diffSchema(
      live(
        ["accounts", "id"], ["accounts", "name"], ["accounts", "slug"],
        ["documents", "id"], ["documents", "title"], ["documents", "spec"],
      ),
      EXPECTED as unknown as Record<string, string[]>,
    );
    expect(d.missingTables).toEqual([]);
    expect(d.extraTables).toEqual([]);
    expect(d.missingColumns).toEqual([]);
    expect(d.extraColumns).toEqual([]);
  });

  it("flags a missing column (the documents.spec case)", () => {
    const d = diffSchema(
      live(
        ["accounts", "id"], ["accounts", "name"], ["accounts", "slug"],
        ["documents", "id"], ["documents", "title"],
      ),
      EXPECTED as unknown as Record<string, string[]>,
    );
    expect(d.missingColumns).toEqual([{ table: "documents", column: "spec" }]);
  });

  it("flags a missing table without listing its columns as missing", () => {
    const d = diffSchema(
      live(["accounts", "id"], ["accounts", "name"], ["accounts", "slug"]),
      EXPECTED as unknown as Record<string, string[]>,
    );
    expect(d.missingTables).toEqual(["documents"]);
    expect(d.missingColumns).toEqual([]);
  });

  it("flags extra live columns and tables", () => {
    const d = diffSchema(
      live(
        ["accounts", "id"], ["accounts", "name"], ["accounts", "slug"],
        ["accounts", "legacy_code"],
        ["documents", "id"], ["documents", "title"], ["documents", "spec"],
        ["__drizzle_migrations", "id"],
      ),
      EXPECTED as unknown as Record<string, string[]>,
    );
    expect(d.extraColumns).toEqual([{ table: "accounts", column: "legacy_code" }]);
    expect(d.extraTables).toEqual(["__drizzle_migrations"]);
  });

  it("uses the real EXPECTED_SCHEMA by default", () => {
    const d = diffSchema([{ table: "app_meta", column: "key" }]);
    expect(d.missingTables).toContain("documents");
    expect(d.missingColumns.some((c) => c.table === "app_meta" && c.column === "value")).toBe(true);
  });
});

describe("summarizeFks", () => {
  it("groups and sorts constraints by table", () => {
    expect(
      summarizeFks([
        { table: "tasks", constraint: "tasks_meeting_id_fk" },
        { table: "tasks", constraint: "tasks_account_id_fk" },
        { table: "people", constraint: "people_account_id_fk" },
      ]),
    ).toEqual({
      tasks: ["tasks_account_id_fk", "tasks_meeting_id_fk"],
      people: ["people_account_id_fk"],
    });
  });

  it("returns an empty object for no FKs (self-provisioned DB)", () => {
    expect(summarizeFks([])).toEqual({});
  });
});

describe("EXPECTED_SCHEMA sanity", () => {
  it("covers every table group the app provisions", () => {
    for (const t of [
      "accounts", "people", "meetings", "tasks", "emails", "email_triage",
      "task_meta", "app_settings", "documents", "brand_kits",
    ]) {
      expect(EXPECTED_SCHEMA[t]).toBeDefined();
    }
  });

  it("expects the two historically unverified columns", () => {
    expect(EXPECTED_SCHEMA.documents).toContain("spec");
    expect(EXPECTED_SCHEMA.brand_kits).toContain("paper");
  });
});
