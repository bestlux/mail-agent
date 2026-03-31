import type { AccountConfig, AddressBookSummary, ContactSummary, OAuthAuthMaterial } from "@iomancer/mail-agent-shared";
import { GoogleApiClient } from "./client.js";

type GooglePerson = {
  resourceName: string;
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  phoneNumbers?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string }>;
};

type GoogleSearchContactsResponse = {
  results?: Array<{
    person?: GooglePerson;
  }>;
};

export class GoogleContactsAdapter {
  private readonly client: GoogleApiClient;

  constructor(
    private readonly account: AccountConfig,
    auth: OAuthAuthMaterial
  ) {
    this.client = new GoogleApiClient(account, auth);
  }

  private get peopleBaseUrl(): string {
    return this.account.google?.peopleBaseUrl ?? "https://people.googleapis.com/v1";
  }

  private mapPerson(person: GooglePerson): ContactSummary {
    return {
      id: person.resourceName,
      addressBookId: "google-contacts",
      fullName: person.names?.[0]?.displayName ?? person.resourceName,
      emails: (person.emailAddresses ?? []).map((entry) => entry.value ?? "").filter(Boolean),
      phones: (person.phoneNumbers ?? []).map((entry) => entry.value ?? "").filter(Boolean),
      organizations: (person.organizations ?? []).map((entry) => entry.name ?? "").filter(Boolean)
    };
  }

  async listAddressBooks(): Promise<AddressBookSummary[]> {
    return [
      {
        id: "google-contacts",
        name: "Google Contacts",
        description: "Primary Google contacts for the authenticated account."
      }
    ];
  }

  async searchContacts(options: { query: string; addressBookId?: string }): Promise<ContactSummary[]> {
    const response = await this.client.requestJson<GoogleSearchContactsResponse>(this.peopleBaseUrl, "people:searchContacts", {
      query: {
        query: options.query,
        pageSize: 30,
        readMask: "names,emailAddresses,phoneNumbers,organizations"
      }
    });

    return (response.results ?? [])
      .map((result) => result.person)
      .filter((person): person is GooglePerson => Boolean(person))
      .map((person) => this.mapPerson(person));
  }

  async getContact(contactId: string): Promise<ContactSummary> {
    const person = await this.client.requestJson<GooglePerson>(this.peopleBaseUrl, contactId, {
      query: {
        personFields: "names,emailAddresses,phoneNumbers,organizations"
      }
    });
    return this.mapPerson(person);
  }
}
