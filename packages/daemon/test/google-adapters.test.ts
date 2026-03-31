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

  it("searches Gmail messages and maps system labels to mailbox names", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [{ id: "m1", threadId: "t1" }],
          resultSizeEstimate: 1
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "m1",
          threadId: "t1",
          labelIds: ["INBOX", "STARRED"],
          snippet: "Preview",
          internalDate: `${Date.parse("2026-03-31T00:00:00Z")}`,
          payload: {
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "sender@example.com" },
              { name: "To", value: "user@gmail.com" }
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
          labels: [
            { id: "INBOX", name: "INBOX", type: "system" },
            { id: "STARRED", name: "STARRED", type: "system" }
          ]
        })
      });

    const adapter = new GoogleMailAdapter(account, auth);
    const result = await adapter.searchMessages({ text: "hello" });

    expect(result.messages[0]?.subject).toBe("Hello");
    expect(result.messages[0]?.mailboxNames).toContain("Inbox");
    expect(result.messages[0]?.keywords).toContain("$flagged");
    expect(result.total).toBe(1);
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

    expect(search[0]?.fullName).toBe("Cody");
    expect(contact.emails).toEqual(["cody@example.com"]);
    expect(contact.phones).toEqual(["+1 555-0100"]);
  });
});
