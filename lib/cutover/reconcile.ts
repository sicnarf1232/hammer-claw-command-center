import { personNameMatches, normalizePersonName } from "@/lib/vault/people";

// Pure reconciliation for the DB cutover (docs/DB-CUTOVER.md). Takes the data
// parsed from the vault (accounts, roster, meetings, series) and produces one
// clean record per person / account / meeting / task / series, with the
// who-is-who deduped into people + aliases. Ambiguous names are flagged for
// in-app review, never silently merged. No IO here, so it is unit-tested.

export interface InAccount {
  name: string;
  slug: string;
  type?: string;
  region?: string;
  stage?: string;
  status?: string;
  accountNumber?: string;
  overview?: string;
  situations?: string[];
  links?: string[];
  sourcePath?: string;
  contacts: Array<{ name: string; title?: string; email?: string; phone?: string }>;
}
export interface InRosterEntry {
  name: string;
  classification: "merit" | "customer";
  account?: string;
}
export interface InActionItem {
  text: string;
  done: boolean;
  owner?: string;
  isJordans: boolean;
  due?: string;
  priority?: string;
  status?: string;
  description?: string;
  notes?: string;
  sourceLine: number;
}
export interface InMeeting {
  sourcePath: string;
  date?: string;
  title: string;
  customer?: string; // account display name
  attendees: string[];
  series?: string;
  topic?: string;
  granolaId?: string;
  sections?: Record<string, string>;
  bodyMarkdown?: string;
  actionItems: InActionItem[];
}
export interface InSeries {
  name: string;
  cadence?: string;
  status?: string;
  currentState?: string;
  bodyMarkdown?: string;
  sourcePath?: string;
  account?: string;
}
// A standalone vault task (getAllTasks): Jordan's real task list, living in
// task files and account notes. Distinct from meeting action items, though a
// dual-captured item can appear as both (same sourcePath:sourceLine).
export interface InStandaloneTask {
  sourcePath: string;
  sourceLine: number;
  title: string;
  done: boolean;
  due?: string;
  priority?: string;
  status?: string;
  description?: string;
  notes?: string;
  customer?: string; // display name, or "internal"
  workstream?: string;
  created?: string;
  scheduled?: string;
  thread?: string;
  completed?: string;
  fields?: Record<string, string>;
}

export type Classification = "internal" | "customer" | "unknown";

export interface PersonRec {
  key: string;
  fullName: string;
  classification: Classification;
  accountSlug?: string;
  title?: string;
  email?: string;
  phone?: string;
  isSelf: boolean;
  needsReview: boolean;
  aliases: string[];
  sourcePaths: string[];
}
export interface AccountRec {
  slug: string;
  name: string;
  type?: string;
  region?: string;
  stage?: string;
  status?: string;
  accountNumber?: string;
  overview?: string;
  situations?: string[];
  links?: string[];
  sourcePath?: string;
}
export interface MeetingRec {
  sourcePath: string;
  date?: string;
  title: string;
  accountSlug?: string;
  isInternal: boolean;
  topic?: string;
  granolaId?: string;
  sections?: Record<string, string>;
  bodyMarkdown?: string;
  seriesName?: string;
  attendeeKeys: string[];
}
export interface TaskRec {
  sourcePath: string;
  sourceLine: number;
  text: string;
  done: boolean;
  due?: string;
  priority?: string;
  status?: string;
  isJordans: boolean;
  description?: string;
  notes?: string;
  ownerKey?: string;
  accountSlug?: string;
  // Vault task contract (filled from the standalone parse when available).
  workstream?: string;
  customer?: string;
  created?: string;
  scheduled?: string;
  thread?: string;
  completed?: string;
  fields?: Record<string, string>;
}
export interface SeriesRec {
  name: string;
  cadence?: string;
  status: string;
  currentState?: string;
  bodyMarkdown?: string;
  sourcePath?: string;
  accountSlug?: string;
}
export interface ReconcileReport {
  counts: {
    accounts: number;
    people: number;
    needsReview: number;
    meetings: number;
    tasks: number;
    series: number;
  };
  merges: Array<{ person: string; alias: string }>;
  needsReview: Array<{ name: string; reason: string; candidates?: string[] }>;
  unresolvedNames: Array<{ name: string; source: string; candidates: string[] }>;
}
export interface ReconcileResult {
  accounts: AccountRec[];
  people: PersonRec[];
  meetings: MeetingRec[];
  tasks: TaskRec[];
  series: SeriesRec[];
  report: ReconcileReport;
}

const SELF = "Jordan Francis";

