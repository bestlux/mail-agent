import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarAdapter } from "../src/providers/google/calendar-adapter.js";
import { GoogleContactsAdapter } from "../src/providers/google/contacts-adapter.js";
import { GoogleMailAdapter } from "../src/providers/google/mail-adapter.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const account = {
  id: "gmail",
  provider: "google-workspace",
  displayName: "Gmail",
  emailAddress: "user@gmail.com",
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
  google: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    gmailBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    calendarBaseUrl: "https://www.googleapis.com/calendar/v3",
    peopleBaseUrl: "https://people.googleapis.com/v1",
    redirectHost: "127.0.0.1",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/contacts.readonly"
    ]
  }
} as const;

const auth = {
  kind: "oauth",
  accessToken: "token",
  refreshToken: "refresh",
  scopes: account.google.scopes,
  clientId: "client-id",
  authorizationUrl: account.google.authorizationUrl,
  tokenUrl: account.google.tokenUrl,
  revokeUrl: account.google.revokeUrl,
  redirectUri: "http://127.0.0.1:4567"
} as const;

describe("Google adapters", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("searches Gmail messages and paginates beyond 100 refs", async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/users/me/messages?")) {
        const parsed = new URL(url);
        const pageToken = parsed.searchParams.get("pageToken");
        if (pageToken === "page-2") {
          return {
            ok: true,
            json: async () => ({
              messages: Array.from({ length: 50 }, (_, index) => ({ id: `m${101 + index}`, threadId: `t${101 + index}` })),
              resultSizeEstimate: 150
            })
          };
        }

        return {
          ok: true,
          json: async () => ({
            messages: Array.from({ length: 100 }, (_, index) => ({ id: `m${index + 1}`, threadId: `t${index + 1}` })),
            nextPageToken: "page-2",
            resultSizeEstimate: 150
          })
        };
      }

      if (url.includes("/users/me/messages/m")) {
        const id = url.match(/messages\/(m\d+)/)?.[1] ?? "m0";
        return {
          ok: true,
          json: async () => ({
            id,
            threadId: `t${id.slice(1)}`,
            labelIds: ["INBOX", "STARRED", "CATEGORY_UPDATES"],
            snippet: `Preview ${id}`,
            internalDate: `${Date.parse("2026-03-31T00:00:00Z") + Number(id.slice(1))}`,
            payload: {
              headers: [
                { name: "Subject", value: `Hello ${id}` },
                { name: "From", value: "sender@example.com" },
                { name: "To", value: "user@gmail.com" }
              ],
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: Buffer.from(`Hello world ${id}`, "utf8").toString("base64url")
                  }
                }
              ]
            }
          })
        };
      }

      if (url.endsWith("/users/me/labels")) {
        return {
          ok: true,
          json: async () => ({
            labels: [
              { id: "INBOX", name: "INBOX", type: "system" },
              { id: "STARRED", name: "STARRED", type: "system" },
              { id: "CATEGORY_UPDATES", name: "CATEGORY_UPDATES", type: "system" }
            ]
          })
        };
      }

      throw new Error(`Unexpected fetch URL in pagination test: ${url}`);
    });

    const adapter = new GoogleMailAdapter(account, auth);
    const result = await adapter.searchMessages({ text: "hello", limit: 150 });

    expect(result.messages).toHaveLength(150);
    expect(result.messages[0]?.subject).toBe("Hello m1");
    expect(result.messages[149]?.subject).toBe("Hello m150");
    expect(result.messages[0]?.mailboxNames).toContain("Inbox");
    expect(result.messages[0]?.mailboxNames).toContain("Updates");
    expect(result.messages[0]?.keywords).toContain("$flagged");
    expect(result.total).toBe(150);
    expect(result.nextPosition).toBeUndefined();
  });

  it("drafts replies using the current Message-ID and complete references chain", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "m1",
          threadId: "t1",
          labelIds: ["INBOX"],
          snippet: "Preview",
          internalDate: `${Date.parse("2026-03-31T00:00:00Z")}`,
          payload: {
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "sender@example.com" },
              { name: "To", value: "user@gmail.com" },
              { name: "Message-ID", value: "<current@example.com>" },
              { name: "References", value: "<root@example.com>" }
            ],
            parts: [
              {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from("Hello world", "utf8").toString("base64url")
                }
              }
            ]
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [{ id: "INBOX", name: "INBOX", type: "system" }]
        })
      })
    ;

    const adapter = new GoogleMailAdapter(account, auth);
    const draft = await adapter.draftReply("m1", "Thanks.");

    expect(draft.inReplyTo).toBe("<current@example.com>");
    expect(draft.references).toEqual(["<root@example.com>", "<current@example.com>"]);
    expect(draft.threadId).toBe("t1");
  });

  it("keeps paginating when excludeMailingLists filters the first page away", async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/users/me/messages?")) {
        const parsed = new URL(url);
        const pageToken = parsed.searchParams.get("pageToken");
        if (pageToken === "page-2") {
          return {
            ok: true,
            json: async () => ({
              messages: [{ id: "m3", threadId: "t3" }],
              resultSizeEstimate: 3
            })
          };
        }

        return {
          ok: true,
          json: async () => ({
            messages: [
              { id: "m1", threadId: "t1" },
              { id: "m2", threadId: "t2" }
            ],
            nextPageToken: "page-2",
            resultSizeEstimate: 3
          })
        };
      }

      if (url.includes("/users/me/messages/m1")) {
        return {
          ok: true,
          json: async () => ({
            id: "m1",
            threadId: "t1",
            labelIds: ["INBOX"],
            internalDate: `${Date.parse("2026-03-31T00:00:00Z")}`,
            payload: {
              headers: [
                { name: "Subject", value: "Newsletter" },
                { name: "From", value: "list@example.com" },
                { name: "List-Id", value: "newsletter.example.com" }
              ]
            }
          })
        };
      }

      if (url.includes("/users/me/messages/m2")) {
        return {
          ok: true,
          json: async () => ({
            id: "m2",
            threadId: "t2",
            labelIds: ["INBOX"],
            internalDate: `${Date.parse("2026-03-31T00:01:00Z")}`,
            payload: {
              headers: [
                { name: "Subject", value: "Another Newsletter" },
                { name: "From", value: "list@example.com" },
                { name: "List-Unsubscribe", value: "<mailto:unsubscribe@example.com>" }
              ]
            }
          })
        };
      }

      if (url.includes("/users/me/messages/m3")) {
        return {
          ok: true,
          json: async () => ({
            id: "m3",
            threadId: "t3",
            labelIds: ["INBOX"],
            snippet: "Human message",
            internalDate: `${Date.parse("2026-03-31T00:02:00Z")}`,
            payload: {
              headers: [
                { name: "Subject", value: "Human" },
                { name: "From", value: "person@example.com" },
                { name: "To", value: "user@gmail.com" }
              ],
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: Buffer.from("Human message", "utf8").toString("base64url")
                  }
                }
              ]
            }
          })
        };
      }

      if (url.endsWith("/users/me/labels")) {
        return {
          ok: true,
          json: async () => ({
            labels: [{ id: "INBOX", name: "INBOX", type: "system" }]
          })
        };
      }

      throw new Error(`Unexpected fetch URL in excludeMailingLists test: ${url}`);
    });

    const adapter = new GoogleMailAdapter(account, auth);
    const result = await adapter.searchMessages({ text: "hello", limit: 1, excludeMailingLists: true });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.subject).toBe("Human");
    expect(result.total).toBe(1);
    expect(result.nextPosition).toBeUndefined();
  });

  it("lists Google calendar events across calendars", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ id: "primary", summary: "Primary" }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "event-1",
              summary: "Interview",
              start: { dateTime: "2026-04-01T15:00:00Z" },
              end: { dateTime: "2026-04-01T16:00:00Z" }
            }
          ]
        })
      });

    const adapter = new GoogleCalendarAdapter(account, auth);
    const events = await adapter.getEvents({
      start: "2026-04-01T00:00:00Z",
      end: "2026-04-02T00:00:00Z"
    });

    expect(events[0]?.calendarName).toBe("Primary");
    expect(events[0]?.title).toBe("Interview");
  });

  it("searches and fetches Google contacts", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              person: {
                resourceName: "people/c123",
                names: [{ displayName: "Cody" }],
                emailAddresses: [{ value: "cody@example.com" }]
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resourceName: "people/c123",
          names: [{ displayName: "Cody" }],
          emailAddresses: [{ value: "cody@example.com" }],
          phoneNumbers: [{ value: "+1 555-0100" }]
        })
      });

    const adapter = new GoogleContactsAdapter(account, auth);
    const search = await adapter.searchContacts({ query: "Cody" });
    const contact = await adapter.getContact(search[0]!.id);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://people.googleapis.com/v1/people:searchContacts");
    expect(search[0]?.fullName).toBe("Cody");
    expect(contact.emails).toEqual(["cody@example.com"]);
    expect(contact.phones).toEqual(["+1 555-0100"]);
  });
});
