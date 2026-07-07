# 03 — Webhook + Power Automate (the email keystone)

> **Correction (2026-07-06):** any "create draft" language below is obsolete.
> Flow B is a **direct send** as Jordan (verified live 2026-06-16); the app UI
> says "Send reply" and means it. Everything sent has been reviewed by Jordan
> in the app's editor first. See docs/HANDOFF-2026-07.md section 6.

This is the highest-leverage integration and the one most likely to break silently if the contract is loose. Pin it down here.

## Why Power Automate, not Graph API

The clean way to read a Merit mailbox is the Microsoft Graph API, which needs an Azure app registration and admin consent. Jordan does not have that (no IT permissions yet).

Power Automate **cloud flows run as Jordan**, under his existing licensed M365 account, against his own mailbox. No admin consent, no app registration. This is a supported path for personal productivity flows. The app never talks to Graph directly. It exposes webhooks; Power Automate calls them and is called by them.

## Two flows

### Flow A — Inbound capture (email into the app)

**Trigger (safe default):** "When an email is flagged" or "When an item is created in a folder" scoped to one Outlook folder named e.g. `ToHC`. Jordan flags an email or drags it into that folder; nothing else fires. Zero risk of touching unintended mail.

**Action:** HTTP POST to the app's webhook with a shared secret.

```
POST https://<app>.vercel.app/api/webhooks/email
Headers:
  Content-Type: application/json
  X-HC-Signature: <shared secret from env, compared in constant time>
Body (app contract — map Power Automate dynamic fields to these keys):
{
  "messageId":   "<Outlook internet message id>",
  "receivedAt":  "2026-06-09T15:04:00Z",
  "from":        { "name": "Chris Dopuch", "email": "chris@stryker.com" },
  "to":          ["jordan.francis@merit.com"],
  "cc":          [],
  "subject":     "DASH supply plan",
  "bodyPreview": "first ~500 chars plain text",
  "bodyHtml":    "<optional full html>",
  "bodyText":    "<optional full plain text>",
  "hasAttachments": true,
  "webLink":     "<deep link to open in Outlook>"
}
```

**App behavior on receipt:**
1. Verify `X-HC-Signature`. Reject 401 if it fails.
2. Dedupe on `messageId`.
3. Log the raw event to the `webhook_events` table.
4. Insert into the `email_queue` table with status `new`.
5. (Phase 1) Classify by sender/subject into a workstream + likely account, and surface in `/inbox`. Filing into the vault `Inbox/` is a later step and should be reviewable, not automatic, until trusted.

### Flow B — Reply / draft (app back to Outlook)

**Trigger:** the app POSTs a reply intent to a Power Automate flow's "When an HTTP request is received" URL.

```
POST <power-automate-flow-url>
Body:
{
  "action":     "create_draft" | "send",
  "inReplyTo":  "<messageId>",
  "to":         ["chris@stryker.com"],
  "cc":         [],
  "subject":    "RE: DASH supply plan",
  "bodyHtml":   "<drafted reply>",
  "fromIdentity": "merit"     // app maps to the right account/signature
}
```

**Flow action:** "Create draft" (preferred for trust) or "Send an email (V2)" in Outlook, as Jordan. Default to **create_draft** so Jordan reviews before anything sends. Only enable `send` once he explicitly trusts a path.

The app may use AI to draft the body first, but the human-in-the-loop default is: AI drafts -> Jordan approves in-app -> Flow B creates the Outlook draft -> Jordan sends from Outlook.

## Auth and secrets

- One shared secret, `HC_WEBHOOK_SECRET`, in Vercel env. Power Automate sends it in `X-HC-Signature`; the app compares in constant time.
- The reply flow's HTTP-trigger URL is itself a secret (contains a SAS token). Store as `POWER_AUTOMATE_REPLY_URL` in env.
- Never log full secrets. Redact in the event log.

## License note (flag to Jordan before Phase 2)

Confirm Jordan's M365 plan exposes the actions these flows need. The standard Outlook 365 connector (flag trigger, create draft, send email) is available on common business plans. The generic "HTTP" action used in Flow A can be premium-gated on some plans. If HTTP is gated, fall back options:
- Use the Outlook connector to call an **Office Scripts / webhook relay**, or
- Use a free relay (e.g. a tiny serverless function) the standard connector can reach, or
- Use the "When a new email arrives (V3)" trigger to write to OneDrive, and have the app pull from there.

Have Jordan check this in Power Automate before building Flow A so the path is known.

## Test plan for this integration

1. Build the webhook endpoint first. Verify with a manual `curl` using the sample body above.
2. Build Flow A pointing at it. Flag one test email, confirm it lands in `email_queue`.
3. Build the `/inbox` view reading `email_queue`.
4. Build Flow B. Send one `create_draft` intent, confirm a draft appears in Outlook.
5. Only then wire the app's "Reply" button to Flow B.
