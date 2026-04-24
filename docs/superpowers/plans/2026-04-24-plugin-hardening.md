# Mail Agent Plugin Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Mail Agent from a working prototype-quality Codex plugin into a polished, safer, smaller, and more agent-friendly plugin ready to ship.

**Architecture:** Preserve the current three-package split: `packages/plugin` owns Codex packaging and CLI install, `packages/daemon` owns MCP tools and provider adapters, and `packages/shared` owns shared runtime/types/config/safety primitives. Harden the plugin in vertical slices: package/install correctness, response shaping, draft semantics, safety affordances, provider output normalization, auth diagnostics, and validation coverage.

**Tech Stack:** TypeScript, Node 22, pnpm workspaces, Vitest, MCP SDK, JMAP/Fastmail DAV, Google APIs, Codex plugin manifest under `.codex-plugin/plugin.json`.

---

## Current Baseline

The branch currently has uncommitted but validated plugin-layout fixes:

- `packages/shared/src/runtime.ts` installs local plugin bundles under `~/.codex/plugins`.
- `packages/plugin/src/installer.ts` writes marketplace paths relative to the marketplace root.
- `packages/plugin/test/install.test.ts` checks documented plugin layout and marketplace path resolution.

Keep those changes. Do not revert them.

Known audit findings this plan resolves:

- Full message reads can return huge `textBody` and `htmlBody` payloads.
- `draft_reply` behaves like a quoted reply envelope, not a semantic draft.
- Installed bundle includes source/test/dev files from vendored workspace packages.
- Google missing-secret errors are accurate but not actionable.
- Mutation tools lack preview/dry-run affordances.
- Calendar event output is too raw for agent use.
- Contact output includes noisy empty names and organization artifacts.
- Handler-level tests are thin for safety gates and installed bundle hygiene.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add message body shaping options and result metadata types.
  - Add mutation preview result types if needed by daemon handlers.

- Modify `packages/shared/src/errors.ts`
  - Add or reuse a typed auth/setup error surface with actionable remediation text.

- Modify `packages/shared/src/runtime.ts`
  - Keep current `~/.codex/plugins` install root change.

- Modify `packages/daemon/src/tools.ts`
  - Add schemas for read shaping and mutation dry-run flags.
  - Shape message details before returning MCP content.
  - Add provider auth/setup hint normalization at handler boundary.

- Modify `packages/daemon/src/server.ts`
  - Update tool descriptions so Codex knows defaults are safe and how to request full bodies.

- Modify `packages/daemon/src/providers/fastmail/mail-adapter.ts`
  - Keep provider transport behavior, but support preview/dry-run for mutation methods if implemented at adapter level.
  - Make `draftReply` a reply envelope helper or rename through tool layer.

- Modify `packages/daemon/src/providers/google/mail-adapter.ts`
  - Match Fastmail behavior for draft reply, body shaping inputs, and mutation previews.

- Modify `packages/daemon/src/providers/fastmail/calendar-adapter.ts`
  - Normalize simple ICS date values into ISO-like output where deterministic.
  - Preserve raw values only as optional fields if useful.

- Modify `packages/daemon/src/providers/fastmail/contacts-adapter.ts`
  - Filter empty contact values and normalize organizations.

- Modify `packages/plugin/src/installer.ts`
  - Keep current path fix.
  - Replace direct dependency directory copying with published package file copying.

- Modify `packages/plugin/test/install.test.ts`
  - Keep current plugin-layout tests.
  - Add installed bundle hygiene tests.

- Modify `packages/daemon/test/tools.test.ts`
  - Add handler-level tests for body shaping, auth hints, mutation dry-run, delete confirmation, and send/mutation policy gates.

- Modify `packages/daemon/test/mail-adapter.test.ts`
  - Add Fastmail adapter tests for draft reply semantics, calendar/contact normalization, and mutation preview if adapter-owned.

- Modify `packages/daemon/test/google-adapters.test.ts`
  - Add Google adapter parity tests for draft reply and mutation preview.

- Modify `packages/plugin/README.md` and root `README.md`
  - Document install location, safe read defaults, full-body opt-in, mutation preview, and auth repair commands.

---

### Task 1: Commit The Current Plugin Layout Fixes

**Files:**
- Modify already staged-by-content: `packages/shared/src/runtime.ts`
- Modify already staged-by-content: `packages/plugin/src/installer.ts`
- Modify already staged-by-content: `packages/plugin/test/install.test.ts`

