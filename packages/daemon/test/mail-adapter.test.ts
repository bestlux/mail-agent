import { beforeEach, describe, expect, it, vi } from "vitest";
import { FastmailMailAdapter } from "../src/providers/fastmail/mail-adapter.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const account = {
  id: "personal",
  provider: "fastmail",
  displayName: "Personal",
  emailAddress: "user@example.com",
  capabilities: ["mail-read", "mail-write", "calendar-read", "contacts-read"],
  trustMode: "trusted-automation",
  automationPolicy: {
    allowSend: true,
    allowMutations: true,
    allowDelete: false
  },
  cache: {
    searchTtlMs: 1000,
    threadTtlMs: 1000,
    eventTtlMs: 1000,
    contactTtlMs: 1000
  },
  fastmail: {
    apiBaseUrl: "https://api.fastmail.com",
    jmapSessionUrl: "https://api.fastmail.com/jmap/session",
    caldavUrl: "https://caldav.fastmail.com",
    carddavUrl: "https://carddav.fastmail.com"
  }
} as const;

describe("FastmailMailAdapter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("searches messages with mailbox names", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiUrl: "https://api.fastmail.com/jmap/api/",
          primaryAccounts: {
            "urn:ietf:params:jmap:mail": "acct",
            "urn:ietf:params:jmap:submission": "acct"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [["Mailbox/query", { ids: ["mb-inbox"] }, "0"]]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [["Mailbox/get", { list: [{ id: "mb-inbox", name: "Inbox", role: "inbox" }] }, "0"]]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [["Email/query", { ids: ["m1"] }, "0"]]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [[
            "Email/get",
            {
              list: [
                {
                  id: "m1",
                  threadId: "t1",
                  mailboxIds: { "mb-inbox": true },
                  keywords: { "$seen": true },
                  subject: "Subject",
                  from: [{ email: "sender@example.com" }],
                  to: [{ email: "user@example.com" }],
                  receivedAt: "2026-03-30T00:00:00Z",
                  preview: "Hello"
                }
              ]
            },
            "0"
          ]]
        })
      });

    const adapter = new FastmailMailAdapter(account, {
      username: "user@example.com",
      accessToken: "token"
    });
    const results = await adapter.searchMessages({ text: "hello" });

    expect(results[0]?.mailboxNames).toEqual(["Inbox"]);
    expect(results[0]?.subject).toBe("Subject");
  });
});
