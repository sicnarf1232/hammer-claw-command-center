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
- [ ] If your markdown lives under a subfolder inside the repo (e.g. the repo
      root contains a `The Hammer Claw/` folder), set `VAULT_ROOT` to that folder
      name. If markdown is at the repo root, leave `VAULT_ROOT` blank.
      ACTION: tell me whether the vault repo has the notes at its root or nested
      under a folder, so /today reads the right path.

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

- [ ] Set `HC_WEBHOOK_SECRET` to a long random string in Vercel env.
- [ ] In Power Automate, build Flow A:
      Trigger: "When a new email arrives in a folder" (or "When an email is
      flagged"), scoped to the Outlook folder `ToHC`.
      Action: HTTP POST to `https://<app>.vercel.app/api/webhooks/email` with
      header `X-HC-Signature: <HC_WEBHOOK_SECRET>` and the JSON body mapped to
      the contract in docs/03 (messageId, receivedAt, from, to, cc, subject,
      bodyPreview, bodyHtml, bodyText, hasAttachments, webLink).
- [ ] LICENSE CHECK (do before building Flow A): confirm your M365 plan exposes
      the generic HTTP action in Power Automate. It is premium-gated on some
      plans. If gated, use a fallback from docs/03 (Office Scripts/webhook relay,
      or write to OneDrive and pull). Tell me which path so I can adjust.
- [ ] DECISION: confirm the flag-trigger folder name is `ToHC` (assumed).

---

## 5. Reply / draft — Power Automate Flow B (Phase 2)

- [ ] Build Flow B: "When an HTTP request is received" trigger. Action: Outlook
      "Create draft" as you. Map the request body from docs/03 (action,
      inReplyTo, to, cc, subject, bodyHtml, fromIdentity).
- [ ] Set `POWER_AUTOMATE_REPLY_URL` to that flow's HTTP-trigger URL (it contains
      a SAS token; treat the whole URL as a secret).
- [ ] Default action is `create_draft`. Auto-send stays off until you explicitly
      ask to enable it.
- [ ] DECISION NEEDED: Sloan's sending email address is marked "TBD (ask)" in
      docs/01. Until you give it, the app refuses to draft as the `sloan`
      identity (it will not guess an identity). Provide the Sloan from-address,
      or confirm Sloan email is out of scope.

---

## 6. AI drafting + briefs (Phase 2 drafting, Phase 4 briefs)

- [ ] Set `ANTHROPIC_API_KEY`. Optional `ANTHROPIC_MODEL` (defaults to
      `claude-sonnet-4-6`). Without it, AI drafting is skipped and you write the
      reply body yourself; briefs log a clear "no API key" notice.

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
- [ ] Granola pull (Phase 4): the Granola API token/endpoint you want the cron to
      pull from. DECISION NEEDED. Stubbed behind `GRANOLA_API_KEY`; without it the
      pull cron is a no-op that logs "not configured".
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

- [ ] PRICE LIST FORMAT: the quote builder parses any markdown table under
      `300 Merit/Price List/` and maps columns named like Part / Description /
      Cost. If your price list is not markdown tables (e.g. a CSV, a different
      column layout, or one file per part), tell me the real format and I will
      tighten `lib/priceList.ts`. Until then the catalog may be empty and you
      build quotes with manual line items (which works fully).
- [ ] QUOTE BRANDING: the PDF uses a clean typographic "Merit Medical OEM"
      header, no logo image. If you want the real Merit OEM logo and exact brand
      colors/fonts on the PDF, send the logo asset and brand spec and I will
      embed it.

## 8. Vercel deploy — exact steps (only you can do this)

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