- [ ] **Step 1: Review current diff**

Run:

```powershell
git diff -- packages/shared/src/runtime.ts packages/plugin/src/installer.ts packages/plugin/test/install.test.ts
```

Expected: only the `~/.codex/plugins` install root, relative marketplace path, and plugin-layout tests are present.

- [ ] **Step 2: Run focused validation**

Run:

```powershell
corepack pnpm --filter mail-agent test
corepack pnpm -r typecheck
```

Expected: plugin tests pass and all packages typecheck.

- [ ] **Step 3: Commit**

Run:

```powershell
git add packages/shared/src/runtime.ts packages/plugin/src/installer.ts packages/plugin/test/install.test.ts
git commit -m "fix(plugin): align local install layout with codex plugin docs"
```

Expected: a clean commit preserving the already validated plugin layout fix.

---

### Task 2: Add Message Body Shaping Defaults

**Files:**
- Modify `packages/shared/src/types.ts`
- Modify `packages/daemon/src/tools.ts`
- Modify `packages/daemon/src/server.ts`
- Test `packages/daemon/test/tools.test.ts`

- [ ] **Step 1: Write failing handler tests**

Add tests to `packages/daemon/test/tools.test.ts` that assert default reads omit huge HTML and truncate long text:

```ts
it("shapes read_message_batch bodies by default", async () => {
  readMessageBatchMock.mockResolvedValueOnce([
    {
      id: "m1",
      threadId: "t1",
      subject: "Huge",
      from: ["a@example.com"],
      to: ["b@example.com"],
      receivedAt: "2026-04-24T00:00:00Z",
      preview: "preview",
      keywords: [],
      mailboxNames: ["Inbox"],
      cc: [],
      bcc: [],
      textBody: "x".repeat(20_000),
      htmlBody: "<p>" + "x".repeat(20_000) + "</p>",
      references: [],
      replyTo: []
    }
  ]);

  const { handlers } = await import("../src/tools.js");
  const result = await handlers.readMessageBatch({
    accountId: "personal",
    messageIds: ["m1"]
  });

  const message = result.structuredContent.data[0];
  expect(message.textBody.length).toBeLessThanOrEqual(8_200);
  expect(message.htmlBody).toBeUndefined();
  expect(message.bodyTruncated).toBe(true);
});
```

Expected before implementation: test fails because `bodyTruncated` does not exist and `htmlBody` is returned.

- [ ] **Step 2: Add shared types**

In `packages/shared/src/types.ts`, extend message detail shaping:

```ts
export type MessageBodyMode = "metadata" | "text" | "full";

export type MessageReadOptions = {
  bodyMode?: MessageBodyMode;
  maxBodyChars?: number;
  includeHtml?: boolean;
};

export type MessageDetail = MessageSummary & {
  cc: string[];
  bcc: string[];
  textBody: string;
  htmlBody?: string;
  bodyTruncated?: boolean;
  originalTextBodyChars?: number;
  originalHtmlBodyChars?: number;
  messageIdHeader?: string;
  references: string[];
  replyTo?: string[];
};
```

- [ ] **Step 3: Add schema options and shaper**

In `packages/daemon/src/tools.ts`, add options to `readMessageBatch` and `readThread`:

```ts
const defaultMaxBodyChars = 8_000;

const readOptionsSchema = {
  bodyMode: z.enum(["metadata", "text", "full"]).optional(),
  maxBodyChars: z.number().int().min(500).max(100_000).optional(),
  includeHtml: z.boolean().optional()
};
```

Use it in both schemas:

```ts
readMessageBatch: z.object({
  accountId: z.string().min(1),
  messageIds: z.array(z.string()).min(1),
  ...readOptionsSchema
}),
readThread: z.object({
  accountId: z.string().min(1),
  threadId: z.string().min(1),
  ...readOptionsSchema
}),
```

Add:

