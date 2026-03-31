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

  it("searches messages with mailbox names and pagination metadata", async () => {
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
          methodResponses: [["Email/query", { ids: ["m1"], total: 3, position: 0 }, "0"]]
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
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "token",
      davPassword: "app-password"
    });
    const results = await adapter.searchMessages({ text: "hello" });

    expect(results.messages[0]?.mailboxNames).toEqual(["Inbox"]);
    expect(results.messages[0]?.subject).toBe("Subject");
    expect(results.total).toBe(3);
    expect(results.nextPosition).toBe(1);
  });

  it("builds paginated searches with mailbox roles and thread collapsing", async () => {
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
          methodResponses: [["Email/query", { ids: [], total: 0, position: 25 }, "0"]]
        })
      });

    const adapter = new FastmailMailAdapter(account, {
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "token",
      davPassword: "app-password"
    });

    const results = await adapter.searchMessages({
      mailboxRole: "inbox",
      excludeMailingLists: true,
      collapseThreads: true,
      position: 25,
      limit: 25,
      since: "2026-03-01T00:00:00Z"
    });

    const searchCall = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(searchCall.methodCalls[0][1]).toMatchObject({
      position: 25,
      limit: 25,
      collapseThreads: true,
      calculateTotal: true,
      filter: {
        operator: "AND",
        conditions: [
          { inMailbox: "mb-inbox" },
          { notKeyword: "$ismailinglist" },
          { after: "2026-03-01T00:00:00Z" }
        ]
      }
    });
    expect(results).toEqual({
      messages: [],
      total: 0,
      position: 25,
      limit: 25,
      collapseThreads: true
    });
  });

  it("reads full threads through Thread/get", async () => {
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
          methodResponses: [["Thread/get", { list: [{ id: "t1", emailIds: ["m2", "m1"] }] }, "0"]]
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
          methodResponses: [[
            "Email/get",
            {
              list: [
                {
                  id: "m2",
                  threadId: "t1",
                  mailboxIds: { "mb-inbox": true },
                  subject: "Later",
                  from: [{ email: "sender@example.com" }],
                  to: [{ email: "user@example.com" }],
                  receivedAt: "2026-03-30T01:00:00Z",
                  bodyValues: {},
                  textBody: []
                },
                {
                  id: "m1",
                  threadId: "t1",
                  mailboxIds: { "mb-inbox": true },
                  subject: "Earlier",
                  from: [{ email: "sender@example.com" }],
                  to: [{ email: "user@example.com" }],
                  receivedAt: "2026-03-30T00:00:00Z",
                  bodyValues: {},
                  textBody: []
                }
              ]
            },
            "0"
          ]]
        })
      });

    const adapter = new FastmailMailAdapter(account, {
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "token",
      davPassword: "app-password"
    });

    const results = await adapter.readThread("t1");

    expect(results.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("falls back to html bodies when a message has no text part", async () => {
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
          methodResponses: [[
            "Email/get",
            {
              list: [
                {
                  id: "m1",
                  threadId: "t1",
                  mailboxIds: { "mb-inbox": true },
                  subject: "Subject",
                  from: [{ email: "sender@example.com" }],
                  to: [{ email: "user@example.com" }],
                  receivedAt: "2026-03-30T00:00:00Z",
                  bodyValues: {
                    html: { value: "<div>Hello&nbsp;<strong>world</strong></div>" }
                  },
                  textBody: [],
                  htmlBody: [{ partId: "html" }]
                }
              ]
            },
            "0"
          ]]
        })
      });

    const adapter = new FastmailMailAdapter(account, {
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "token",
      davPassword: "app-password"
    });

    const [message] = await adapter.readMessageBatch(["m1"]);

    expect(message?.textBody).toBe("Hello world");
  });

  it("archives messages by moving them into the archive mailbox", async () => {
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
          methodResponses: [["Mailbox/query", { ids: ["mb-inbox", "mb-archive"] }, "0"]]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [[
            "Mailbox/get",
            {
              list: [
                { id: "mb-inbox", name: "Inbox", role: "inbox" },
                { id: "mb-archive", name: "Archive", role: "archive" }
              ]
            },
            "0"
          ]]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          methodResponses: [["Email/set", {}, "0"]]
        })
      });

    const adapter = new FastmailMailAdapter(account, {
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "token",
      davPassword: "app-password"
    });

    await adapter.archiveMessages(["m1"]);

    const updateCall = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(updateCall.methodCalls[0][1]).toMatchObject({
      update: {
        m1: {
          "mailboxIds/mb-inbox": null,
          "mailboxIds/mb-archive": true
        }
      }
    });
  });
});
