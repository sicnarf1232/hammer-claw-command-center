# PUNCHLIST — things that need Jordan

Everything the app stubs behind an env var or a clearly marked TODO, plus the
exact steps only Jordan can do (secrets, Power Automate flows, Vercel). Nothing
here is invented or faked. Grouped by what unblocks what.

---

## 0. Build location note (not a blocker, just FYI)

The working copy is at `~/dev/hammer-claw-command-center`, not
`~/Documents/hammer-claw-command-center`. Reason: macOS privacy protection (TCC)
blocks spawned `node`/`npm`/`next` processes from running inside `~/Documents`
under this tooling, so builds and the dev server cannot run there. The Git repo
and all code are identical wherever they live. If you want the working copy back
under Documents, grant your Terminal "Files and Folders" / Full Disk Access in
System Settings > Privacy & Security, then `git clone` it there.

---

## 1. To see LIVE data on /today (Phase 0 DoD)

The app is built and passing tests, but it cannot show your real tasks until it
can read the vault.

- [ ] Paste the fine-grained GitHub PAT. It becomes `GITHUB_TOKEN`.
      Scope: resource owner `sicnarf1232`, repository access only
      `hammer-claw-vault`, Permissions: Contents = Read and write, Metadata =
      Read. (docs/05 section 4.)
- [ ] Confirm `VAULT_REPO=sicnarf1232/hammer-claw-vault` and `VAULT_BRANCH=main`.
- [x] VAULT_ROOT: confirmed. The vault markdown lives at the repo root (folders
      `100 Periodics`, `300 Merit`, `memory/`, etc. are directly at the root), so
      leave `VAULT_ROOT` blank. Verified live: /today rendered your real tasks
      from `100 Periodics/Daily/TASKS.md`, /meetings parsed 30 meetings from the
      index, /quote loaded 1144 parts from the price list.

---

## 2. Auth choice (Phase 0)

- [ ] Decide single-user auth: either set `APP_PASSWORD` (the app's built-in
      shared-secret gate, already implemented), OR turn on Vercel password
      protection for the project and leave `APP_PASSWORD` blank. Pick one.

---

## 3. Database (Phase 1+)

- [ ] Create a Vercel Postgres (Neon) store and set `POSTGRES_URL`.
      Then run `npm run db:push` once to create the tables (webhook_events,
      email_queue, notifications). The app degrades gracefully without it:
      /inbox shows a setup notice instead of crashing.

---

## 4. Email inbound — Power Automate Flow A (Phase 1)

- [x] Set `HC_WEBHOOK_SECRET` in Vercel production env (2026-06-12) and redeployed.
      Verified live end-to-end against the production webhook: wrong signature
      returns 401, valid secret with no messageId returns 400, a full payload
      returns `{ok:true,deduped:false}` (proves the Neon tables exist and the
      insert path works), and a repeat returns `{ok:true,deduped:true}` (unique
      index dedupe works). One synthetic test row (`TEST-phase1-verify-001`,
      subject `[TEST] Phase 1 webhook verification`) sits in the queue; dismiss
      it in /inbox to clear.
- [x] LICENSE CHECK: Jordan confirmed the generic HTTP action IS available on
      his M365 plan (2026-06-12). No fallback needed; build Flow A with HTTP.