```ts
function shapeMessageDetail<T extends MessageDetail>(message: T, options: MessageReadOptions = {}): T {
  const bodyMode = options.bodyMode ?? "text";
  const maxBodyChars = options.maxBodyChars ?? defaultMaxBodyChars;
  const originalTextBodyChars = message.textBody.length;
  const originalHtmlBodyChars = message.htmlBody?.length;
  const next = { ...message };

  if (bodyMode === "metadata") {
    next.textBody = "";
    delete next.htmlBody;
    return {
      ...next,
      originalTextBodyChars,
      originalHtmlBodyChars,
      bodyTruncated: originalTextBodyChars > 0 || Boolean(originalHtmlBodyChars)
    };
  }

  if (next.textBody.length > maxBodyChars) {
    next.textBody = `${next.textBody.slice(0, maxBodyChars)}\n\n[truncated ${next.textBody.length - maxBodyChars} chars]`;
  }

  if (bodyMode !== "full" || options.includeHtml !== true) {
    delete next.htmlBody;
  } else if (next.htmlBody && next.htmlBody.length > maxBodyChars) {
    next.htmlBody = `${next.htmlBody.slice(0, maxBodyChars)}\n\n[truncated ${next.htmlBody.length - maxBodyChars} chars]`;
  }

  return {
    ...next,
    originalTextBodyChars,
    originalHtmlBodyChars,
    bodyTruncated: originalTextBodyChars !== next.textBody.length || originalHtmlBodyChars !== next.htmlBody?.length
  };
}
```

- [ ] **Step 4: Apply shaper in handlers**

In `readMessageBatch`:

```ts
const result = await withBundle(args.accountId, async (_account, bundle) => {
  const messages = await bundle.readMessageBatch!(args.messageIds);
  return messages.map((message) => shapeMessageDetail(message, args));
});
```

In `readThread`:

```ts
const result = await withBundle(args.accountId, async (_account, bundle) => {
  const messages = await bundle.readThread!(args.threadId);
  return messages.map((message) => shapeMessageDetail(message, args));
});
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
corepack pnpm --filter @iomancer/mail-agent-daemon test -- tools.test.ts
corepack pnpm -r typecheck
```

Then:

```powershell
git add packages/shared/src/types.ts packages/daemon/src/tools.ts packages/daemon/src/server.ts packages/daemon/test/tools.test.ts
git commit -m "feat(daemon): shape message bodies for agent-friendly reads"
```

---

### Task 3: Make Reply Drafting Honest And Useful

**Files:**
- Modify `packages/daemon/src/tools.ts`
- Modify `packages/daemon/src/server.ts`
- Modify `packages/daemon/src/providers/fastmail/mail-adapter.ts`
- Modify `packages/daemon/src/providers/google/mail-adapter.ts`
- Test `packages/daemon/test/mail-adapter.test.ts`
- Test `packages/daemon/test/google-adapters.test.ts`

- [ ] **Step 1: Decide API semantics**

Keep `draft_reply`, but change `instructions` meaning to `body` at the adapter boundary:

- If instructions are supplied, they become the reply body above the quote.
- If instructions are omitted, return an empty body plus quoted original.
- Tool description must say it prepares reply headers and quoted context; it does not invent text.

- [ ] **Step 2: Add Fastmail test**

In `packages/daemon/test/mail-adapter.test.ts`, add a case that expects supplied text to be placed as body text, not treated as instructions:

```ts
expect(draft.textBody).toContain("Thanks for the update.");
expect(draft.textBody).toContain("> Original body");
expect(draft.subject).toBe("Re: Original subject");
expect(draft.to).toEqual(["Sender <sender@example.com>"]);
```

- [ ] **Step 3: Normalize quoted reply helper**

In both provider mail adapters, use the same shape:

