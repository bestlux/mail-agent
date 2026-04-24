---
name: mail-agent
description: Work with email, calendars, and contacts through the local Mail Agent daemon. Use when the user wants inbox triage, thread summaries, reply drafts, outbound sends, mailbox cleanup, calendar review, or contact lookup with explicit delete confirmation.
---

# Mail Agent

Use this skill as the default operating brief for `mail-agent`.

Treat the tool contract as canonical. Providers differ underneath, but the workflow should stay the same.

## Defaults

- Search first.
- Read enough context to be right.
- Draft before send unless the user explicitly wants immediate send.
- Prefer narrow, recent, auditable queries over broad mailbox dumps.
- State the search scope when summarizing or inferring status.

## Core flow

- Use `list_accounts` if the target account is unclear.
- Use `list_mailboxes` when mailbox scope or destination is ambiguous.
- Use `search_messages` to build a shortlist.
- Prefer `collapseThreads: true` for broad scans.
- Use `excludeMailingLists: true` for person-to-person workflows.
- Use `read_thread` when chronology, commitments, or tone matter.
- Use `read_message_batch` when snippets are not enough but full-thread history is unnecessary.
- Use `refresh: true` when polling after send or mutation.

## Mail

- Start with sender, recipient, subject, unread state, mailbox role, and date range before broad text search.
- Prefer provider-neutral filters before mailbox ids or provider-specific labels.
- When results are large, summarize the shortlist first and expand only as needed.
- Preserve recipients, dates, and commitments unless the user asks to change them.
- Match the thread tone by default.
- If recipient scope is ambiguous, draft the safest version and surface the assumption.

## Mutations

- `archive_messages`, `move_messages`, `tag_messages`, and `mark_messages` are normal tools.
- Use `dryRun: true` first when the user asks for a preview, when message ids came from a broad search, or when the destination/tags/flags need one last check.
- `send_message` is allowed, but only send when the user clearly wants the message sent.
- Verify mailbox destinations before moving, especially on Gmail where mailbox-like behavior is label-based.
- Gmail permanent delete may require broader auth than normal mail actions. If delete fails with a scope message, surface that clearly instead of retrying blindly.
- `delete_messages` is always two-step:
  1. call without `confirmationToken`
  2. inspect the returned token
  3. repeat only if permanent deletion is clearly intended

Never imply delete is reversible unless the provider behavior is known.

## Calendar

- Use `list_calendars` if the target calendar is unclear.
- Use bounded `get_events` windows.
- Summaries should lead with upcoming events, then conflicts, then prep/travel concerns.
- If no events are returned, say that directly.

## Contacts

- Use `search_contacts` for fragments.
- Use `get_contact` for an exact contact or shortlist winner.
- Call out fuzzy matches.
- Lead with the most actionable fields: email, phone, organization.
- For Google accounts, remember this searches actual Google Contacts, not every person the user has emailed.
- If contact data is sparse, say the address book may be sparse rather than implying lookup failure.

## Inference

- `since` and `until` accept RFC3339 or `YYYY-MM-DD`.
- Prefer recent bounded windows for triage, hiring-process tracking, and follow-up checks.
- If inferring status from correspondence, label it as an estimate from the latest mail, not a system-of-record fact.

## Workflow references

- Search and shortlist guidance: [references/search-workflow.md](./references/search-workflow.md)
- Reply drafting guidance: [references/reply-workflow.md](./references/reply-workflow.md)
- Forward and handoff guidance: [references/forward-workflow.md](./references/forward-workflow.md)
- Mutation safety guidance: [references/safety-workflow.md](./references/safety-workflow.md)
