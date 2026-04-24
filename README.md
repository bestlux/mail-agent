# mail-agent

`mail-agent` is a Codex plugin and local MCP daemon for email, calendar, and contacts.

It gives Codex structured tools for real mailbox workflows: search mail, read threads, draft replies, send when allowed, clean up messages, review calendars, and look up contacts. Credentials stay on your machine.

## Quick Start From Source

Requirements:

- Node `22+`
- `pnpm` through Corepack
- Codex with plugins enabled
- A Fastmail account or Google account

Build and install the local plugin:

```powershell
git clone https://github.com/bestlux/mail-agent.git
cd mail-agent
corepack pnpm install
corepack pnpm build
node packages/plugin/dist/bin/mail-agent.js install
```

Authenticate one account:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal --email you@fastmail.com
```

or:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google --account gmail --email you@gmail.com --client-id <client-id>
```

Check the install:

```powershell
node packages/plugin/dist/bin/mail-agent.js doctor
```

`doctor` reports runtime paths, account credential status, Google scopes, delete support, and provider-specific repair commands when credentials are missing.

`install` copies the plugin bundle to `~/.codex/plugins/mail-agent` and registers it through `~/.agents/plugins/marketplace.json`.

## What Codex Gets

After install, Codex can load:

- the `Mail Agent` plugin
- a local stdio MCP server named `mail-agent`
- workflow skills:
  - `mail-agent`
  - `mail-agent-inbox-triage`
  - `calendar-brief`
  - `contacts-lookup`

Useful prompts:

- "Use `mail-agent` to summarize the latest recruiter thread and draft the reply."
- "Use `mail-agent-inbox-triage` to sort unread inbox mail into urgent, reply soon, waiting, and FYI."
- "Use `calendar-brief` to summarize my next two days and flag conflicts."
- "Use `contacts-lookup` to find Jane from Acme and confirm her best email."

## Supported Providers

Fastmail:

- mail through `JMAP`
- calendars through `CalDAV`
- contacts through `CardDAV`

Google:

- mail through the Gmail API
- calendars through the Google Calendar API
- contacts through the People API

Calendar and contact writes are not supported in v1.

## Tool Surface

Mail:

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

Calendar and contacts:

- `list_calendars`
- `get_events`
- `search_contacts`
- `get_contact`

The tool names are provider-neutral. The daemon handles Fastmail and Google differences underneath.

## Safety Defaults

`mail-agent` is designed to be useful without being reckless:

- message reads return text by default, omit HTML by default, and cap long bodies
- use `bodyMode: "full"`, `includeHtml: true`, and `maxBodyChars` only when a workflow needs more source body content
- `send_message` is available only after account auth and policy allow it
- archive, move, tag, and mark support `dryRun: true` previews before applying provider changes
- `delete_messages` is always a two-step flow: first request a confirmation token, then repeat with that token only if permanent deletion is still intended
- calendars and contacts are read-only in v1

For follow-up checks after sends or mutations, use `refresh: true` on search tools to bypass short-lived cache entries.

## Fastmail Setup

Fastmail needs two credentials:

1. a `JMAP API token` for mail
2. an app password for CalDAV/CardDAV calendars and contacts

The interactive auth flow prompts for both. You can also pass them directly:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth fastmail `
  --account personal `
  --email you@fastmail.com `
  --jmap-token <token> `
  --app-password <app-password>
```

## Google Setup

Google uses installed-app OAuth with a local loopback redirect. The auth flow opens a browser, asks for consent, and stores a refresh token locally.

Before running `auth google`:

1. Create or choose a Google Cloud project.
2. Configure the OAuth consent screen or Google Auth platform branding.
3. Set user type to `External`.
4. Keep the app in `Testing`.
5. Add your Gmail account under `Test users`.
6. Enable the Gmail API, Google Calendar API, and People API.
7. Create an OAuth client with application type `Desktop app`.
8. Use that client ID with `mail-agent auth google`.

Example:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google `
  --account gmail `
  --email you@gmail.com `
  --client-id <client-id>
```

If browser launch is flaky:

```powershell
node packages/plugin/dist/bin/mail-agent.js auth google `
  --account gmail `
  --email you@gmail.com `
  --client-id <client-id> `
  --no-open-browser
```

Optional flags:

- `--client-secret <secret>` if your Google client includes one
- `--full-gmail-access` if you want permanent Gmail delete support
- `--redirect-host 127.0.0.1`
- `--redirect-port 4567`

Default Google scopes:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

`--full-gmail-access` swaps the mail scope to `https://mail.google.com/`, which is broader than the default and may be required for permanent Gmail delete.

Google Contacts only searches saved Google Contacts. It does not search everyone you have emailed.

Useful references:

- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Gmail API quickstart for Node.js](https://developers.google.com/workspace/gmail/api/quickstart/nodejs)
- [Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [People API contacts guide](https://developers.google.com/people/v1/contacts)

## Install From npm

The public package name is `mail-agent`.

Once the first npm release is live, the normal install path will be:

```powershell
npx mail-agent install
```

or, if you want the CLI on your path:

```powershell
npm install -g mail-agent
mail-agent install
mail-agent auth fastmail --account personal --email you@fastmail.com
mail-agent auth google --account gmail --email you@gmail.com --client-id <client-id>
mail-agent doctor
```

The repo also publishes `@iomancer/mail-agent-daemon` and `@iomancer/mail-agent-shared` as support packages. Most users should install only `mail-agent`.

## Runtime And Secrets

Runtime state lives under your OS config directory:

- Windows: `%APPDATA%\mail-agent`
- macOS: `~/Library/Application Support/mail-agent`
- Linux: `$XDG_CONFIG_HOME/mail-agent` or `~/.config/mail-agent`

Secrets default to the OS keychain through `keytar`.

For development or CI, you can force file-backed secrets:

```powershell
$env:MAIL_AGENT_SECRET_BACKEND='file'
```

That stores credentials in the runtime directory instead of the OS keychain. It is useful for local tests and CI, but not ideal for day-to-day use.

If your package manager blocks native postinstall scripts, `keytar` may need explicit build approval before the keychain backend works.

## Search Tips

- Use `collapseThreads: true` for broad scans.
- Use `mailboxRole` before hardcoding mailbox names.
- Use `excludeMailingLists: true` for person-to-person workflows.
- `since` and `until` accept RFC3339 timestamps or `YYYY-MM-DD`.
- Use `list_mailboxes` before mutations, especially on Gmail where labels behave differently from folders.

## Repo Layout

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

## Releases

Releases are meant to go through GitHub Actions.

The happy path is:

1. Bump the workspace version across the root package and three publishable packages.
2. Push a tag like `v0.2.0`.
3. Let `.github/workflows/publish.yml` build, test, dry-run, and publish to npm.

Release details live in [RELEASING.md](./RELEASING.md).

## Current Limits

- no calendar writes
- no contact writes
- no full local mailbox mirror
- no Microsoft Graph support yet
- no generic IMAP/SMTP or generic CalDAV/CardDAV onboarding as first-class flows
- contact search is a pragmatic address-book scan, not a server-side indexed search engine
- event parsing is intentionally lightweight and does not aim to be a full iCalendar implementation yet

## More Docs

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