```ts
function buildReplyBody(body: string | undefined, quotedSource: string): string {
  const trimmedBody = body?.trim() ?? "";
  const quoted = quotedSource
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .trim();

  return [trimmedBody, quoted].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: Update tool description**

In `packages/daemon/src/server.ts`, change `draft_reply` description to:

```ts
description: "Prepare a reply envelope and quoted context from an existing message. The optional instructions field is used as the draft body text."
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
corepack pnpm --filter @iomancer/mail-agent-daemon test
corepack pnpm -r typecheck
```

Then:

```powershell
git add packages/daemon/src/tools.ts packages/daemon/src/server.ts packages/daemon/src/providers/fastmail/mail-adapter.ts packages/daemon/src/providers/google/mail-adapter.ts packages/daemon/test/mail-adapter.test.ts packages/daemon/test/google-adapters.test.ts
git commit -m "fix(daemon): make reply draft semantics explicit"
```

---

### Task 4: Add Mutation Preview And Stronger Safety Tests

**Files:**
- Modify `packages/daemon/src/tools.ts`
- Modify `packages/daemon/src/server.ts`
- Modify `packages/daemon/src/providers/fastmail/mail-adapter.ts`
- Modify `packages/daemon/src/providers/google/mail-adapter.ts`
- Test `packages/daemon/test/tools.test.ts`
- Test `packages/daemon/test/mail-adapter.test.ts`
- Test `packages/daemon/test/google-adapters.test.ts`

- [ ] **Step 1: Extend mutation schemas**

Add `dryRun` to mutation tools:

```ts
archiveMessages: z.object({
  accountId: z.string().min(1),
  messageIds: z.array(z.string()).min(1),
  dryRun: z.boolean().optional()
}),
moveMessages: z.object({
  accountId: z.string().min(1),
  messageIds: z.array(z.string()).min(1),
  destinationMailbox: z.string().min(1),
  dryRun: z.boolean().optional()
}),
tagMessages: z.object({
  accountId: z.string().min(1),
  messageIds: z.array(z.string()).min(1),
  tags: z.array(z.string()).min(1),
  dryRun: z.boolean().optional()
}),
markMessages: z.object({
  accountId: z.string().min(1),
  messageIds: z.array(z.string()).min(1),
  flags: z.record(z.string(), z.boolean()),
  dryRun: z.boolean().optional()
})
```

- [ ] **Step 2: Define preview response**

In `packages/shared/src/types.ts`:

```ts
export type MutationPreview = {
  dryRun: true;
  action: "archive" | "move" | "tag" | "mark";
  messageIds: string[];
  destinationMailbox?: string;
  tags?: string[];
  flags?: Record<string, boolean>;
};
```

- [ ] **Step 3: Implement dry-run at handler boundary**

In `packages/daemon/src/tools.ts`, before `assertMutationAllowed`:

```ts
if (args.dryRun === true) {
  return {
    dryRun: true,
    action: "move",
    messageIds: args.messageIds,
    destinationMailbox: args.destinationMailbox
  } satisfies MutationPreview;
}
```

Repeat with action-specific fields for archive/tag/mark.

- [ ] **Step 4: Add safety tests**

In `packages/daemon/test/tools.test.ts`, add tests for:

```ts
it("does not call mutation policy or provider when dryRun is true", async () => {
  const { handlers } = await import("../src/tools.js");
  const result = await handlers.moveMessages({
    accountId: "personal",
    messageIds: ["m1"],
    destinationMailbox: "Archive",
    dryRun: true
  });

  expect(result.structuredContent.data).toMatchObject({
    dryRun: true,
    action: "move",
    messageIds: ["m1"],
    destinationMailbox: "Archive"
  });
});
```

Also add tests that `send_message` and real mutations call `assertSendAllowed` / `assertMutationAllowed`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
corepack pnpm --filter @iomancer/mail-agent-daemon test -- tools.test.ts
corepack pnpm -r test
```

Then:

```powershell
git add packages/shared/src/types.ts packages/daemon/src/tools.ts packages/daemon/src/server.ts packages/daemon/test/tools.test.ts
git commit -m "feat(daemon): add dry-run previews for mailbox mutations"
```

---

### Task 5: Slim Installed Bundle To Published Runtime Files

**Files:**
- Modify `packages/plugin/src/installer.ts`
- Modify `packages/plugin/test/install.test.ts`

- [ ] **Step 1: Add failing bundle hygiene test**

In `packages/plugin/test/install.test.ts`, after install:

```ts
await expect(fs.stat(path.join(result.pluginPath, "node_modules", "@iomancer", "mail-agent-shared", "test"))).rejects.toMatchObject({
  code: "ENOENT"
});
await expect(fs.stat(path.join(result.pluginPath, "node_modules", "@iomancer", "mail-agent-shared", "src"))).rejects.toMatchObject({
  code: "ENOENT"
});
await expect(fs.stat(path.join(result.pluginPath, "node_modules", "@iomancer", "mail-agent-daemon", "test"))).rejects.toMatchObject({
  code: "ENOENT"
});
```

Expected before implementation: test fails because source/test files are copied.

- [ ] **Step 2: Implement package-file allowlist**

In `packages/plugin/src/installer.ts`, replace `copyPackageDirectory` with manifest-aware copying:

```ts
async function getPackageFiles(source: string, manifest: PackageManifest): Promise<string[]> {
  const files = manifest.files ?? [];
  return [
    "package.json",
    "README.md",
    "LICENSE",
    ...files
  ];
}
```

