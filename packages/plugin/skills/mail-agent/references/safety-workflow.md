# Safety Workflow

- `send_message`, `archive_messages`, `move_messages`, `tag_messages`, and `mark_messages` are allowed in trusted mode.
- `delete_messages` is always a two-step destructive flow:
  1. call without `confirmationToken`
  2. inspect the returned token and only repeat the call if permanent deletion is still intended
- Calendar and contact reads are safe in v1.
- Do not imply that calendar or contact writes exist in v1.
