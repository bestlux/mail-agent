# Search Workflow

- Prefer `search_messages` over reading full threads immediately.
- Start with tight scopes: sender, subject, mailbox, unread state, and recent dates.
- Prefer `collapseThreads: true` for broad inbox and hiring-process scans.
- Use `excludeMailingLists: true` when you need person-to-person mail rather than alerts and newsletters.
- Use `list_mailboxes` before archive or folder-specific searches if the mailbox id is unknown.
- Treat `search_messages` results as shortlist material. Escalate to `read_thread` only when thread context changes the answer.
- Use `read_message_batch` when snippets are insufficient but the whole thread is unnecessary.
- State the scan scope in summaries, especially when the search is narrow or sampled.
