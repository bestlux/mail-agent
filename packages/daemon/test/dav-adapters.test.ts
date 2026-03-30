import { beforeEach, describe, expect, it, vi } from "vitest";
import { FastmailCalendarAdapter } from "../src/providers/fastmail/calendar-adapter.js";
import { FastmailContactsAdapter } from "../src/providers/fastmail/contacts-adapter.js";

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

describe("DAV adapters", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("lists calendars from caldav multistatus", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/user/calendar/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Work</d:displayname>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
    });

    const adapter = new FastmailCalendarAdapter(account, {
      username: "user@example.com",
      accessToken: "app-password"
    });
    const calendars = await adapter.listCalendars();

    expect(calendars[0]?.name).toBe("Work");
  });

  it("searches contacts from carddav data", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/user/contacts/default/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Default</d:displayname>
        <d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/user/contacts/default/jane.vcf</d:href>
    <d:propstat>
      <d:prop>
        <card:address-data>BEGIN:VCARD
FN:Jane Doe
EMAIL:jane@example.com
UID:contact-1
END:VCARD</card:address-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      });

    const adapter = new FastmailContactsAdapter(account, {
      username: "user@example.com",
      accessToken: "app-password"
    });
    const contacts = await adapter.searchContacts({ query: "jane" });

    expect(contacts[0]?.fullName).toBe("Jane Doe");
  });
});
