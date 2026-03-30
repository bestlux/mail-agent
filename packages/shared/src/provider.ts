import type {
  AccountConfig,
  AddressBookSummary,
  CalendarSummary,
  ContactSummary,
  DraftMessage,
  EventSummary,
  MessageDetail,
  MessageSearchInput,
  MessageSummary
} from "./types.js";

export type ProviderContext = {
  account: AccountConfig;
};

export interface MailProvider {
  listAccounts(): Promise<AccountConfig[]>;
  searchMessages(input: MessageSearchInput): Promise<MessageSummary[]>;
  readMessageBatch(messageIds: string[]): Promise<MessageDetail[]>;
  readThread(threadId: string): Promise<MessageDetail[]>;
  composeMessage(draft: DraftMessage): Promise<DraftMessage>;
  draftReply(messageId: string, instructions?: string): Promise<DraftMessage>;
  sendMessage(draft: DraftMessage): Promise<{ id: string; threadId?: string }>;
  archiveMessages(messageIds: string[]): Promise<{ archived: string[] }>;
  moveMessages(messageIds: string[], destinationMailbox: string): Promise<{ moved: string[] }>;
  tagMessages(messageIds: string[], tags: string[]): Promise<{ updated: string[]; tags: string[] }>;
  markMessages(messageIds: string[], flags: Record<string, boolean>): Promise<{ updated: string[] }>;
  deleteMessages(messageIds: string[]): Promise<{ destroyed: string[] }>;
}

export interface CalendarProvider {
  listCalendars(): Promise<CalendarSummary[]>;
  getEvents(options: { start: string; end: string; calendarId?: string }): Promise<EventSummary[]>;
}

export interface ContactsProvider {
  listAddressBooks(): Promise<AddressBookSummary[]>;
  searchContacts(options: { query: string; addressBookId?: string }): Promise<ContactSummary[]>;
  getContact(contactId: string): Promise<ContactSummary>;
}

export interface ProviderBundle extends Partial<MailProvider>, Partial<CalendarProvider>, Partial<ContactsProvider> {
  readonly account: AccountConfig;
}

export interface ProviderFactory {
  create(context: ProviderContext): Promise<ProviderBundle>;
}
