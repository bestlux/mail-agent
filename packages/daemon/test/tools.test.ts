import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMessagesMock = vi.fn();

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
    searchMessages: searchMessagesMock
  }))
}));

describe("handlers.searchMessages", () => {
  beforeEach(() => {
    vi.resetModules();
    searchMessagesMock.mockReset();
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
});
