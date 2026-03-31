import {
  NotSupportedError,
  type AccountConfig,
  type ProviderBundle,
  getSecretStore
} from "@mail-agent/shared";
import { FastmailCalendarAdapter } from "./fastmail/calendar-adapter.js";
import { FastmailContactsAdapter } from "./fastmail/contacts-adapter.js";
import { FastmailMailAdapter } from "./fastmail/mail-adapter.js";

export async function createProviderBundle(account: AccountConfig): Promise<ProviderBundle> {
  const auth = await getSecretStore().load(account.id);

  switch (account.provider) {
    case "fastmail": {
      const mail = new FastmailMailAdapter(account, auth);
      const calendar = new FastmailCalendarAdapter(account, auth);
      const contacts = new FastmailContactsAdapter(account, auth);
      return {
        account,
        listAccounts: async () => [account],
        listMailboxes: mail.listMailboxes.bind(mail),
        searchMessages: mail.searchMessages.bind(mail),
        readMessageBatch: mail.readMessageBatch.bind(mail),
        readThread: mail.readThread.bind(mail),
        composeMessage: mail.composeMessage.bind(mail),
        draftReply: mail.draftReply.bind(mail),
        sendMessage: mail.sendMessage.bind(mail),
        archiveMessages: mail.archiveMessages.bind(mail),
        moveMessages: mail.moveMessages.bind(mail),
        tagMessages: mail.tagMessages.bind(mail),
        markMessages: mail.markMessages.bind(mail),
        deleteMessages: mail.deleteMessages.bind(mail),
        listCalendars: calendar.listCalendars.bind(calendar),
        getEvents: calendar.getEvents.bind(calendar),
        listAddressBooks: contacts.listAddressBooks.bind(contacts),
        searchContacts: contacts.searchContacts.bind(contacts),
        getContact: contacts.getContact.bind(contacts)
      };
    }
    default:
      throw new NotSupportedError(`Provider ${account.provider} is not implemented in v1.`);
  }
}
