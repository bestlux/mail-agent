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
      status: 301,
      ok: false,
      statusText: "Moved Permanently",
      headers: {
        get: (name: string) => (name.toLowerCase() === "location" ? "https://caldav.fastmail.com/dav/calendars" : null)
      }
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/calendars</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/dav/principals/user/user@example.com/</d:href></d:current-user-principal>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/dav/principals/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set><d:href>/dav/calendars/user/user@example.com/</d:href></c:calendar-home-set>
        <card:addressbook-home-set><d:href>/dav/addressbooks/user/user@example.com/</d:href></card:addressbook-home-set>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Root</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/work/</d:href>
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
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "jmap-token",
      davPassword: "app-password"
    });
    const calendars = await adapter.listCalendars();

    expect(calendars[0]?.name).toBe("Work");
  });

  it("searches contacts from carddav data", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 301,
        ok: false,
        statusText: "Moved Permanently",
        headers: {
          get: (name: string) => (name.toLowerCase() === "location" ? "https://carddav.fastmail.com/dav/addressbooks" : null)
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/addressbooks</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/dav/principals/user/user@example.com/</d:href></d:current-user-principal>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/dav/principals/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set><d:href>/dav/calendars/user/user@example.com/</d:href></c:calendar-home-set>
        <card:addressbook-home-set><d:href>/dav/addressbooks/user/user@example.com/</d:href></card:addressbook-home-set>
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
    <d:href>/dav/addressbooks/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Root</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/addressbooks/user/user@example.com/Default/</d:href>
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
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "jmap-token",
      davPassword: "app-password"
    });
    const contacts = await adapter.searchContacts({ query: "jane" });

    expect(contacts[0]?.fullName).toBe("Jane Doe");
  });

  it("gets a contact by id from carddav data", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 301,
        ok: false,
        statusText: "Moved Permanently",
        headers: {
          get: (name: string) => (name.toLowerCase() === "location" ? "https://carddav.fastmail.com/dav/addressbooks" : null)
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/addressbooks</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/dav/principals/user/user@example.com/</d:href></d:current-user-principal>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/dav/principals/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set><d:href>/dav/calendars/user/user@example.com/</d:href></c:calendar-home-set>
        <card:addressbook-home-set><d:href>/dav/addressbooks/user/user@example.com/</d:href></card:addressbook-home-set>
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
    <d:href>/dav/addressbooks/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Root</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/addressbooks/user/user@example.com/Default/</d:href>
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
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "jmap-token",
      davPassword: "app-password"
    });
    const contact = await adapter.getContact("contact-1");

    expect(contact.fullName).toBe("Jane Doe");
    expect(contact.emails).toEqual(["jane@example.com"]);
  });

  it("skips forbidden calendars when reading all events", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 301,
        ok: false,
        statusText: "Moved Permanently",
        headers: {
          get: (name: string) => (name.toLowerCase() === "location" ? "https://caldav.fastmail.com/dav/calendars" : null)
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/calendars</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/dav/principals/user/user@example.com/</d:href></d:current-user-principal>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/dav/principals/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set><d:href>/dav/calendars/user/user@example.com/</d:href></c:calendar-home-set>
        <card:addressbook-home-set><d:href>/dav/addressbooks/user/user@example.com/</d:href></card:addressbook-home-set>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Root</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Work</d:displayname>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/shared/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Shared</d:displayname>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      })
      .mockRejectedValueOnce(new Error("DAV request failed: 403 Forbidden"))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/dav/calendars/user/user@example.com/work/event.ics</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-1
SUMMARY:Demo
DTSTART:20260331T150000Z
DTEND:20260331T160000Z
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
      });

    const adapter = new FastmailCalendarAdapter(account, {
      kind: "fastmail-basic",
      username: "user@example.com",
      jmapAccessToken: "jmap-token",
      davPassword: "app-password"
    });
    const events = await adapter.getEvents({
      start: "20260331T000000Z",
      end: "20260401T000000Z"
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Demo");
  });
});
