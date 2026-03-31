# mail-agent

`mail-agent` is a Codex plugin plus local daemon for email, calendar, and contacts workflows.

The idea is simple: give Codex structured tools for mail instead of making it pretend a human mail client is an API.

Right now the repo supports Fastmail and Google. Fastmail uses native protocol access. Google uses OAuth plus the Gmail, Calendar, and People APIs.

## What you get

The repo ships three coordinated pieces:

- `mail-agent`: the public CLI and Codex plugin bundle
- `@mail-agent/daemon`: the local MCP daemon that exposes structured tools
- `@mail-agent/shared`: shared runtime, config, policy, and secret-store logic

Most people only care about `mail-agent`. The other two packages exist so the plugin can stay cleanly split between CLI, daemon, and shared runtime code.

## Current support

v1 currently supports two providers:

- Fastmail
  - mail via `JMAP`
  - calendar via `CalDAV`
  - contacts via `CardDAV`
- Google
  - mail via the Gmail API
  - calendar via the Google Calendar API
  - contacts via the People API

Across those providers, the daemon exposes the same agent-facing tool surface:

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
- `delete_messages` with explicit confirmation
- `list_calendars`
- `get_events`
- `search_contacts`
- `get_contact`

The tool names are provider-generic on purpose. The adapter layer handles the provider-specific transport and semantics underneath.

## Why this exists

Most mailbox integrations for agents land in one of two camps:

- vendor-specific APIs with weak workflow guidance
- general-purpose mail clients that were designed for humans, not models

`mail-agent` takes a different route:

- structured tool contracts instead of terminal scraping
- skills that teach Codex how to search, shortlist, summarize, draft, and mutate safely
- local-first setup so credentials stay on your machine
- provider-native integrations instead of flattening everything to IMAP first
- an explicit safety model for sends and destructive actions

## Mental model

At runtime the flow is:

1. Codex loads the local `Mail Agent` plugin bundle.
2. The plugin starts a local stdio MCP server named `mail-agent`.
3. The daemon reads local account config plus secrets from the OS keychain or a file-backed development store.
4. The daemon talks to the configured provider through native APIs or protocols:
   - Fastmail: `JMAP`, `CalDAV`, `CardDAV`
   - Google: Gmail API, Google Calendar API, People API
5. Skills tell the agent how to use the tools well, not just that the tools exist.

That last point matters. Tools make actions possible. Skills make the agent behave like it has some judgment.

## What Codex sees

After install, Codex sees:

- a plugin called `Mail Agent`
- a local MCP server called `mail-agent`
- workflow skills:
  - `mail-agent`
  - `mail-agent-inbox-triage`
  - `calendar-brief`
  - `contacts-lookup`

Example prompts:

- "Use `mail-agent` to summarize the latest recruiter thread and draft the reply."
- "Use `mail-agent-inbox-triage` to sort unread inbox mail into urgent, reply soon, waiting, and FYI."
- "Use `calendar-brief` to summarize my next two days and flag conflicts."
- "Use `contacts-lookup` to find Jane from Acme and confirm her best email."

## If You Just Want To Run It

```powershell
git clone https://github.com/bestlux/mail-agent.git
cd mail-agent
corepack pnpm install
corepack pnpm build
node packages/plugin/dist/bin/mail-agent.js install
```

Then auth whichever account you want first:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal --email you@fastmail.com
```

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google --account gmail --email you@gmail.com --client-id <client-id>
```

Then check the runtime:

```powershell
node packages/plugin/dist/bin/mail-agent.js doctor
```

## Requirements

- Node `22+`
- `pnpm` via Corepack
- Codex with plugins enabled
- At least one supported account:
  - Fastmail with a `JMAP API token` plus an `app password` for CalDAV/CardDAV
  - Google with a Google Cloud OAuth desktop client and the Gmail, Calendar, and People APIs enabled

Notes:

- v1 supports Fastmail credentials directly and Google via OAuth loopback auth.
- v1 does not support calendar or contact writes.
- `delete_messages` is always gated, even in trusted mode.

## Install from source

Clone and build the workspace:

```powershell
git clone https://github.com/bestlux/mail-agent.git
cd mail-agent
corepack pnpm install
corepack pnpm build
```

Install the local plugin bundle into Codex:

```powershell
node packages/plugin/dist/bin/mail-agent.js install
```

Auth a Fastmail account:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal --email you@fastmail.com
```

Auth a Google account:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google --account gmail --email you@gmail.com --client-id <client-id>
```

Run a health check:

```powershell
node packages/plugin/dist/bin/mail-agent.js doctor
```

## Install from npm

The release layout is designed so the public package is `mail-agent`, with `@mail-agent/daemon` and `@mail-agent/shared` published alongside it as internal support packages.

After the packages are published, the intended CLI install is:

```powershell
npm install -g mail-agent
mail-agent install
mail-agent auth fastmail --account personal --email you@fastmail.com
mail-agent auth google --account gmail --email you@gmail.com --client-id <client-id>
mail-agent doctor
```

## Fastmail setup

You need two credentials:

1. `JMAP API token`
2. `app password` for CalDAV/CardDAV

The interactive auth flow prompts for both. You can also pass them non-interactively:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail `
  --account personal `
  --email you@fastmail.com `
  --jmap-token <token> `
  --app-password <app-password>