Extend `PackageManifest`:

```ts
type PackageManifest = {
  files?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
```

Copy only existing allowlisted entries:

```ts
async function copyPackageDirectory(source: string, target: string): Promise<void> {
  const manifest = await readPackageManifest(source);
  await fs.mkdir(target, { recursive: true });

  for (const entry of await getPackageFiles(source, manifest)) {
    const sourcePath = path.join(source, entry);
    if (!(await exists(sourcePath))) {
      continue;
    }
    await copyTree(sourcePath, path.join(target, entry));
  }
}
```

- [ ] **Step 3: Run plugin test and install smoke**

Run:

```powershell
corepack pnpm --filter mail-agent test
corepack pnpm -r build
node packages/plugin/dist/bin/mail-agent.js install
node $env:USERPROFILE\.codex\plugins\mail-agent\dist\bin\mail-agent.js doctor
```

Expected: plugin test passes, installed bundle doctor reports account statuses.

- [ ] **Step 4: Commit**

Run:

```powershell
git add packages/plugin/src/installer.ts packages/plugin/test/install.test.ts
git commit -m "fix(plugin): install only runtime package files"
```

---

### Task 6: Improve Auth And Setup Error Help

**Files:**
- Modify `packages/shared/src/errors.ts`
- Modify `packages/shared/src/secrets.ts`
- Modify `packages/daemon/src/tools.ts`
- Modify `packages/plugin/src/doctor.ts`
- Test `packages/daemon/test/tools.test.ts`

- [ ] **Step 1: Add expected error behavior tests**

In `packages/daemon/test/tools.test.ts`, mock `getAccount` or provider creation to throw missing credentials and assert a remediation hint:

```ts
expect(result.content[0].text).toContain("mail-agent auth google");
```

If handlers currently throw instead of returning tool-shaped errors, assert the thrown message includes:

```text
No credentials stored for account: gmail. Run `mail-agent auth google --account gmail --email <email> --client-id <client-id>`.
```

- [ ] **Step 2: Add provider-aware auth hint helper**

In `packages/shared/src/secrets.ts`, improve the missing secret error:

```ts
function authHint(accountId: string): string {
  return `Run \`mail-agent doctor\` to inspect account health, then re-auth with \`mail-agent auth <provider> --account ${accountId}\`.`;
}
```

If provider is unavailable at this layer, add the hint at `packages/daemon/src/tools.ts` where `getAccount(accountId)` has access to provider config.

- [ ] **Step 3: Improve doctor output**

In `packages/plugin/src/doctor.ts`, include `repairCommand` when `secretStatus` is missing:

```ts
repairCommand: account.provider === "google-workspace"
  ? `mail-agent auth google --account ${account.id} --email ${account.emailAddress} --client-id <client-id>`
  : `mail-agent auth fastmail --account ${account.id} --email ${account.emailAddress}`
