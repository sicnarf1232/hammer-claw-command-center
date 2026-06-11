# 01 — Context and Architecture

## The problem this app solves

Jordan runs his work life out of an Obsidian vault (the "Hammer Claw" vault): customers, projects, people, tasks, meeting notes, briefs, recaps. Around it sit a set of automations: scheduled AI runs (morning brief, end-of-day recap, weekly review), a Granola meeting-notes importer, and live "artifacts" (a meeting-notes viewer and a quote builder).

Each automation is a separate, stateless AI run that hands context to the next one through a file or a snapshot. The pain is not build time. It is the **serialization boundaries**: AI to file, file to AI, AI to sandboxed artifact snapshot, snapshot to PDF. Every hop loses fidelity, and several hops require Jordan to be the integration layer (manually dragging emails into a folder, triggering desktop-takeover runs that collide with Teams).

This app collapses that into one pattern: **the vault is the source of truth, a real server reads and writes it directly, and many live views render from it.** No snapshots. No drag and drop. No desktop takeover.

## Target architecture

```
   Outlook mailbox        Granola
        |                    |
   (Power Automate)     (Vercel Cron pull)
        |  webhook POST      |
        v                    v
  +------------------------------------+
  |   Command Center (Next.js/Vercel)  |
  |   API routes · Cron · web UI       |
  |   Postgres (state only)            |
  +------------------------------------+
        ^                    |
        | git read/write     | notifications
        v                    v
   Obsidian vault         Jordan
   (git = source of truth)  (phone/email)
```

- **Sources.** Outlook (via Power Automate, runs as Jordan, no IT consent needed) and Granola (pulled on a schedule).
- **Command Center.** Next.js app on Vercel. API routes are the webhook target. Cron replaces the desktop schedulers. The UI is the single screen Jordan works from.
- **Vault.** A private GitHub repo. The app reads markdown via the GitHub API and writes back as commits.
- **Postgres.** Only fast-changing state that should not be in version control.

## The data model

Do not migrate the vault into a database. Keep markdown as truth.

| Lives in the vault (git) | Lives in Postgres |
|--------------------------|-------------------|
| Customer / project / people notes | Live email queue + triage state |
| Meeting notes | Notification log (what was sent, when) |
| Tasks (inline-field schema, see docs/02) | Quote drafts in progress |
| Briefs, recaps | Webhook event log |
| Price list, templates | Session/auth state |

Tasks render from the same inline-field schema the vault already uses, so Obsidian and the app show the same list. Writes from the app commit to git, so a change in the app appears in Obsidian and vice versa.

## How the app touches the vault (GitHub API pattern)

The app does not keep a server filesystem clone (Vercel serverless is ephemeral and read-only). Instead:

- **Read.** Use the GitHub Contents API / Git Trees API to list and fetch markdown. For Phase 0 a direct read of the relevant folder is fine. From Phase 1, sync the parsed index into Postgres on a cron (every few minutes) and on webhook, so the UI reads Postgres for speed and the vault stays truth.
- **Write.** Create a commit via the API: get the file's current SHA, put new content, commit with a clear message like `app: file Stryker email 2026-06-09`. Atomic, one file per commit where practical.
- **Conflict safety.** Always read the latest SHA before writing. Never force-push. If a write conflicts, re-read and re-apply rather than overwrite.

## Workstreams (why this matters for any output)

The vault is split into five workstreams. Any output that carries an identity (an email draft, a filed note, a PDF) must use the correct workstream's folder, email address, and brand. Getting this wrong sends the wrong identity to a real recipient, which is the highest-consequence failure mode.

| Workstream | Folder | Email | Brand |
|-----------|--------|-------|-------|
| merit | `300 Merit/` | jordan.francis@merit.com | Merit Medical OEM |
| nextech | `400 Nextech/` | jordan@nextechadv.ai | Nextech AI |
| sloan | `500 Sloan/` | TBD (ask) | Sloan AI |
| personal | `600 Personal/` | n/a | n/a |
| shared | machinery, memory, references | n/a | n/a |

The full rules are in docs/02. The app's job: when it files something or drafts an email, it reads the workstream from the relevant note's frontmatter and uses that identity. No workstream or `shared` means stop and ask.
