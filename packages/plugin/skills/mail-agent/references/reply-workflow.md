# Reply Workflow

- Read the latest relevant message before drafting.
- Match the existing tone unless the user asks for a change.
- Default to `draft_reply` when the user says "reply" but has not explicitly asked to send.
- Preserve recipients, dates, and commitments from the thread unless the user asks to change them.
- If recipient scope is ambiguous, draft the body and call out the safest audience assumption.
