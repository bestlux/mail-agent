# mail-agent

`mail-agent` is a Fastmail-first, cross-platform Codex plugin bundle for agent-friendly mail, calendar, and contacts workflows. It packages:

- a local MCP daemon for structured tools
- a Codex plugin bundle with mailbox skills
- an install command that places the plugin into a local Codex marketplace

## Status

This is a v0.1 scaffold with working Fastmail-oriented adapters:

- Mail: JMAP search, read, draft, send, archive, move, tag, mark, delete confirmation
- Calendar: CalDAV read operations
- Contacts: CardDAV read operations

The generic provider seams are present but only Fastmail is supported in v1.

## Quick start

```powershell
corepack pnpm install
corepack pnpm build
node packages/plugin/dist/bin/mail-agent.js doctor
node packages/plugin/dist/bin/mail-agent.js install
node packages/plugin/dist/bin/mail-agent.js auth fastmail --account personal
```

The install step writes a local plugin under `~/plugins/mail-agent` and updates `~/.agents/plugins/marketplace.json`.

## Configuration

The runtime keeps local state under the OS config directory:

- Windows: `%APPDATA%/mail-agent`
- macOS: `~/Library/Application Support/mail-agent`
- Linux: `$XDG_CONFIG_HOME/mail-agent` or `~/.config/mail-agent`

Secrets default to OS keychain via `keytar`. For CI and tests, set `MAIL_AGENT_SECRET_BACKEND=file` to use a local JSON secret store.

## Development

```powershell
corepack pnpm install
corepack pnpm test
corepack pnpm build
```

## Support policy

- Fastmail is the only documented and tested provider in v1.
- No OAuth flow in v1. Use Fastmail API tokens and app passwords.
- Calendar and contacts are read-only in v1.
- Delete always requires an explicit confirmation token.
