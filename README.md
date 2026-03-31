# mail-agent

`mail-agent` is a Fastmail-first Codex plugin that gives agents a structured way to work with email, calendars, and contacts without scraping a human mail client.

It bundles three things:

- a local MCP daemon with typed tools for mail, calendar, and contacts
- a Codex plugin bundle with mailbox-focused skills
- a small CLI for install, auth, health checks, and local setup

If you want Codex to do inbox triage, thread summaries, reply drafting, trusted mailbox actions, calendar briefs, and contact lookup from one local integration, this is the repo.

## What it does

Current v1 behavior:

- Mail via Fastmail `JMAP`
  - list mailboxes
  - search
  - read message batches
  - read threads
  - compose
  - draft replies
  - send
  - archive
  - move
  - tag
  - mark
  - delete with explicit confirmation token
- Calendar via Fastmail `CalDAV`
  - list calendars
  - read events
- Contacts via Fastmail `CardDAV`
  - list address books
  - search contacts
  - fetch a single contact

The tool names are provider-generic, but Fastmail is the only supported provider in v1.

## Why this exists

Most mail integrations for agents fall into one of two buckets:

- thin wrappers around a single SaaS mailbox
- generic email clients that are great for humans and awkward for agents

`mail-agent` takes the other route:

- structured tool contracts instead of terminal scraping
- mailbox workflows designed for agent use, not for a human UI
- skills that tell Codex how to search, shortlist, draft, and mutate safely
- local-first setup so your account stays under your control

## How Codex sees it

After install, Codex gets:

- a plugin called `Mail Agent`
- a local stdio MCP server named `mail-agent`
- skills for:
  - `mail-agent`
  - `mail-agent-inbox-triage`
  - `calendar-brief`
  - `contacts-lookup`

That means you can ask Codex things like:

- "Use `mail-agent` to summarize the latest recruiter thread and draft the reply."
- "Use `mail-agent-inbox-triage` to sort unread inbox mail into urgent, reply soon, waiting, and FYI."
- "Use `calendar-brief` to summarize my next two days and flag conflicts."
- "Use `contacts-lookup` to find Jane from Acme."

## Requirements

- Node `22+`
- `pnpm` via Corepack
- Codex with plugins enabled
- A Fastmail account with:
  - a `JMAP API token` for mail
  - an `app password` for CalDAV/CardDAV

Notes:

- v1 does not use OAuth.
- v1 does not support calendar/contact writes.
- `delete_messages` is always gated, even in trusted mode.

## Install

Clone the repo and build it:

```powershell
git clone https://github.com/iomancer/mail-agent.git
cd mail-agent
corepack pnpm install
corepack pnpm build
```

Install the local plugin bundle into your Codex marketplace:

```powershell
node packages/plugin/dist/bin/mail-agent.js install
```

That writes:

- plugin bundle: `~/plugins/mail-agent`
- marketplace entry: `~/.agents/plugins/marketplace.json`

On Windows that usually means:

- plugin bundle: `C:\Users\<you>\plugins\mail-agent`
- marketplace entry: `C:\Users\<you>\.agents\plugins\marketplace.json`

## Fastmail setup

You need two credentials:

1. `JMAP API token`
2. `app password` for CalDAV/CardDAV

Authenticate a Fastmail account:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal --email you@fastmail.com
```

The CLI will prompt for:

- Fastmail JMAP API token
- Fastmail app password for CalDAV/CardDAV

You can also pass them non-interactively:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail `
  --account personal `
  --email you@fastmail.com `
  --jmap-token <token> `
  --app-password <app-password>
```

## Quick start

Check that the runtime is healthy:

```powershell
node packages/plugin/dist/bin/mail-agent.js doctor
```

Typical local workflow:

```powershell
corepack pnpm install
corepack pnpm build
node packages/plugin/dist/bin/mail-agent.js install
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal --email you@fastmail.com
node packages/plugin/dist/bin/mail-agent.js doctor
```

## Runtime and secrets

Runtime state lives under your OS config directory:

- Windows: `%APPDATA%\mail-agent`
- macOS: `~/Library/Application Support/mail-agent`
- Linux: `$XDG_CONFIG_HOME/mail-agent` or `~/.config/mail-agent`

By default, secrets use the OS keychain via `keytar`.

For testing or CI, you can force a file-backed secret store:

```powershell
$env:MAIL_AGENT_SECRET_BACKEND='file'
```

That stores secrets in the runtime directory instead of the OS keychain. Useful for local dev, not ideal for permanent use.

## Safety model

`mail-agent` is intentionally not a free-for-all.

- Mail send is allowed only after account auth and trust policy says yes.
- Archive, move, tag, and mark are allowed in trusted mode.
- Delete is always a two-step flow.
- Calendar and contacts are read-only in v1.

Delete specifically works like this:

1. first call returns a confirmation token
2. second call must include that token

This keeps destructive mailbox actions explicit even when everything else is trusted.

## Public tool surface

The daemon currently exposes:

- `list_accounts`
- `list_mailboxes`
- `search_messages`
- `read_message_batch`
- `read_thread`
- `compose_message`
- `draft_reply`
- `send_message`
- `archive_messages`
- `move_messages`
- `tag_messages`
- `mark_messages`
- `delete_messages`
- `list_calendars`
- `get_events`
- `search_contacts`
- `get_contact`

Notes:

- `search_messages` supports pagination, thread-collapsed search, mailbox-role filtering, and mailing-list exclusion.
- `since` and `until` accept RFC3339 timestamps or `YYYY-MM-DD`.

## Repo layout

```text
packages/
  shared/   shared types, config, caching, policy, secret handling
  daemon/   local MCP daemon and Fastmail protocol adapters
  plugin/   Codex plugin metadata, skills, CLI, and installer
```

## Development

Install dependencies:

```powershell
corepack pnpm install
```

Build everything:

```powershell
corepack pnpm build
```

Run tests:

```powershell
corepack pnpm test
```

Run the daemon directly:

```powershell
node packages/plugin/dist/bin/mail-agent.js daemon
```

## Current support policy

- Supported provider in v1: Fastmail
- Mail transport/API: JMAP
- Calendar: CalDAV read only
- Contacts: CardDAV read only
- No OAuth in v1
- No full local mailbox sync in v1
- No public standalone MCP product in v1 beyond the plugin's local daemon

## Known caveats

- Fastmail mail and DAV auth are intentionally separate:
  - JMAP API token for mail
  - app password for CalDAV/CardDAV
- If your package manager blocks native build scripts, `keytar` may not load until you approve or rebuild it.
- Contact search is intentionally simple in v1 and will behave more like a broad address-book scan than a server-side indexed search.
- Event parsing is currently pragmatic, not a full iCalendar engine.

## Roadmap

Planned next steps:

- better event parsing and recurrence handling
- stronger contact matching
- provider adapters beyond Fastmail
- optional local indexing/caching improvements
- better packaging for npm-based installs

## Contributing

Issues and PRs are welcome, especially around:

- provider adapters
- DAV edge cases
- richer mailbox workflows
- packaging and install ergonomics
- test coverage for weird real-world mailboxes

If you open a bug, include:

- OS
- Node version
- whether you used keychain or file-backed secrets
- whether the issue is JMAP, CalDAV, CardDAV, or plugin install related