export function reconcile(input: {
  accounts: InAccount[];
  roster: InRosterEntry[];
  meetings: InMeeting[];
  series: InSeries[];
  standaloneTasks?: InStandaloneTask[];
}): ReconcileResult {
  const accounts: AccountRec[] = input.accounts.map((a) => ({
    slug: a.slug,
    name: a.name,
    type: a.type,
    region: a.region,
    stage: a.stage,
    status: a.status,
    accountNumber: a.accountNumber,
    overview: a.overview,
    situations: a.situations,
    links: a.links,
    sourcePath: a.sourcePath,
  }));
  const accountSlugByName = new Map<string, string>();
  for (const a of accounts) accountSlugByName.set(normalizePersonName(a.name), a.slug);
  const slugFor = (name?: string): string | undefined =>
    name ? accountSlugByName.get(normalizePersonName(name)) : undefined;

  const people: PersonRec[] = [];
  const merges: ReconcileReport["merges"] = [];
  const needsReview: ReconcileReport["needsReview"] = [];
  const unresolved: ReconcileReport["unresolvedNames"] = [];
  let pk = 0;

  // Find candidate people for a name: exact (fullName/alias) wins over fuzzy.
  const candidates = (name: string) => {
    const n = normalizePersonName(name);
    const exact = people.filter(
      (p) =>
        normalizePersonName(p.fullName) === n ||
        p.aliases.some((a) => normalizePersonName(a) === n),
    );
    const fuzzy = people.filter(
      (p) =>
        !exact.includes(p) &&
        (personNameMatches(p.fullName, name) ||
          p.aliases.some((a) => personNameMatches(a, name))),
    );
    return { exact, fuzzy };
  };

  // Upsert a person. Returns the person's key, or null when the name is
  // ambiguous (multiple distinct people match and none exactly) -> caller logs.
  const upsert = (
    name: string,
    info: {
      classification?: Classification;
      accountSlug?: string;
      title?: string;
      email?: string;
      phone?: string;
      isSelf?: boolean;
      source?: string;
    },
    sourceForUnresolved?: string,
  ): string | null => {
    const clean = name.trim();
    if (!clean) return null;
    const { exact, fuzzy } = candidates(clean);

    let target: PersonRec | undefined;
    if (exact.length === 1) target = exact[0];
    else if (exact.length > 1) {
      // Two real people literally share this name.
      exact.forEach((p) => (p.needsReview = true));
      needsReview.push({
        name: clean,
        reason: "duplicate exact name",
        candidates: exact.map((p) => p.fullName),
      });
      target = exact[0];
    } else if (fuzzy.length === 1) {
      target = fuzzy[0];
      if (normalizePersonName(target.fullName) !== normalizePersonName(clean)) {
        if (!target.aliases.includes(clean)) {
          target.aliases.push(clean);
          merges.push({ person: target.fullName, alias: clean });
        }
      }
    } else if (fuzzy.length > 1) {
      // Ambiguous (e.g. "Mike" between "Mike" and "Mike Spencer"): do not merge.
      if (sourceForUnresolved) {
        unresolved.push({
          name: clean,
          source: sourceForUnresolved,
          candidates: fuzzy.map((p) => p.fullName),
        });
      }
      return null;
    }

    if (!target) {
      target = {
        key: `p${++pk}`,
        fullName: clean,
        classification: info.classification ?? "unknown",
        accountSlug: info.accountSlug,
        title: info.title,
        email: info.email,
        phone: info.phone,
        isSelf: info.isSelf ?? false,
        needsReview: false,
        aliases: [],
        sourcePaths: [],
      };
      people.push(target);
    }

    // Merge in stronger info without clobbering existing values.
    if (info.classification && info.classification !== "unknown") {
      if (target.classification === "unknown") target.classification = info.classification;
      else if (target.classification !== info.classification && !target.isSelf) {
        target.needsReview = true;
        needsReview.push({
          name: target.fullName,
          reason: `classification conflict (${target.classification} vs ${info.classification})`,
        });
      }
    }
    if (info.accountSlug && !target.accountSlug) target.accountSlug = info.accountSlug;
    if (info.title && !target.title) target.title = info.title;
    if (info.email && !target.email) target.email = info.email;
    if (info.phone && !target.phone) target.phone = info.phone;
    if (info.isSelf) target.isSelf = true;
    if (info.source && !target.sourcePaths.includes(info.source)) {
      target.sourcePaths.push(info.source);
    }
    return target.key;
  };

  // 1) Jordan, authoritatively internal.
  const selfKey = upsert(SELF, { classification: "internal", isSelf: true });
  if (selfKey) people.find((p) => p.key === selfKey)!.aliases.push("Jordan");

  // 2) Roster (authoritative classification).
  for (const r of input.roster) {
    upsert(r.name, {
      classification: r.classification === "merit" ? "internal" : "customer",
      accountSlug: slugFor(r.account),
    });
  }

  // 3) Account-note contacts (customer + that account).
  for (const a of input.accounts) {
    for (const c of a.contacts) {
      upsert(c.name, {
        classification: "customer",
        accountSlug: a.slug,
        title: c.title,
        email: c.email,
        phone: c.phone,
        source: a.sourcePath,
      });
    }
  }

  // 4) Meeting attendees + task owners (attach provenance; do not invent class).
  const meetings: MeetingRec[] = [];
  const tasks: TaskRec[] = [];
  for (const m of input.meetings) {
    const accountSlug = slugFor(m.customer);
    const attendeeKeys: string[] = [];
    for (const a of m.attendees) {
      const k = upsert(a, { source: m.sourcePath }, m.sourcePath);
      if (k) attendeeKeys.push(k);
    }
    for (const ai of m.actionItems) {
      const ownerName = ai.owner ?? (ai.isJordans ? SELF : undefined);
      let ownerKey: string | null = null;
      if (ownerName) {
        ownerKey = upsert(ownerName, { source: m.sourcePath }, m.sourcePath);
        if (ownerKey && !attendeeKeys.includes(ownerKey)) attendeeKeys.push(ownerKey); // owner counts as attendee
      }
      tasks.push({
        sourcePath: m.sourcePath,
        sourceLine: ai.sourceLine,
        text: ai.text,
        done: ai.done,
        due: ai.due,
        priority: ai.priority,
        status: ai.status,
        isJordans: ai.isJordans,
        description: ai.description,
        notes: ai.notes,
        ownerKey: ownerKey ?? undefined,
        accountSlug,
      });
    }
    meetings.push({
      sourcePath: m.sourcePath,
      date: m.date,
      title: m.title,
      accountSlug,
      isInternal: !m.customer,
      topic: m.topic,
      granolaId: m.granolaId,
      sections: m.sections,
      bodyMarkdown: m.bodyMarkdown,
      seriesName: m.series,
      attendeeKeys,
    });
  }

  // 5) Standalone vault tasks (Jordan's real task list). A dual-captured
  // meeting action item shares its (sourcePath, sourceLine); the standalone
  // parse is the richer record, so it enriches rather than duplicates.
  const taskByKey = new Map(tasks.map((t) => [`${t.sourcePath}:${t.sourceLine}`, t]));
  for (const st of input.standaloneTasks ?? []) {
    const key = `${st.sourcePath}:${st.sourceLine}`;
    const contract = {
      workstream: st.workstream,
      customer: st.customer,
      created: st.created,
      scheduled: st.scheduled,
      thread: st.thread,
      completed: st.completed,
      fields: st.fields,
    };
    const existing = taskByKey.get(key);
    if (existing) {
      Object.assign(existing, contract);
      if (!existing.accountSlug && st.customer && st.customer !== "internal") {
        existing.accountSlug = slugFor(st.customer);
      }
      continue;
    }
    const rec: TaskRec = {
      sourcePath: st.sourcePath,
      sourceLine: st.sourceLine,
      text: st.title,
      done: st.done,
      due: st.due,
      priority: st.priority,
      status: st.status,
      isJordans: true, // standalone vault tasks are Jordan's by definition
      description: st.description,
      notes: st.notes,
      ownerKey: selfKey ?? undefined,
      accountSlug:
        st.customer && st.customer !== "internal" ? slugFor(st.customer) : undefined,
      ...contract,
    };
    tasks.push(rec);
    taskByKey.set(key, rec);
  }

  const series: SeriesRec[] = input.series.map((s) => ({
    name: s.name,
    cadence: s.cadence,
    status: s.status ?? "active",
    currentState: s.currentState,
    bodyMarkdown: s.bodyMarkdown,
    sourcePath: s.sourcePath,
    accountSlug: slugFor(s.account),
  }));

  return {
    accounts,
    people,
    meetings,
    tasks,
    series,
    report: {
      counts: {
        accounts: accounts.length,
        people: people.length,
        needsReview: people.filter((p) => p.needsReview).length,
        meetings: meetings.length,
        tasks: tasks.length,
        series: series.length,
      },
      merges,
      needsReview,
      unresolvedNames: unresolved,
    },
  };
}
