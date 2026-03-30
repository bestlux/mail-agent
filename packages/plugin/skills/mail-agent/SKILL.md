---
name: mail-agent
description: Work with mail, calendar, and contacts through the local Mail Agent daemon. Use when the user wants inbox triage, thread summaries, reply drafts, outbound sends, mailbox cleanup, calendar review, or contact lookup with explicit delete confirmation.
---

# Mail Agent

## Overview

Use this skill to operate against configured `mail-agent` accounts through the local daemon. Prefer mailbox analysis before mutation, keep reply drafting separate from send unless the user is explicit, and remember that destructive delete requires a confirmation-token round trip.

## Core Defaults

- Start with `search_messages` for mailbox discovery and shortlist work.
- Use `read_thread` when thread context changes the answer or reply tone.
- Use `read_message_batch` for a tight shortlist where full bodies matter.
- Default to `compose_message` or `draft_reply` before `send_message`.
- Use `archive_messages`, `move_messages`, `tag_messages`, and `mark_messages` for trusted automation flows.
- Treat `delete_messages` as a gated destructive action. First request the confirmation token, then call again with that token only if the user clearly wants permanent deletion.

## Accounts

- Use `list_accounts` first if the requested account is unclear.
- Fastmail is the only supported provider in v1 even though the tool names are generic.

## Workflow References

- Search and shortlist guidance: [references/search-workflow.md](./references/search-workflow.md)
- Reply drafting guidance: [references/reply-workflow.md](./references/reply-workflow.md)
- Forward and handoff guidance: [references/forward-workflow.md](./references/forward-workflow.md)
- Mutation safety guidance: [references/safety-workflow.md](./references/safety-workflow.md)
