import type { AccountConfig, AddressBookSummary, ContactSummary } from "@mail-agent/shared";
import type { AuthMaterial } from "@mail-agent/shared";
import { FastmailDavClient } from "./dav-client.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseVcard(addressBookId: string, href: string, vcard: string): ContactSummary {
  const lines = vcard.split(/\r?\n/);
  const values = new Map<string, string[]>();

  for (const rawLine of lines) {
    if (!rawLine.includes(":")) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    const key = rawLine.slice(0, separator).split(";")[0]?.toUpperCase() ?? "";
    const value = rawLine.slice(separator + 1);
    const current = values.get(key) ?? [];
    current.push(value);
    values.set(key, current);
  }

  return {
    id: values.get("UID")?.[0] ?? href,
    addressBookId,
    fullName: values.get("FN")?.[0] ?? "(unnamed)",
    emails: values.get("EMAIL") ?? [],
    phones: values.get("TEL") ?? [],
    organizations: values.get("ORG") ?? []
  };
}

export class FastmailContactsAdapter {
  private readonly client: FastmailDavClient;

  constructor(account: AccountConfig, auth: AuthMaterial) {
    this.client = new FastmailDavClient(account.fastmail?.carddavUrl ?? "https://carddav.fastmail.com", {
      username: auth.username,
      password: auth.accessToken
    });
  }

  async listAddressBooks(): Promise<AddressBookSummary[]> {
    const responses = await this.client.propfind("/", `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
  </d:prop>
</d:propfind>`);

    return responses
      .filter((entry) => JSON.stringify(entry.props.resourcetype ?? "").includes("addressbook"))
      .map((entry) => ({
        id: entry.href,
        name: asString(entry.props.displayname) ?? entry.href
      }));
  }

  async searchContacts(options: { query: string; addressBookId?: string }): Promise<ContactSummary[]> {
    const books = await this.listAddressBooks();
    const scoped = options.addressBookId ? books.filter((book) => book.id === options.addressBookId) : books;
    const query = options.query.toLowerCase();

    const contacts = await Promise.all(
      scoped.map(async (book) => {
        const responses = await this.client.report(book.id, `<?xml version="1.0" encoding="utf-8" ?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</card:addressbook-query>`);

        return responses.flatMap((entry) => {
          const vcard = asString(entry.props["address-data"]);
          if (!vcard) {
            return [];
          }
          const contact = parseVcard(book.id, entry.href, vcard);
          const haystack = [contact.fullName, ...contact.emails, ...contact.organizations].join(" ").toLowerCase();
          return haystack.includes(query) ? [contact] : [];
        });
      })
    );

    return contacts.flat();
  }

  async getContact(contactId: string): Promise<ContactSummary> {
    const results = await this.searchContacts({ query: contactId });
    const exact = results.find((contact) => contact.id === contactId);
    if (exact) {
      return exact;
    }
    if (results[0]) {
      return results[0];
    }
    throw new Error(`Contact not found: ${contactId}`);
  }
}
