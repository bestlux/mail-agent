import type { AccountConfig, AddressBookSummary, ContactSummary, FastmailAuthMaterial } from "@iomancer/mail-agent-shared";
import { FastmailDavClient } from "./dav-client.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function cleanValues(values: string[] | undefined, excludedValues = new Set<string>()): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !excludedValues.has(value));
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

  const fullName = values.get("FN")?.[0]?.trim();

  return {
    id: values.get("UID")?.[0] ?? href,
    addressBookId,
    fullName: fullName && fullName.length > 0 ? fullName : "(unnamed)",
    emails: cleanValues(values.get("EMAIL")),
    phones: cleanValues(values.get("TEL")),
    organizations: cleanValues(values.get("ORG"), new Set([";"]))
  };
}

export class FastmailContactsAdapter {
  private readonly client: FastmailDavClient;

  constructor(account: AccountConfig, auth: FastmailAuthMaterial) {
    this.client = new FastmailDavClient(account.fastmail?.carddavUrl ?? "https://carddav.fastmail.com", {
      username: auth.username,
      password: auth.davPassword
    });
  }

  async listAddressBooks(): Promise<AddressBookSummary[]> {
    const homes = await this.client.discoverHomes("carddav");
    const responses = await this.client.propfind(homes.addressBookHomeSetUrl, `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
  </d:prop>
</d:propfind>`);

    return responses
      .filter((entry) => entry.href !== homes.addressBookHomeSetUrl)
      .filter((entry) => JSON.stringify(entry.props.resourcetype ?? "").includes("addressbook"))
      .map((entry) => ({
        id: entry.href,
        name: asString(entry.props.displayname) ?? entry.href
      }));
  }

  private async listContacts(addressBookId?: string): Promise<ContactSummary[]> {
    const books = await this.listAddressBooks();
    const scoped = addressBookId ? books.filter((book) => book.id === addressBookId) : books;
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
          return [parseVcard(book.id, entry.href, vcard)];
        });
      })
    );

    return contacts.flat();
  }

  async searchContacts(options: { query: string; addressBookId?: string }): Promise<ContactSummary[]> {
    const query = options.query.toLowerCase();
    const contacts = await this.listContacts(options.addressBookId);
    return contacts.filter((contact) => {
      const haystack = [contact.id, contact.fullName, ...contact.emails, ...contact.organizations].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  async getContact(contactId: string): Promise<ContactSummary> {
    const contacts = await this.listContacts();
    const exact = contacts.find((contact) => contact.id === contactId);
    if (exact) {
      return exact;
    }
    throw new Error(`Contact not found: ${contactId}`);
  }
}
