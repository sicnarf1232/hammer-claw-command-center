"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MeetingEdit, EditableActionItem } from "@/lib/meetingEdit";
import { needsDueDate, formatDateShort } from "@/lib/dates";

// Phase C: in-app editor for a meeting note. Edits write back to the vault as a
// single commit via /api/meetings/note (markdown stays the source of truth).
// This is the surface that clears [due:: TBD] flags, reassigns attendees and
// owners, and edits the account, sections, and action items.

interface Row extends EditableActionItem {
  _id: number;
}

const OPTIONAL_SECTIONS = [
  "Key Decisions",
  "Numbers That Matter",
  "Watch-Outs",
  "Full Notes",
] as const;

export default function MeetingEditor({
  path,
  initial,
  date,
  rosterNames,
  accountNames,
}: {
  path: string;
  initial: MeetingEdit;
  date?: string;
  rosterNames: string[];
  accountNames: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [account, setAccount] = useState(initial.account ?? "");
  const [topic, setTopic] = useState(initial.topic ?? "");
  const [attendees, setAttendees] = useState<string[]>(initial.attendees);
  const [attendeeDraft, setAttendeeDraft] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({
    "TL;DR": initial.sections["TL;DR"] ?? "",
    "Key Decisions": initial.sections["Key Decisions"] ?? "",
    "Numbers That Matter": initial.sections["Numbers That Matter"] ?? "",
    "Watch-Outs": initial.sections["Watch-Outs"] ?? "",
    "Full Notes": initial.sections["Full Notes"] ?? "",
  });
  const [items, setItems] = useState<Row[]>(
    initial.actionItems.map((a, i) => ({ ...a, _id: i })),
  );
  const [nextId, setNextId] = useState(initial.actionItems.length);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const backToView = () =>
    router.push(`/meetings?note=${encodeURIComponent(path)}`);

  function addAttendee() {
    const v = attendeeDraft.trim();
    if (v && !attendees.includes(v)) setAttendees([...attendees, v]);
    setAttendeeDraft("");
  }

  function updateItem(id: number, patch: Partial<Row>) {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, ...patch } : it)));
  }

  function addItem(isJordans: boolean) {
    setItems((prev) => [
      ...prev,
      {
        _id: nextId,
        done: false,
        isJordans,
        owner: isJordans ? "Jordan" : "",
        text: "",
        due: "",
        created: date,
        customer: account || undefined,
      },
    ]);
    setNextId((n) => n + 1);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const edit: MeetingEdit = {
      title: title.trim(),
      account: account.trim() || null,
      topic: topic.trim() || null,
      attendees,
      sections,
      actionItems: items.map(({ _id, ...rest }) => {
        void _id;
        return rest;
      }),
    };
    try {
      const res = await fetch("/api/meetings/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, edit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not save.");
      } else {
        backToView();
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel texture mx-auto max-w-3xl overflow-hidden p-6 sm:p-9">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-muted">Editing meeting note</span>
        {date && <span className="text-sm tabular-nums text-ink2">{formatDateShort(date)}</span>}
      </div>

      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input w-full text-lg font-semibold"
          placeholder="Meeting title"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account">
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            list="hc-accounts"
            className="input w-full"
            placeholder="(none / internal)"
          />
          <datalist id="hc-accounts">
            {accountNames.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Bucket / Topic">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="input w-full"
            placeholder="Bucket · short topic"
          />
        </Field>
      </div>

      <Field label="Attendees">
        <div className="flex flex-wrap gap-1.5">
          {attendees.map((a) => (
            <span key={a} className="chip" style={{ borderColor: "var(--line-2)" }}>
              {a}
              <button
                type="button"
                onClick={() => setAttendees(attendees.filter((x) => x !== a))}
                className="ml-1 text-muted hover:text-danger"
                aria-label={`Remove ${a}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={attendeeDraft}
            onChange={(e) => setAttendeeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAttendee();
              }
            }}
            list="hc-roster"
            className="input w-56"
            placeholder="Add attendee"
          />
          <datalist id="hc-roster">
            {rosterNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="button" onClick={addAttendee} className="btn btn-ghost px-2.5 py-1 text-xs">
            Add
          </button>
        </div>
      </Field>

      <Field label="TL;DR">
        <textarea
          value={sections["TL;DR"]}
          onChange={(e) => setSections({ ...sections, "TL;DR": e.target.value })}
          className="input min-h-[72px] w-full"
          placeholder="One or two lines."
        />
      </Field>

      {/* Action items */}
      <div className="mt-6">
        <p className="eyebrow mb-2 text-muted">Action Items</p>
        <div className="grid gap-2.5">
          {items.map((it) => (
            <ActionItemEditor
              key={it._id}
              item={it}
              date={date}
              accountNames={accountNames}
              onChange={(patch) => updateItem(it._id, patch)}
              onRemove={() => setItems(items.filter((x) => x._id !== it._id))}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => addItem(true)} className="btn btn-ghost px-2.5 py-1 text-xs">
            + Jordan&apos;s item
          </button>
          <button type="button" onClick={() => addItem(false)} className="btn btn-ghost px-2.5 py-1 text-xs">
            + Tracking item
          </button>
        </div>
      </div>

      {OPTIONAL_SECTIONS.map((h) => (
        <Field key={h} label={h}>
          <textarea
            value={sections[h]}
            onChange={(e) => setSections({ ...sections, [h]: e.target.value })}
            className="input min-h-[72px] w-full font-mono text-[13px]"
            placeholder={h === "Full Notes" ? "### Subsection\n…" : "- one bullet per line"}
          />
        </Field>
      ))}

      {err && <p className="mt-4 text-sm text-danger">{err}</p>}

      <div className="mt-7 flex items-center gap-2 border-t-2 pt-4" style={{ borderColor: "var(--accent)" }}>
        <button onClick={save} disabled={busy} className="btn btn-primary disabled:opacity-60">
          {busy ? "Saving…" : "Save to vault"}
        </button>
        <button onClick={backToView} disabled={busy} className="btn btn-ghost">
          Cancel
        </button>
        <span className="ml-auto text-2xs text-muted">Writes one commit to the vault.</span>
      </div>
    </article>
  );
}

function ActionItemEditor({
  item,
  date,
  accountNames,
  onChange,
  onRemove,
}: {
  item: Row;
  date?: string;
  accountNames: string[];
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const flagged = needsDueDate(item.due);
  return (
    <div
      className="rounded-[12px] p-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${item.isJordans ? "var(--accent)" : "var(--line-2)"}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={item.done}
            onChange={(e) => onChange({ done: e.target.checked })}
          />
          done
        </label>
        <input
          value={item.owner}
          onChange={(e) => onChange({ owner: e.target.value })}
          className="input w-28"
          placeholder="Owner"
        />
        <input
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="input min-w-[180px] flex-1"
          placeholder="Action"
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-muted hover:text-danger"
          aria-label="Remove item"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted">
          due
          <input
            value={item.due}
            onChange={(e) => onChange({ due: e.target.value })}
            className="input w-36 tabular-nums"
            placeholder="YYYY-MM-DD"
            style={
              flagged
                ? { background: "var(--warm-soft)", color: "var(--warm)" }
                : undefined
            }
          />
        </label>
        {flagged && (
          <span
            className="chip"
            style={{ background: "var(--warm-soft)", color: "var(--warm)", borderColor: "transparent" }}
          >
            ⚑ needs due date
          </span>
        )}
        {item.isJordans && (
          <>
            <label className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted">
              priority
              <select
                value={item.priority ?? ""}
                onChange={(e) =>
                  onChange({
                    priority: (e.target.value || undefined) as Row["priority"],
                  })
                }
                className="input w-24"
              >
                <option value="">—</option>
                <option value="high">high</option>
                <option value="med">med</option>
                <option value="low">low</option>
              </select>
            </label>
            <input
              value={item.customer ?? ""}
              onChange={(e) => onChange({ customer: e.target.value || undefined })}
              list="hc-accounts"
              className="input w-44"
              placeholder="customer (task)"
            />
            <datalist id="hc-accounts">
              {accountNames.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-2xs text-muted">
          <input
            type="checkbox"
            checked={item.isJordans}
            onChange={(e) =>
              onChange({
                isJordans: e.target.checked,
                created: item.created ?? (e.target.checked ? date : undefined),
              })
            }
          />
          feeds /today (mine)
        </label>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="eyebrow mb-1.5 text-muted">{label}</p>
      {children}
    </div>
  );
}
