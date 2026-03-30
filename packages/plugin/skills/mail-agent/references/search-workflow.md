# Search Workflow

- Prefer `search_messages` over reading full threads immediately.
- Start with tight scopes: sender, subject, mailbox, unread state, and recent dates.
- Treat `search_messages` results as shortlist material. Escalate to `read_thread` only when thread context changes the answer.
- Use `read_message_batch` when snippets are insufficient but the whole thread is unnecessary.
- State the scan scope in summaries, especially when the search is narrow or sampled.