```

- [ ] **Step 4: Validate and commit**

Run:

```powershell
corepack pnpm -r test
node packages/plugin/dist/bin/mail-agent.js doctor
```

Then:

```powershell
git add packages/shared/src/errors.ts packages/shared/src/secrets.ts packages/daemon/src/tools.ts packages/plugin/src/doctor.ts packages/daemon/test/tools.test.ts
git commit -m "fix(auth): add actionable setup repair hints"
```

---

### Task 7: Normalize Calendar And Contact Output

**Files:**
- Modify `packages/daemon/src/providers/fastmail/calendar-adapter.ts`
- Modify `packages/daemon/src/providers/fastmail/contacts-adapter.ts`
- Test `packages/daemon/test/dav-adapters.test.ts`

- [ ] **Step 1: Add calendar normalization tests**

In `packages/daemon/test/dav-adapters.test.ts`, assert simple ICS values normalize:

```ts
expect(events[0]).toMatchObject({
  title: "Standup",
  start: "2026-04-24T15:00:00Z",
  end: "2026-04-24T15:30:00Z"
});
```

Use fixture values:

```ics
DTSTART:20260424T150000Z
DTEND:20260424T153000Z
```

- [ ] **Step 2: Implement ICS date normalization**

In `calendar-adapter.ts`:

```ts
function normalizeIcsDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) {
    return value;
  }
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}
```

Use it for `start` and `end`.

- [ ] **Step 3: Add contact cleanup tests**

Add fixture vCards with empty names, empty emails, and `ORG:;`:

```ts
expect(contacts[0]).toMatchObject({
  fullName: "(unnamed)",
  emails: [],
  organizations: []
});
```

- [ ] **Step 4: Implement contact cleanup**

In `contacts-adapter.ts`:

```ts
function cleanValues(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => value !== ";");
}
```

Use:

```ts
fullName: values.get("FN")?.[0]?.trim() || "(unnamed)",
emails: cleanValues(values.get("EMAIL")),
phones: cleanValues(values.get("TEL")),
organizations: cleanValues(values.get("ORG"))
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
corepack pnpm --filter @iomancer/mail-agent-daemon test -- dav-adapters.test.ts
corepack pnpm -r test
```

Then:

```powershell
git add packages/daemon/src/providers/fastmail/calendar-adapter.ts packages/daemon/src/providers/fastmail/contacts-adapter.ts packages/daemon/test/dav-adapters.test.ts
git commit -m "fix(daemon): normalize calendar and contact output"
```

---

### Task 8: Documentation And Final Ship Validation

**Files:**
- Modify `README.md`
- Modify `packages/plugin/README.md`
- Modify `RELEASING.md` if release validation changes

- [ ] **Step 1: Document safer read defaults**

Add to `README.md` under runtime/tool behavior:

```md
Message read tools return text bodies by default, omit HTML by default, and truncate long bodies to keep Codex context usable. Use `bodyMode: "full"`, `includeHtml: true`, and `maxBodyChars` only when the full source is needed.
```

- [ ] **Step 2: Document mutation preview**

Add:

```md
Mailbox mutation tools support `dryRun: true` for previewing archive, move, tag, and mark operations before changing provider state. Permanent delete always requires a confirmation token unless an account policy explicitly allows delete.
```

- [ ] **Step 3: Document install location**

Add to `packages/plugin/README.md`:

```md
`mail-agent install` copies the plugin bundle to `~/.codex/plugins/mail-agent` and registers it through the local marketplace file at `~/.agents/plugins/marketplace.json`.
```

- [ ] **Step 4: Run full validation**

Run:

```powershell
corepack pnpm -r test
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm pack:check
node packages/plugin/dist/bin/mail-agent.js install
node $env:USERPROFILE\.codex\plugins\mail-agent\dist\bin\mail-agent.js doctor
git diff --check
git status --short --branch
```

Expected:

- All tests pass.
- Typecheck and build pass.
- Pack check includes `.codex-plugin/plugin.json`, `.mcp.json`, `skills/`, `assets/`, and runtime dist files.
- Installed plugin doctor works from `~/.codex/plugins/mail-agent`.
- No whitespace errors.

- [ ] **Step 5: Commit docs**

Run:

```powershell
git add README.md packages/plugin/README.md RELEASING.md
git commit -m "docs: document mail-agent plugin safety and install behavior"
```

---

## Execution Notes

- Do not send mail or mutate live messages during automated validation.
- Use `dryRun: true` tests for mutation UX.
- Use live Fastmail only for read-only smoke checks.
- Google live checks are blocked until `gmail` has stored credentials again; use mocked Google adapter tests for now.
- Keep commits small. Each task should leave the repo passing its relevant focused tests before moving on.

## Final Readiness Gate

Before calling the plugin ship-ready:

- `corepack pnpm -r test` passes.
- `corepack pnpm -r typecheck` passes.
- `corepack pnpm -r build` passes.
- `corepack pnpm pack:check` passes.
- `node packages/plugin/dist/bin/mail-agent.js install` succeeds.
- `node $env:USERPROFILE\.codex\plugins\mail-agent\dist\bin\mail-agent.js doctor` succeeds.
- Installed bundle no longer contains workspace `src` or `test` directories for vendored packages.
- A read-only live Fastmail smoke covers mailbox search, message read with default shaping, calendars, contacts, and delete confirmation first step.

## Self-Review

- Spec coverage: Covers all audit weaknesses except full Google live validation, which is explicitly blocked by missing local credentials and covered by tests.
- Placeholder scan: No planned task uses TBD/TODO/fill-in language.
- Type consistency: `MessageReadOptions`, `MessageBodyMode`, and `MutationPreview` are introduced before downstream use.

Plan complete and saved to `docs/superpowers/plans/2026-04-24-plugin-hardening.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
