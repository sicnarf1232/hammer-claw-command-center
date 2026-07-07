// Pure diff/upsert planner for the cutover seed (Phase 2). Replaces the old
// wipe-and-reload: rows the APP created (origin 'app' or 'proposal') are never
// updated or deleted by a re-seed; rows the seed created (origin 'seed') are
// matched by natural key and inserted / updated / removed to mirror the vault.
// Unchanged rows keep their ids, so firehose FKs (emails.account_id/person_id)
// stay valid across re-seeds. No IO here; unit-tested.

export interface ExistingRow {
  id: number;
  key: string;
  origin: string; // 'seed' | 'app' | 'proposal' | anything else = protected
  fields: Record<string, unknown>;
}

export interface IncomingRow {
  key: string;
  fields: Record<string, unknown>;
}

export interface TablePlan {
  insert: IncomingRow[];
  update: Array<{ id: number; fields: Record<string, unknown> }>;
  removeIds: number[];
  /** Matched rows whose fields already equal the incoming ones. */
  unchanged: number;
  /** Non-seed rows (matched or not) that the plan deliberately left alone. */
  protectedRows: number;
}

export interface PlanCounts {
  insert: number;
  update: number;
  remove: number;
  unchanged: number;
  protected: number;
}

export function planCounts(p: TablePlan): PlanCounts {
  return {
    insert: p.insert.length,
    update: p.update.length,
    remove: p.removeIds.length,
    unchanged: p.unchanged,
    protected: p.protectedRows,
  };
}

// Order-insensitive deep equality for plain JSON-ish values (jsonb round-trips
// reorder object keys; null and undefined are treated as the same absence).
export function fieldsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return canon(a) === canon(b);
}

function canon(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function planTable(
  existing: ExistingRow[],
  incoming: IncomingRow[],
): TablePlan {
  const byKey = new Map<string, ExistingRow>();
  for (const row of existing) {
    // First row wins on a duplicate key; later duplicates become removable
    // seed orphans below (a duplicate natural key means the old wipe seeded
    // twice or the vault has a real dupe; the report surfaces it as removes).
    if (!byKey.has(row.key)) byKey.set(row.key, row);
  }

  const matchedIds = new Set<number>();
  const insert: IncomingRow[] = [];
  const update: TablePlan["update"] = [];
  let unchanged = 0;
  let protectedRows = 0;

  for (const inc of incoming) {
    const cur = byKey.get(inc.key);
    if (!cur) {
      insert.push(inc);
      continue;
    }
    matchedIds.add(cur.id);
    if (cur.origin !== "seed") {
      // The app owns this row now; the vault no longer wins.
      protectedRows += 1;
      continue;
    }
    if (fieldsEqual(cur.fields, inc.fields)) unchanged += 1;
    else update.push({ id: cur.id, fields: inc.fields });
  }

  const removeIds: number[] = [];
  for (const row of existing) {
    if (matchedIds.has(row.id)) continue;
    if (row.origin === "seed") removeIds.push(row.id);
    else protectedRows += 1;
  }

  return { insert, update, removeIds, unchanged, protectedRows };
}
