# Safety Workflow

- `send_message`, `archive_messages`, `move_messages`, `tag_messages`, and `mark_messages` are allowed in trusted mode.
- Prefer draft-first behavior even though send is available.
- Use `dryRun: true` with `archive_messages`, `move_messages`, `tag_messages`, and `mark_messages` when the user asks to preview a cleanup, when message ids were inferred from search, or when the destination/tags/flags have not already been confirmed.
- Inspect the dry-run preview before applying the real mutation without `dryRun`.
- `delete_messages` is always a two-step destructive flow:
  1. call without `confirmationToken`
  2. inspect the returned token and only repeat the call if permanent deletion is still intended
- Calendar and contact reads are safe in v1.
- Do not imply that calendar or contact writes exist in v1.
- If a mutation result should be immediately visible, use `refresh: true` on the follow-up search.