- [ ] In Power Automate, build Flow A (HTTP action confirmed available):
      Trigger: "When an email is flagged (V4)" (or "When a new email arrives in
      a folder (V3)" scoped to the Outlook folder `ToHC`).
      Action: HTTP POST to
      `https://hammer-claw-command-center.vercel.app/api/webhooks/email` with
      header `X-HC-Signature: e1745b385e1bb09ad53ac1573affd8760e814eebb05d162218b4e956b6e1db9a`
      and the JSON body mapped to the contract in docs/03 (messageId, receivedAt,
      from, to, cc, subject, bodyPreview, bodyHtml, bodyText, hasAttachments,
      webLink). Field-by-field mapping is in the Phase 1 wiring notes.
- [ ] DECISION: confirm the flag-trigger folder name is `ToHC` (assumed), or pick
      the flagged-email trigger instead (no folder needed).

---

## 5. Reply — Power Automate Flow B (Phase 2) — DONE (live, 2026-06-16)

- [x] DECISION CHANGED: Jordan wants the app to SEND directly, not create a
      draft. The standard Outlook connector has no "create draft" action anyway.
      Flow B is now a direct send.
- [x] Built Flow B = "When an HTTP request is received" trigger -> "Send an email
      (V2)" on the Merit connection (Jordan.Francis@merit.com). To/Subject/Body
      mapped from the request (`join(to)`, `subject`, `bodyHtml`). No lookup, no
      condition (an earlier threaded build had empty branches and silently sent
      nothing; simplified to one send step). Not in-thread: replies go as a fresh
      "RE:" email. Verified end-to-end: app Send reply -> email delivered to the
      Merit inbox.
- [x] Trigger auth: the new Power Platform trigger defaulted to OAuth-required
      (`DirectApiAuthorizationRequired`). Switched it to the SAS/URL scheme so
      the app can call it with no token. (Merit tenant allowed the switch.)
- [x] `POWER_AUTOMATE_REPLY_URL` set in Vercel production (Sensitive) and live.
- [x] App UI relabeled: "Send reply" / "Reply sent" (was "Create Outlook draft").
- [ ] DECISION NEEDED: Sloan's sending email address is "TBD (ask)" in docs/01.
      The app refuses to send as `sloan` until provided. (Nextech was removed
      entirely per Jordan, 2026-06-16.)

---

## 6. AI drafting + briefs (Phase 2 drafting, Phase 4 briefs)

- [x] `ANTHROPIC_API_KEY` set in Vercel production and live (2026-06-16). First
      attempt was mis-cased as `Anthropic_API_Key` (env names are case-sensitive)
      and returned 503; re-added as `ANTHROPIC_API_KEY` and verified: "Draft with
      AI" returns a generated reply body. Model defaults to `claude-opus-4-8`.

---

## 7. Cron + notifications (Phase 4)

- [ ] Vercel sets `CRON_SECRET` automatically when you add cron jobs; the cron
      routes reject any request without it. For local testing, set `CRON_SECRET`
      in `.env.local`.
- [ ] Notification delivery channel: the app logs every notification to the
      `notifications` table and exposes them in-app. To also get them on your
      phone/email, tell me the channel you want (e.g. a Power Automate "push
      notification" flow URL, or an email-to-self). DECISION NEEDED; until then
      notifications are logged in-app only, not pushed externally.
- [x] Granola pull (Phase 4): BUILT (2026-06-17). Contract obtained: Granola
      public API at `https://public-api.granola.ai/v1/notes` (Bearer
      `GRANOLA_API_KEY`, key form `grn_...`). The `/meetings` "Pull from Granola"
      button and the `granola-pull` cron share `lib/meetingsPull.ts`: pull notes
      created after the newest index date, AI-triage each into
      `<workstream>/Meetings/<Account>/`, refresh `Meetings-Index.md`. Requires
      `ANTHROPIC_API_KEY` (set) for triage. `GRANOLA_API_KEY` set in Vercel
      production (2026-06-17).
      - [ ] VERIFY LIVE: after deploy, press "Pull from Granola" on /meetings and
            spot-check that meetings file into the right account folders. Triage
            is best-effort; correct any misfiles in the vault (they are editable).
      - [ ] Unknown-account meetings stage under `300 Merit/Meetings/_Unfiled`.
            Tell me if you want a different staging location or default workstream.
- [ ] VERCEL PLAN FOR CRON: the cron schedules in `vercel.json` run sub-daily
      (sync every 10 min, briefs at fixed times, Granola every 4 hours). Vercel
      Hobby only allows once-per-day cron; sub-daily needs Pro. Either upgrade to
      Pro, or tell me and I will reduce the schedules to daily.
- [ ] DAYLIGHT SAVING: Vercel Cron fires in UTC. The schedules are set for
      Mountain Daylight Time (UTC-6, current). When MT switches to Standard Time
      (UTC-7) in November, brief times shift an hour. The brief content is always
      correct (dates computed in `America/Denver`); only the trigger clock drifts.
      Tell me if you want me to add a DST-aware guard.

---

## 7b. Meetings + quotes (Phase 3) — two questions

- [x] PRICE LIST FORMAT: confirmed and working. Your price list is markdown
      tables (`| Part# | Description | High Price |`) across the chunk files. The
      parser now keyword-matches those headers and loads 1144 parts live. No
      action needed unless you change the format. Note: it reads the "High Price"
      column as unit cost; if you want a different price column, tell me.
- [ ] QUOTE BRANDING: the PDF uses a clean typographic "Merit Medical OEM"
      header, no logo image. If you want the real Merit OEM logo and exact brand
      colors/fonts on the PDF, send the logo asset and brand spec and I will
      embed it.

## 8. Vercel deploy — DONE (live)

- [x] DEPLOYED. Live URL: https://hammer-claw-command-center.vercel.app
      (project `jordans-projects-255badbb/hammer-claw-command-center`). Verified:
      logged in and /today shows your real vault tasks as of 2026-06-11.
- [x] GitHub connected, so `git push` to `main` now auto-deploys.
- [x] Production env vars set: GITHUB_TOKEN, VAULT_REPO, VAULT_BRANCH,
      APP_TIMEZONE, APP_PASSWORD.
- [x] App login is on. APP_PASSWORD = `a985f43e3817b3f609fe` (change it anytime
      in Vercel > Settings > Environment Variables, then redeploy).

Still to do on the deploy:
- [x] ROTATE THE GITHUB PAT (done 2026-06-29). Regenerated the fine-grained
      token and updated the `GITHUB_TOKEN` env var in Vercel.
- [ ] Add the database (section 3) and the remaining secrets as you wire each
      phase: POSTGRES_URL, HC_WEBHOOK_SECRET, POWER_AUTOMATE_REPLY_URL,
      ANTHROPIC_API_KEY, NOTIFY_WEBHOOK_URL, GRANOLA_API_KEY.
- [ ] CRONS ON HOBBY: the live `vercel.json` runs only two daily crons
      (morning-brief, notify) to fit the Hobby plan. The full schedule (10-min
      vault sync, EOD recap, weekly review, Granola pull) is in
      `vercel.cron-pro.json`; copy its `crons` array into `vercel.json` after
      upgrading to Pro.

### Original manual steps (kept for reference / if you ever re-import)

The repo is live and pushed: https://github.com/sicnarf1232/hammer-claw-command-center
(Note: the local working copy is at `~/dev/hammer-claw-command-center`, not
`~/Documents`, see section 0.)

1. Go to https://vercel.com/new, log in (use the GitHub login as sicnarf1232 if
   prompted), and "Import" the `hammer-claw-command-center` repo. Framework
   preset auto-detects Next.js. Do not change build settings.

2. Before the first deploy, add Environment Variables (Settings > Environment
   Variables). Minimum to light up `/today`:
   - `GITHUB_TOKEN`   = your fine-grained PAT (Contents read+write on the vault)
   - `VAULT_REPO`     = sicnarf1232/hammer-claw-vault
   - `VAULT_BRANCH`   = main
   - `VAULT_ROOT`     = (blank if markdown is at the repo root; otherwise the
     folder name, e.g. `The Hammer Claw`) <-- tell me which; see section 1.
   - `APP_PASSWORD`   = a password you choose (or skip and use Vercel password
     protection instead)
   Add the rest as you wire each phase: `POSTGRES_URL`, `HC_WEBHOOK_SECRET`,
   `POWER_AUTOMATE_REPLY_URL`, `ANTHROPIC_API_KEY`, `NOTIFY_WEBHOOK_URL`,
   `GRANOLA_API_KEY`. `CRON_SECRET` is set automatically by Vercel when crons run.

3. Add the database: Vercel dashboard > Storage > Create Database > Postgres
   (Neon). It auto-injects `POSTGRES_URL`. Then, locally:
   ```
   cd ~/dev/hammer-claw-command-center
   echo 'POSTGRES_URL=<paste the pooled URL from Vercel>' >> .env.local
   npm run db:push      # creates the tables from drizzle/0000_*.sql
   ```

4. Deploy: click Deploy (or `git push` triggers it). You get a live URL like
   `https://hammer-claw-command-center.vercel.app`.

5. Turn on auth: either keep `APP_PASSWORD` set (app-level login is built in), or
   Vercel > Settings > Deployment Protection > enable password protection.

6. Crons: confirmed automatically from `vercel.json` on Pro. On Hobby, reduce to
   daily or upgrade (see section 7). Test a cron now by visiting, e.g.,
   `https://<app>.vercel.app/api/cron/sync-vault?secret=<CRON_SECRET>`.

7. Wire Power Automate Flow A to `https://<app>.vercel.app/api/webhooks/email`
   with header `X-HC-Signature: <HC_WEBHOOK_SECRET>` (sections 4 and 5).

## 9. Granola pull replaces Cowork triage (2026-06-17)

Decision: the app's "Pull from Granola" is the single Granola->vault pipeline,
replacing the Cowork granola-triage scheduler. The code is realigned to the real
vault conventions (rolling docs under `/Rolling/` with `type: Rolling Series`;
`**Bucket:**` meta line; plain action items with `🗓️ Due:`; ` -- ` separators).

- [ ] RETIRE COWORK TRIAGE: once a live app pull is verified to file correctly,
      turn off the Cowork granola-triage / EOD-recap "pull fresh meetings" step so
      two systems do not both write meeting notes, Meetings-Index.md, and the
      Rolling docs (vault CLAUDE.md rule 3: one writer per file).
- [ ] VERIFY LIVE: press "Pull from Granola", confirm a meeting files into the
      right account folder in the new format and that a matching meeting updates
      `300 Merit/Meetings/Internal/Rolling/Mike 1on1.md` (Current State + a new
      log entry). Correct any misfiles in the vault.
- [ ] OPTIONAL: the app reads series from any `/Rolling/` folder. If you keep
      rolling docs elsewhere, tell me and I will widen discovery.

## Milestone 3 — Document library (2026-06-19)
- [ ] PROVISION: create a Vercel Blob store in the project. `BLOB_READ_WRITE_TOKEN`
      is then set automatically on deploy. Until it is set, /library and the
      account Quality / OEM PCNs tabs show a setup notice (they do not crash).
- [ ] APPLY MIGRATION: run `npm run db:push` (or apply `drizzle/0001_furry_odin.sql`)
      so the `documents` table exists in Postgres.
- [ ] VERIFY LIVE: upload a PDF on /library, confirm it lists, opens from Blob,
      and that the brain (/ask) can answer a question from its text.

## Branding (Phase 3 PART B) — BUILT 2026-06-24, needs POSTGRES_URL to use
- [x] `/branding` page + `/api/branding` shipped: list/create/edit kits (name,
      workstream, primary/secondary/accent pickers, logo upload, live export
      preview). `ensureMeritSeed()` auto-creates the Merit kit to edit.
- [ ] RE-RUN SQL FOR THE PAPER COLUMN: `brand_kits` now has a `paper` column.
      Re-run `drizzle/brand-kits.sql` in the Neon SQL editor (idempotent; the
      `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "paper"` adds it to your existing
      table). Until then `/branding` shows the "run brand-kits.sql" notice.
- [ ] PROVISION: the page needs `POSTGRES_URL` (same Neon DB as the cutover). It
      shows a setup notice until then. Once the DB is live, open `/branding`, set
      the Merit crimson palette + paper, upload the Merit logo, and ALL THREE views
      (in-app note, Download PDF, Copy-for-email) pick it up by workstream.
- [ ] PDF DEPLOY CHECK: the Download PDF route renders headless Chromium
      (@sparticuz/chromium + puppeteer-core) on Vercel. After this deploys, click
      Download PDF on a meeting and confirm a file downloads. If Vercel rejects the
      function size on Hobby or it errors, the button auto-falls back to the print
      view; tell me and I will switch to chromium-min (remote binary) or a hosted
      renderer.
- [ ] Logo storage: pushed to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set,
      else stored inline as a data URL in `brand_kits.logo_url` (works, heavier
      row). Provision a Blob store to switch to hosted URLs.
