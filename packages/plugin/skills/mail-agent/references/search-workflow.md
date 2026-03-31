# Search Workflow

- Prefer `search_messages` over reading full threads immediately.
- Start with tight scopes: sender, recipient, subject, mailbox, unread state, and recent dates.
- Prefer `collapseThreads: true` for broad inbox and hiring-process scans.
- Use `mailboxRole` before hardcoded mailbox names when the user means a standard mailbox like inbox or archive.
- Remember that providers may implement mailbox-like behavior differently. Gmail is label-based; Fastmail is mailbox-based.
- Use `excludeMailingLists: true` when you need person-to-person mail rather than alerts and newsletters.
- Use `list_mailboxes` before archive or folder-specific searches if the mailbox id is unknown.
- Use `refresh: true` when you are polling for a message that should have arrived moments ago or after a mutation that should be visible immediately.
- Treat `search_messages` results as shortlist material. Escalate to `read_thread` only when thread context changes the answer.
- Use `read_message_batch` when snippets are insufficient but the whole thread is unnecessary.
- State the scan scope in summaries, especially when the search is narrow or sampled.
- If you infer process status from correspondence, distinguish direct evidence from your estimate.
