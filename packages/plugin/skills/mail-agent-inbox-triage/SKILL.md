---
name: mail-agent-inbox-triage
description: Triage a Mail Agent inbox into actionable buckets such as urgent, needs reply soon, waiting, and FYI.
---

# Mail Agent Inbox Triage

Use this skill for direct inbox-triage requests.

- Default to recent inbox mail unless the user asks for a broader audit.
- Start with `search_messages` and only read full bodies for the shortlist.
- Return explicit buckets such as `Urgent`, `Needs reply soon`, `Waiting`, and `FYI`.
- Include sender, subject, reason, and likely next action for each item.
