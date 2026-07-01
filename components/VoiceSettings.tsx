"use client";

import { useState } from "react";
import { VOICE_QUESTIONS, type VoiceProfile } from "@/lib/voice";

// Guided voice setup: walk Jordan through a few questions, or let Claude propose
// a starting profile from his real sent mail. Saved profile steers every AI draft.
export default function VoiceSettings({ initial }: { initial: VoiceProfile }) {
  const [p, setP] = useState<VoiceProfile>(initial);
  const [busy, setBusy] = useState<"" | "suggest" | "save">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof VoiceProfile>(key: K, value: VoiceProfile[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
  }

  async function suggest() {
    setBusy("suggest");
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/voice/suggest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? "Could not analyze your voice.");
      else {
        setP(data.profile);
        setMsg(`Proposed from ${data.sampleCount} of your sent emails. Edit anything, then save.`);
      }
    } catch {
      setErr("Could not analyze your voice.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? "Save failed.");
      else setMsg("Saved. New drafts will sound like you.");
    } catch {
      setErr("Save failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-fg">Let Claude propose your voice</div>
          <p className="mt-0.5 text-xs text-muted">
            Reads your recent sent mail and drafts a starting profile. You edit it, then save.
          </p>
        </div>
        <button
          type="button"
          onClick={suggest}
          disabled={busy !== ""}
          className="btn-outline whitespace-nowrap text-sm"
        >
          {busy === "suggest" ? "Reading your mail…" : "✨ Suggest my voice"}
        </button>
      </div>

      {p.summary ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <label className="eyebrow text-accent">Voice summary</label>
          <textarea
            value={p.summary}
            onChange={(e) => set("summary", e.target.value)}
            rows={3}
            className="input mt-1.5 w-full resize-y text-sm"
          />
          <p className="mt-1 text-2xs text-muted">
            This paragraph is what steers the drafts. The fields below refine it.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {VOICE_QUESTIONS.map((q) => (
          <div key={q.key} className="card p-4">
            <label className="text-sm font-semibold text-fg">{q.label}</label>
            <p className="mb-2 mt-0.5 text-xs text-muted">{q.help}</p>
            {q.kind === "choice" ? (
              <div className="flex flex-wrap gap-2">
                {q.choices!.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set(q.key, c as never)}
                    className={`chip capitalize ${
                      (p[q.key] as string) === c
                        ? "border-accent bg-accentSoft text-accent"
                        : "border-border text-fg/70 hover:text-fg"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : q.kind === "list" ? (
              <textarea
                value={(p[q.key] as string[]).join("\n")}
                onChange={(e) =>
                  set(
                    q.key,
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) as never,
                  )
                }
                rows={3}
                placeholder={q.placeholder}
                className="input w-full resize-y text-sm"
              />
            ) : (
              <textarea
                value={p[q.key] as string}
                onChange={(e) => set(q.key, e.target.value as never)}
                rows={q.key === "signoff" ? 2 : 1}
                placeholder={q.placeholder}
                className="input w-full resize-y text-sm"
              />
            )}
          </div>
        ))}
      </div>

      {err ? <div className="text-sm text-danger">{err}</div> : null}
      {msg ? <div className="text-sm text-ok">{msg}</div> : null}

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy !== ""}
          className="btn-primary text-sm shadow-lg"
        >
          {busy === "save" ? "Saving…" : "Save voice"}
        </button>
      </div>
    </div>
  );
}
