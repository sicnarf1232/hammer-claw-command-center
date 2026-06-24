# Power Automate setup — the full build/update guide

Both flows are live today. This is the copy-pasteable reference to rebuild them,
and the **one update** needed so a reply from a task lands in the original
Outlook thread (instead of a fresh "RE:" email). No Azure/admin consent needed —
cloud flows run as Jordan under his M365 license. (Design rationale: docs/03.)

Secrets used by the app (Vercel env):
- `HC_WEBHOOK_SECRET` — shared secret the app checks on inbound (Flow A).
- `POWER_AUTOMATE_REPLY_URL` — Flow B's HTTP-trigger URL (treat as a secret; it
  carries a SAS token).

---

## Flow A — Inbound capture (email → app)

**Trigger:** Office 365 Outlook → **"When an email is flagged (V4)"** (or "When a
new email arrives in a shared/your mailbox (V3)" scoped to a single folder named
`ToHC`). Folder/flag scoping means nothing fires unless Jordan opts an email in.

**Action:** **HTTP** → **POST** to `https://<app>.vercel.app/api/webhooks/email`
- Headers:
  - `Content-Type: application/json`
  - `X-HC-Signature: <the HC_WEBHOOK_SECRET value>`
- Body (map Outlook dynamic fields into these exact keys):
```json
{
  "messageId":   "@{triggerOutputs()?['body/internetMessageId']}",
  "threadId":    "@{triggerOutputs()?['body/conversationId']}",
  "receivedAt":  "@{triggerOutputs()?['body/receivedDateTime']}",
  "from":        { "name": "@{triggerOutputs()?['body/from/emailAddress/name']}",
                   "email": "@{triggerOutputs()?['body/from/emailAddress/address']}" },
  "to":          "@{triggerOutputs()?['body/toRecipients']}",
  "cc":          "@{triggerOutputs()?['body/ccRecipients']}",
  "subject":     "@{triggerOutputs()?['body/subject']}",
  "bodyPreview": "@{triggerOutputs()?['body/bodyPreview']}",
  "bodyText":    "@{triggerOutputs()?['body/body/content']}",
  "hasAttachments": "@{triggerOutputs()?['body/hasAttachments']}",
  "webLink":     "@{triggerOutputs()?['body/webLink']}"
}
```
The app verifies the signature, dedupes on `messageId`, and lands it in `/inbox`.
Keep `messageId` + `threadId` accurate — they are the reply/threading keys.

---

## Flow B — Send / reply (app → Outlook)

**Trigger:** **"When an HTTP request is received."** Set **Who can trigger** to
**"Any user"** and use the **SAS/URL** auth scheme (not OAuth) so the app can call
it with just the URL. Request body schema:
```json
{
  "type": "object",
  "properties": {
    "action":       { "type": "string" },
    "inReplyTo":    { "type": "string" },
    "to":           { "type": "array", "items": { "type": "string" } },
    "cc":           { "type": "array", "items": { "type": "string" } },
    "subject":      { "type": "string" },
    "bodyHtml":     { "type": "string" },
    "fromIdentity": { "type": "string" }
  }
}
```

### Current build (works): single send action
Office 365 Outlook → **"Send an email (V2)"** on the Merit connection:
- To: `@{join(triggerBody()?['to'], ';')}`
- Subject: `@{triggerBody()?['subject']}`
- Body: `@{triggerBody()?['bodyHtml']}` (Is HTML = Yes)

This delivers, but a reply goes out as a new "RE:" message, not in the thread.

### UPDATE for threaded task replies (recommended)
Add a **Condition**: `inReplyTo` is not empty.
- **If yes (a reply):** Office 365 Outlook → **"Reply to email (V3)"**
  - Message Id: `@{triggerBody()?['inReplyTo']}`
  - Body: `@{triggerBody()?['bodyHtml']}` (Is HTML = Yes)
  - Reply All: your choice; To/CC override available in V3 if needed.
  - This keeps the reply in the original Outlook conversation.
- **If no (a brand-new email, e.g. "follow up internally"):** keep **"Send an
  email (V2)"** with To/Subject/Body as above.

That single Condition is the only change required for the upcoming
"email actions from tasks" feature. The app already sends `inReplyTo` on replies
and will omit it on a fresh compose.

### Identity
Flow B sends as `Jordan.Francis@merit.com`. `fromIdentity` is reserved for
multi-account routing; Sloan's send address is still TBD (the app refuses to send
as `sloan` until provided).

---

## After editing a flow
Re-copy Flow B's HTTP trigger URL if it regenerates, and update
`POWER_AUTOMATE_REPLY_URL` in Vercel. Test from the app's reply UI; a 200 from the
flow means it sent.
