import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMessagesMock = vi.fn();
const readMessageBatchMock = vi.fn();
const readThreadMock = vi.fn();
const sendMessageMock = vi.fn();
const archiveMessagesMock = vi.fn();
const moveMessagesMock = vi.fn();
const tagMessagesMock = vi.fn();
const markMessagesMock = vi.fn();
const deleteMessagesMock = vi.fn();
const assertMutationAllowedMock = vi.fn();
const assertSendAllowedMock = vi.fn();
const createProviderBundleMock = vi.fn();
const issueDeleteConfirmationMock = vi.fn();
const requiresDeleteConfirmationMock = vi.fn(() => true);
const getAccountMock = vi.fn();

const baseMessage = {
  id: "m1",
  threadId: "t1",
  subject: "Hello",
  from: ["from@example.com"],
  to: ["to@example.com"],
  receivedAt: "2026-03-31T00:00:00Z",
  preview: "Preview",
  keywords: [],
  mailboxNames: ["Inbox"],
  cc: [],
  bcc: [],
  textBody: "Short body",
  htmlBody: "<p>Short body</p>",
  messageIdHeader: "<m1@example.com>",
  references: [],
  replyTo: []
};

class MockFileCache {
  private readonly values = new Map<string, unknown>();

  async read<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

vi.mock("@iomancer/mail-agent-shared", () => ({
  AuthError: class AuthError extends Error {
    readonly code = "auth_error";
  },
  FileCache: MockFileCache,
  assertMutationAllowed: assertMutationAllowedMock,
  assertSendAllowed: assertSendAllowedMock,
  consumeDeleteConfirmation: vi.fn(),
  getAccount: getAccountMock,
  issueDeleteConfirmation: issueDeleteConfirmationMock,
  loadConfig: vi.fn(async () => ({ version: 1, accounts: [] })),
  requiresDeleteConfirmation: requiresDeleteConfirmationMock
}));

vi.mock("../src/providers/factory.js", () => ({
  createProviderBundle: createProviderBundleMock.mockImplementation(async () => ({
    searchMessages: searchMessagesMock,
    readMessageBatch: readMessageBatchMock,
    readThread: readThreadMock,
    sendMessage: sendMessageMock,
    archiveMessages: archiveMessagesMock,
    moveMessages: moveMessagesMock,
    tagMessages: tagMessagesMock,
    markMessages: markMessagesMock,
    deleteMessages: deleteMessagesMock
  }))
}));

function mockAccount(overrides: Partial<Awaited<ReturnType<typeof getAccountMock>>> = {}) {
  getAccountMock.mockResolvedValue({
    id: "personal",
    provider: "fastmail",
    displayName: "Personal",
    emailAddress: "user@example.com",
    capabilities: ["mail-read"],
    trustMode: "trusted-automation",
    automationPolicy: {
      allowSend: true,
      allowMutations: true,
      allowDelete: false
    },
    cache: {
      searchTtlMs: 60_000,
      threadTtlMs: 60_000,
      eventTtlMs: 60_000,
      contactTtlMs: 60_000
    },
    ...overrides
  });
}

function missingCredentialsError(accountId: string): Error {
  return Object.assign(new Error(`No credentials stored for account: ${accountId}`), {
    code: "auth_error"
  });
}

function authBackendError(message: string): Error {
  return Object.assign(new Error(message), {
    code: "auth_error"
  });
}

describe("handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    searchMessagesMock.mockReset();
    readMessageBatchMock.mockReset();
    readThreadMock.mockReset();
    sendMessageMock.mockReset();
    archiveMessagesMock.mockReset();
    moveMessagesMock.mockReset();
    tagMessagesMock.mockReset();
    markMessagesMock.mockReset();
    deleteMessagesMock.mockReset();
    assertMutationAllowedMock.mockReset();
    assertSendAllowedMock.mockReset();
    issueDeleteConfirmationMock.mockReset();
    requiresDeleteConfirmationMock.mockReset();
    requiresDeleteConfirmationMock.mockReturnValue(true);
    createProviderBundleMock.mockClear();
    getAccountMock.mockReset();
    mockAccount();
  });

  it("bypasses cached search results when refresh is true", async () => {
    searchMessagesMock
      .mockResolvedValueOnce({
        messages: [],
        total: 0,
        position: 0,
        limit: 10,
        collapseThreads: false
      })
      .mockResolvedValueOnce({
        messages: [{ id: "m1", threadId: "t1", subject: "Fresh", from: [], to: [], receivedAt: "2026-03-31T00:00:00Z", preview: "", keywords: [], mailboxNames: [] }],
        total: 1,
        position: 0,
        limit: 10,
        collapseThreads: false
      });

    const { handlers } = await import("../src/tools.js");

    const first = await handlers.searchMessages({
      accountId: "personal",
      subject: "Fresh",
      limit: 10
    });
    const second = await handlers.searchMessages({
      accountId: "personal",
      subject: "Fresh",
      limit: 10,
      refresh: true
    });

    expect(searchMessagesMock).toHaveBeenCalledTimes(2);
    expect(first.structuredContent.data.messages).toHaveLength(0);
    expect(second.structuredContent.data.messages[0]?.subject).toBe("Fresh");
  });

  it("read_message_batch default omits html and truncates long text", async () => {
    const longText = "x".repeat(8_500);
    readMessageBatchMock.mockResolvedValueOnce([
      {
        ...baseMessage,
        textBody: longText,
        htmlBody: "<p>Hidden by default</p>"
      }
    ]);

    const { handlers } = await import("../src/tools.js");

    const result = await handlers.readMessageBatch({
      accountId: "personal",
      messageIds: ["m1"]
    });
    const [message] = result.structuredContent.data;

    expect(readMessageBatchMock).toHaveBeenCalledWith(["m1"]);
    expect(message?.htmlBody).toBeUndefined();
    expect(message?.textBody).toContain("[mail-agent: body truncated from 8500 to 8000 characters.");
    expect(message?.bodyTruncated).toBe(true);
    expect(message?.originalTextBodyChars).toBe(8_500);
    expect(message?.originalHtmlBodyChars).toBe("<p>Hidden by default</p>".length);
  });

  it("read_thread uses the same shaping", async () => {
    const longText = "t".repeat(900);
    readThreadMock.mockResolvedValueOnce([
      {
        ...baseMessage,
        id: "m2",
        textBody: longText,
        htmlBody: "<strong>Thread HTML</strong>"
      }
    ]);

    const { handlers } = await import("../src/tools.js");

    const result = await handlers.readThread({
      accountId: "personal",
      threadId: "t1",
      maxBodyChars: 500
    });
    const [message] = result.structuredContent.data;

    expect(readThreadMock).toHaveBeenCalledWith("t1");
    expect(message?.htmlBody).toBeUndefined();
    expect(message?.textBody).toContain("[mail-agent: body truncated from 900 to 500 characters.");
    expect(message?.bodyTruncated).toBe(true);
    expect(message?.originalTextBodyChars).toBe(900);
  });

  it("bodyMode metadata omits body content", async () => {
    readMessageBatchMock.mockResolvedValueOnce([
      {
        ...baseMessage,
        textBody: "Metadata should hide this",
        htmlBody: "<p>Metadata should hide this</p>"
      }
    ]);

    const { handlers } = await import("../src/tools.js");

    const result = await handlers.readMessageBatch({
      accountId: "personal",
      messageIds: ["m1"],
      bodyMode: "metadata"
    });
    const [message] = result.structuredContent.data;

    expect(message?.textBody).toBe("");
    expect(message?.htmlBody).toBeUndefined();
    expect(message?.bodyTruncated).toBe(true);
    expect(message?.originalTextBodyChars).toBe("Metadata should hide this".length);
    expect(message?.originalHtmlBodyChars).toBe("<p>Metadata should hide this</p>".length);
  });

  it("bodyMode full with includeHtml true returns html truncated by maxBodyChars", async () => {
    const htmlBody = `<p>${"h".repeat(750)}</p>`;
    readMessageBatchMock.mockResolvedValueOnce([
      {
        ...baseMessage,
        textBody: "Full text",
        htmlBody
      }
    ]);

    const { handlers } = await import("../src/tools.js");

    const result = await handlers.readMessageBatch({
      accountId: "personal",
      messageIds: ["m1"],
      bodyMode: "full",
      includeHtml: true,
      maxBodyChars: 500
    });
    const [message] = result.structuredContent.data;

    expect(message?.textBody).toBe("Full text");
    expect(message?.htmlBody).toContain("[mail-agent: body truncated from 757 to 500 characters.");
    expect(message?.bodyTruncated).toBe(true);
    expect(message?.originalHtmlBodyChars).toBe(757);
  });

  it("move_messages dryRun returns a preview without mutation policy or provider calls", async () => {
    const { handlers } = await import("../src/tools.js");

    const result = await handlers.moveMessages({
      accountId: "personal",
      messageIds: ["m1", "m2"],
      destinationMailbox: "Archive",
      dryRun: true
    });

    expect(result.structuredContent.data).toEqual({
      dryRun: true,
      action: "move",
      messageIds: ["m1", "m2"],
      destinationMailbox: "Archive"
    });
    expect(assertMutationAllowedMock).not.toHaveBeenCalled();
    expect(createProviderBundleMock).not.toHaveBeenCalled();
    expect(moveMessagesMock).not.toHaveBeenCalled();
  });

  it("archive/tag/mark dryRun return mutation previews", async () => {
    const { handlers } = await import("../src/tools.js");

    const archive = await handlers.archiveMessages({
      accountId: "personal",
      messageIds: ["m1"],
      dryRun: true
    });
    const tag = await handlers.tagMessages({
      accountId: "personal",
      messageIds: ["m1"],
      tags: ["todo", "follow-up"],
      dryRun: true
    });
    const mark = await handlers.markMessages({
      accountId: "personal",
      messageIds: ["m1"],
      flags: { "$seen": true, "$flagged": false },
      dryRun: true
    });

    expect(archive.structuredContent.data).toEqual({
      dryRun: true,
      action: "archive",
      messageIds: ["m1"]
    });
    expect(tag.structuredContent.data).toEqual({
      dryRun: true,
      action: "tag",
      messageIds: ["m1"],
      tags: ["todo", "follow-up"]
    });
    expect(mark.structuredContent.data).toEqual({
      dryRun: true,
      action: "mark",
      messageIds: ["m1"],
      flags: { "$seen": true, "$flagged": false }
    });
    expect(assertMutationAllowedMock).not.toHaveBeenCalled();
    expect(createProviderBundleMock).not.toHaveBeenCalled();
  });

  it("send_message calls assertSendAllowed before provider send", async () => {
    sendMessageMock.mockResolvedValueOnce({ id: "sent-1" });
    const { handlers } = await import("../src/tools.js");

    await handlers.sendMessage({
      accountId: "personal",
      draft: {
        subject: "Hello",
        to: ["to@example.com"],
        textBody: "Body"
      }
    });

    expect(assertSendAllowedMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      subject: "Hello",
      to: ["to@example.com"],
      textBody: "Body"
    });
  });

  it("archive/move/tag/mark real calls require mutation policy and provider methods", async () => {
    archiveMessagesMock.mockResolvedValueOnce({ archived: 1 });
    moveMessagesMock.mockResolvedValueOnce({ moved: 1 });
    tagMessagesMock.mockResolvedValueOnce({ tagged: 1 });
    markMessagesMock.mockResolvedValueOnce({ marked: 1 });
    const { handlers } = await import("../src/tools.js");

    await handlers.archiveMessages({ accountId: "personal", messageIds: ["m1"] });
    await handlers.moveMessages({ accountId: "personal", messageIds: ["m2"], destinationMailbox: "Projects" });
    await handlers.tagMessages({ accountId: "personal", messageIds: ["m3"], tags: ["todo"] });
    await handlers.markMessages({ accountId: "personal", messageIds: ["m4"], flags: { "$seen": true } });

    expect(assertMutationAllowedMock).toHaveBeenCalledTimes(4);
    expect(archiveMessagesMock).toHaveBeenCalledWith(["m1"]);
    expect(moveMessagesMock).toHaveBeenCalledWith(["m2"], "Projects");
    expect(tagMessagesMock).toHaveBeenCalledWith(["m3"], ["todo"]);
    expect(markMessagesMock).toHaveBeenCalledWith(["m4"], { "$seen": true });
  });

  it("delete_messages issues confirmation before provider delete when required", async () => {
    issueDeleteConfirmationMock.mockResolvedValueOnce({
      token: "confirm-1",
      accountId: "personal",
      messageIds: ["m1"],
      expiresAt: "2026-04-24T00:00:00Z"
    });
    const { handlers } = await import("../src/tools.js");

    const result = await handlers.deleteMessages({
      accountId: "personal",
      messageIds: ["m1"]
    });

    expect(result.structuredContent.data).toEqual({
      confirmationRequired: true,
      confirmation: {
        token: "confirm-1",
        accountId: "personal",
        messageIds: ["m1"],
        expiresAt: "2026-04-24T00:00:00Z"
      }
    });
    expect(deleteMessagesMock).not.toHaveBeenCalled();
  });

  it("adds a Google auth repair hint when account credentials are missing", async () => {
    mockAccount({
      id: "gmail",
      provider: "google-workspace",
      displayName: "Gmail",
      emailAddress: "user@gmail.com"
    });
    createProviderBundleMock.mockRejectedValueOnce(missingCredentialsError("gmail"));
    const { handlers } = await import("../src/tools.js");

    await expect(
      handlers.searchMessages({
        accountId: "gmail",
        limit: 10
      })
    ).rejects.toThrow(
      "No credentials stored for account: gmail. Run `mail-agent auth google --account gmail --email user@gmail.com --client-id <client-id>` to re-authenticate this account."
    );
  });

  it("adds a Fastmail auth repair hint when account credentials are missing", async () => {
    createProviderBundleMock.mockRejectedValueOnce(missingCredentialsError("personal"));
    const { handlers } = await import("../src/tools.js");

    await expect(
      handlers.listMailboxes({
        accountId: "personal"
      })
    ).rejects.toThrow(
      "No credentials stored for account: personal. Run `mail-agent auth fastmail --account personal --email user@example.com` to re-authenticate this account."
    );
  });

  it("does not add a re-auth hint for non-missing auth errors", async () => {
    createProviderBundleMock.mockRejectedValueOnce(authBackendError("OS keychain backend is unavailable: boom"));
    const { handlers } = await import("../src/tools.js");
    const result = handlers.listMailboxes({
      accountId: "personal"
    });

    await expect(result).rejects.toThrow("OS keychain backend is unavailable: boom");

    await expect(result).rejects.not.toThrow("mail-agent auth fastmail");
  });
});
