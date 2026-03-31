import { z } from "zod";

export const providerSchema = z.enum([
  "fastmail",
  "google-workspace",
  "microsoft-graph",
  "generic-imap",
  "generic-caldav",
  "generic-carddav"
]);

export type ProviderType = z.infer<typeof providerSchema>;

export const trustModeSchema = z.enum(["manual-confirm", "trusted-automation"]);
export type TrustMode = z.infer<typeof trustModeSchema>;

export const messageCapabilitySchema = z.enum([
  "mail-read",
  "mail-write",
  "calendar-read",
  "contacts-read"
]);
export type Capability = z.infer<typeof messageCapabilitySchema>;

export const automationPolicySchema = z.object({
  allowSend: z.boolean().default(true),
  allowMutations: z.boolean().default(true),
  allowDelete: z.literal(false).default(false)
});
export type AutomationPolicy = z.infer<typeof automationPolicySchema>;

export const cacheSettingsSchema = z.object({
  searchTtlMs: z.number().int().positive().default(60_000),
  threadTtlMs: z.number().int().positive().default(60_000),
  eventTtlMs: z.number().int().positive().default(60_000),
  contactTtlMs: z.number().int().positive().default(60_000)
});
export type CacheSettings = z.infer<typeof cacheSettingsSchema>;

export const accountConfigSchema = z.object({
  id: z.string().min(1),
  provider: providerSchema,
  displayName: z.string().min(1),
  emailAddress: z.email(),
  capabilities: z.array(messageCapabilitySchema).min(1),
  trustMode: trustModeSchema.default("manual-confirm"),
  automationPolicy: automationPolicySchema.default({
    allowSend: true,
    allowMutations: true,
    allowDelete: false
  }),
  cache: cacheSettingsSchema.default({
    searchTtlMs: 60_000,
    threadTtlMs: 60_000,
    eventTtlMs: 60_000,
    contactTtlMs: 60_000
  }),
  fastmail: z
    .object({
      apiBaseUrl: z.url().default("https://api.fastmail.com"),
      jmapSessionUrl: z.url().default("https://api.fastmail.com/jmap/session"),
      caldavUrl: z.url().default("https://caldav.fastmail.com"),
      carddavUrl: z.url().default("https://carddav.fastmail.com")
    })
    .optional(),
  google: z
    .object({
      authorizationUrl: z.url().default("https://accounts.google.com/o/oauth2/v2/auth"),
      tokenUrl: z.url().default("https://oauth2.googleapis.com/token"),
      revokeUrl: z.url().default("https://oauth2.googleapis.com/revoke"),
      gmailBaseUrl: z.url().default("https://gmail.googleapis.com/gmail/v1"),
      calendarBaseUrl: z.url().default("https://www.googleapis.com/calendar/v3"),
      peopleBaseUrl: z.url().default("https://people.googleapis.com/v1"),
      redirectHost: z.string().default("127.0.0.1"),
      redirectPort: z.number().int().min(1).max(65535).optional(),
      scopes: z.array(z.string()).min(1).default([
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/contacts.readonly"
      ])
    })
    .optional()
});
export type AccountConfig = z.infer<typeof accountConfigSchema>;

export const configFileSchema = z.object({
  version: z.literal(1).default(1),
  accounts: z.array(accountConfigSchema).default([])
});
export type ConfigFile = z.infer<typeof configFileSchema>;

export type MessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string[];
  to: string[];
  receivedAt: string;
  preview: string;
  keywords: string[];
  mailboxNames: string[];
};

export type MailboxSummary = {
  id: string;
  name: string;
  role?: string;
};

export type MessageDetail = MessageSummary & {
  cc: string[];
  bcc: string[];
  textBody: string;
  htmlBody?: string;
  messageIdHeader?: string;
  references: string[];
  replyTo?: string[];
};

export type DraftMessage = {
  subject: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
};

export type MessageSearchInput = {
  text?: string;
  mailbox?: string;
  mailboxRole?: string;
  from?: string;
  subject?: string;
  unread?: boolean;
  excludeMailingLists?: boolean;
  collapseThreads?: boolean;
  position?: number;
  since?: string;
  until?: string;
  limit?: number;
};

export type MessageSearchResult = {
  messages: MessageSummary[];
  total: number;
  position: number;
  limit: number;
  nextPosition?: number;
  collapseThreads: boolean;
};

export type EventSummary = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
};

export type CalendarSummary = {
  id: string;
  name: string;
  description?: string;
};

export type ContactSummary = {
  id: string;
  addressBookId: string;
  fullName: string;
  emails: string[];
  phones: string[];
  organizations: string[];
};

export type AddressBookSummary = {
  id: string;
  name: string;
  description?: string;
};

export type DeleteConfirmation = {
  token: string;
  accountId: string;
  messageIds: string[];
  expiresAt: string;
};

export type ToolResult<T> = {
  accountId: string;
  provider: ProviderType;
  data: T;
  cached?: boolean;
};

export type FastmailAuthMaterial = {
  kind: "fastmail-basic";
  username: string;
  jmapAccessToken: string;
  davPassword: string;
};

export type OAuthAuthMaterial = {
  kind: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scopes: string[];
  tokenType?: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  redirectUri: string;
  accountHint?: string;
};

export type AuthMaterial = FastmailAuthMaterial | OAuthAuthMaterial;