```

Fastmail uses two auth surfaces by design:

- mail uses `JMAP` with the API token
- calendar and contacts use `CalDAV` and `CardDAV` with the app password

## Google setup

Google support uses installed-app OAuth with a local loopback redirect. The flow opens your browser, asks for consent, and stores the resulting refresh token locally so the daemon can refresh access tokens without prompting every run.

Before running `auth google`, set up Google Cloud:

1. Create or choose a Google Cloud project.
2. Configure the OAuth consent screen.
3. Enable the Gmail API, Google Calendar API, and People API.
4. Create an OAuth client with application type `Desktop app`.
5. Use that client ID when running `mail-agent auth google`.

Example:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google `
  --account gmail `
  --email you@gmail.com `
  --client-id <client-id>
```

Optional flags:

- `--client-secret <secret>` if your Google client includes one
- `--full-gmail-access` if you want permanent Gmail delete support
- `--redirect-host 127.0.0.1`
- `--redirect-port 4567`

Current default Google scopes:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

If you want Gmail `delete_messages` to permanently delete instead of stopping with a scope error, re-auth with:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google `
  --account gmail `
  --email you@gmail.com `
  --client-id <client-id> `
  --full-gmail-access
```

That swaps the mail scope to `https://mail.google.com/`, which is broader than the default.

Useful official references:

- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Gmail API quickstart for Node.js](https://developers.google.com/workspace/gmail/api/quickstart/nodejs)
- [Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [People API contacts guide](https://developers.google.com/people/v1/contacts)

Two practical notes:

- sensitive scopes can trigger the "unverified app" screen during testing
- the redirect URI used by the loopback flow must exactly match the configured OAuth client redirect

## Runtime and secret storage

Runtime state lives under your OS config directory:

- Windows: `%APPDATA%\mail-agent`
- macOS: `~/Library/Application Support/mail-agent`
- Linux: `$XDG_CONFIG_HOME/mail-agent` or `~/.config/mail-agent`

Secrets default to the OS keychain via `keytar`.

For testing or CI you can force file-backed secrets:

```powershell
$env:MAIL_AGENT_SECRET_BACKEND='file'
```

That stores credentials in the runtime directory instead of the OS keychain. Fine for local development and CI. Not ideal for day-to-day use.

If your package manager blocks native postinstall scripts, `keytar` may need explicit build approval before the keychain backend works.

Stored secret material depends on the provider:

- Fastmail stores `username`, `JMAP` token, and DAV password
- Google stores the OAuth access token, refresh token, expiry, scopes, and client metadata needed for refresh

## Safety model

`mail-agent` is meant to be useful without being reckless.

- `send_message` is available only after account auth and policy allow it
- archive, move, tag, and mark are allowed in trusted mode
- `delete_messages` is always a two-step flow
- calendar and contacts are read-only in v1

Delete is intentionally explicit:

1. first call requests a confirmation token
2. second call repeats the delete with that token

That keeps permanent deletion out of the "oops, the agent inferred too much" category.

## Search notes that matter in real use

The search tool is where most real workflows start, so the useful details are worth calling out:

- `collapseThreads: true` keeps broad scans readable
- `mailboxRole` is better than hardcoded mailbox names when possible
- `excludeMailingLists: true` helps for person-to-person scans
- `since` and `until` accept RFC3339 timestamps or `YYYY-MM-DD`
- `refresh: true` bypasses short-lived cache entries when polling after send or mutation

Provider notes:

- Fastmail exposes real mailboxes
- Gmail exposes labels plus a pseudo `Archive` mailbox role
- the tool contract normalizes those differences enough for agents to work reliably, but `list_mailboxes` is still worth using before mutations

Those knobs are there because they make real agent workflows noticeably better.

## Repo layout

```text
packages/
  plugin/   Codex plugin bundle, CLI, installer, skills
  daemon/   local MCP daemon and provider adapters
  shared/   runtime paths, config, cache, policy, secret handling

.github/    CI and contributor-facing GitHub configuration
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

Check package contents before publishing:

```powershell
corepack pnpm pack:check
```

Dry-run the workspace publish flow:

```powershell
corepack pnpm release:dry-run
```

Run the daemon directly:

```powershell
node packages/plugin/dist/bin/mail-agent.js daemon
```

## Support policy

Supported in v1:

- Fastmail mail via `JMAP`
- Fastmail calendars via `CalDAV` read operations
- Fastmail contacts via `CardDAV` read operations
- Google mail via Gmail API
- Google calendars via Google Calendar API read operations
- Google contacts via People API read operations

Not supported in v1:

- calendar writes
- contact writes
- full local mailbox mirroring
- Microsoft Graph
- generic IMAP/SMTP or generic CalDAV/CardDAV onboarding as first-class flows

## Caveats

- Fastmail mail auth and DAV auth are separate by design
- Google OAuth requires a Google Cloud OAuth desktop client
- Gmail semantics are label-based, so archive and mailbox-like moves are normalized rather than perfectly folder-native
- contact search is a pragmatic address-book scan, not a server-side indexed search engine
- event parsing is intentionally lightweight and does not aim to be a full iCalendar implementation yet

## Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [PRIVACY.md](./PRIVACY.md)
- [TERMS.md](./TERMS.md)
- [SUPPORT.md](./SUPPORT.md)
- [RELEASING.md](./RELEASING.md)

## Roadmap

Near-term improvements:

- stronger recurrence and event parsing
- richer contact matching
- Microsoft Graph support
- generic protocol fallback adapters
- optional local indexing for heavier research workflows
- more polished release automation
