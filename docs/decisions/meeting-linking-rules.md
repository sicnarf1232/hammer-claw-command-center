# Meeting linking rules

Status: proposed for Jordan's approval

## Plain-language decision

The app may suggest who owns a meeting action and which account it belongs to, but it must show why. If the answer is not clear, it must ask Jordan rather than guess.

## Matching order

### People

1. Exact stable person ID already associated with the transcript attendee or meeting record.
2. Exact normalized email address.
3. Confirmed person alias.
4. Exact normalized full name when only one active person matches.
5. A single strong contextual match supported by meeting attendance, internal/customer classification, and account relationship.
6. Otherwise leave unassigned and show candidates for review.

First-name-only matching is never enough when more than one plausible person exists.

### Accounts

1. Jordan's confirmed meeting account.
2. Exact account ID supplied by an existing linked series or trusted source record.
3. Exact normalized account name from the known account list.
4. A single strong match supported by external attendees and their confirmed account relationships.
5. Otherwise leave the meeting/action account unassigned and show candidates.

An internal meeting may concern one or more customer accounts without becoming a customer meeting. `primary account` and `related accounts` are separate concepts.

## Action ownership states

Every action has one explicit state:

- `assigned`: linked to a confirmed person ID.
- `suggested`: one suggested person, awaiting review.
- `ambiguous`: multiple plausible people.
- `unassigned`: no reliable candidate.
- `group`: owned by a team or function rather than an individual.
- `rejected`: Jordan confirmed that the extracted text was not an action.

## Evidence and explanation

Suggestions must carry structured reasons such as:

- Named directly as the owner in the transcript or note.
- Appeared in the meeting attendee list.
- Email address exactly matched a person.
- Confirmed alias matched a person.
- Person is connected to the confirmed meeting account.
- Meeting was already linked to the account.
- Action text names a different account from the meeting's primary account.

The interface should display a short human explanation, not an opaque score.

## Human corrections

- Approval stores the confirmed person/account IDs and the identity of the confirmer.
- Changing a suggestion preserves the original suggestion and its explanation.
- Confirmed aliases and corrections may improve future matching.
- Automated reprocessing never overwrites a confirmed link.
- Creating a missing person or account happens as an explicit reviewed action.

## Stable action identity

Markdown line number is source evidence, not permanent identity.

Each extracted action needs a stable action ID. The ID is carried through proposal review, approved meeting storage, task creation, note editing, and activity history. A source excerpt/hash may help detect the same extraction, but it must not replace the stored action ID after approval.

## Editing behavior

- Reorder: preserves action ID and links.
- Edit wording: preserves action ID and stores the approved wording.
- Split: original action is superseded by two or more new action IDs.
- Merge: source actions are superseded by one new action ID.
- Reject: preserves the extraction and review decision but creates no active task.
- Remove after approval: archives/cancels the linked action. It must not silently leave a stale active task.
- Reprocess transcript: updates only unconfirmed suggestions and never duplicates confirmed actions.

## Audit requirements

Retain:

- Original extracted action and owner/account text
- Source transcript excerpt or source-section reference
- Suggested person and account IDs
- Explanation and confidence
- Model identifier or deterministic matcher version
- Approved wording and final links
- Reviewer and review time
- Supersession/rejection history

