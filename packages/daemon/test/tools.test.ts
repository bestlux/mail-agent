import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMessagesMock = vi.fn();
const readMessageBatchMock = vi.fn();
const readThreadMock = vi.fn();

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
  FileCache: MockFileCache,
  assertMutationAllowed: vi.fn(),
  assertSendAllowed: vi.fn(),
  consumeDeleteConfirmation: vi.fn(),
  getAccount: vi.fn(async () => ({
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
    }
  })),
  issueDeleteConfirmation: vi.fn(),
  loadConfig: vi.fn(async () => ({ version: 1, accounts: [] })),
  requiresDeleteConfirmation: vi.fn(() => true)
}));

vi.mock("../src/providers/factory.js", () => ({
  createProviderBundle: vi.fn(async () => ({
    searchMessages: searchMessagesMock,
    readMessageBatch: readMessageBatchMock,
    readThread: readThreadMock
  }))
}));

describe("handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    searchMessagesMock.mockReset();
    readMessageBatchMock.mockReset();
    readThreadMock.mockReset();
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
});
