import type {
  AccountConfig,
  DraftMessage,
  MessageDetail,
  MessageSearchInput,
  MessageSummary
} from "@mail-agent/shared";
import { type AuthMaterial } from "@mail-agent/shared";
import { FastmailJmapClient } from "./jmap-client.js";

type MailboxInfo = {
  id: string;
  name: string;
  role?: string;
};

type IdentityInfo = {
  id: string;
  email: string;
  name?: string;
};

type RawEmail = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function emailList(value: unknown): string[] {
  return asArray(value as Array<{ email?: string; name?: string }>)
    .map((entry) => {
      if (entry.name && entry.email) {
        return `${entry.name} <${entry.email}>`;
      }
      return entry.email ?? "";
    })
    .filter(Boolean);
}

function firstTextBody(email: RawEmail): string {
  const bodyValues = (email.bodyValues ?? {}) as Record<string, { value?: string }>;
  const textBody = asArray(email.textBody as Array<{ partId?: string }>);
  const partId = textBody[0]?.partId;

  if (!partId) {
    return "";
  }

  return bodyValues[partId]?.value ?? "";
}

function firstHtmlBody(email: RawEmail): string | undefined {
  const bodyValues = (email.bodyValues ?? {}) as Record<string, { value?: string }>;
  const htmlBody = asArray(email.htmlBody as Array<{ partId?: string }>);
  const partId = htmlBody[0]?.partId;

  if (!partId) {
    return undefined;
  }

  return bodyValues[partId]?.value;
}

function messageSummary(email: RawEmail, mailboxMap: Map<string, MailboxInfo>): MessageSummary {
  const mailboxIds = Object.entries((email.mailboxIds ?? {}) as Record<string, boolean>)
    .filter(([, enabled]) => enabled)
    .map(([mailboxId]) => mailboxMap.get(mailboxId)?.name ?? mailboxId);

  return {
    id: String(email.id ?? ""),
    threadId: String(email.threadId ?? ""),
    subject: String(email.subject ?? ""),
    from: emailList(email.from),
    to: emailList(email.to),
    receivedAt: String(email.receivedAt ?? email.sentAt ?? ""),
    preview: String(email.preview ?? ""),
    keywords: Object.keys((email.keywords ?? {}) as Record<string, boolean>).filter((keyword) => (email.keywords as Record<string, boolean>)[keyword]),
    mailboxNames: mailboxIds
  };
}

function messageDetail(email: RawEmail, mailboxMap: Map<string, MailboxInfo>): MessageDetail {
  const summary = messageSummary(email, mailboxMap);
  return {
    ...summary,
    cc: emailList(email.cc),
    bcc: emailList(email.bcc),
    textBody: firstTextBody(email),
    htmlBody: firstHtmlBody(email),
    references: asArray(email.references as string[]),
    replyTo: emailList(email.replyTo)
  };
}

function buildFilter(input: MessageSearchInput): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (input.text) {
    conditions.push({ text: input.text });
  }

  if (input.mailbox) {
    conditions.push({ inMailbox: input.mailbox });
  }

  if (input.from) {
    conditions.push({ from: input.from });
  }

  if (input.subject) {
    conditions.push({ subject: input.subject });
  }

  if (input.unread === true) {
    conditions.push({ notKeyword: "$seen" });
  }

  if (input.since) {
    conditions.push({ after: input.since });
  }

  if (input.until) {
    conditions.push({ before: input.until });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0] ?? {};
  }

  return {
    operator: "AND",
    conditions
  };
}

function slugKeyword(tag: string): string {
  return `$mail-agent/${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export class FastmailMailAdapter {
  private readonly client: FastmailJmapClient;
  private mailboxMap?: Map<string, MailboxInfo>;
  private identities?: IdentityInfo[];

  constructor(
    private readonly account: AccountConfig,
    auth: AuthMaterial
  ) {
    this.client = new FastmailJmapClient(account.fastmail?.jmapSessionUrl ?? "https://api.fastmail.com/jmap/session", auth.accessToken);
  }

  private async getMailboxMap(): Promise<Map<string, MailboxInfo>> {
    if (this.mailboxMap) {
      return this.mailboxMap;
    }

    const accountId = await this.client.getMailAccountId();
    const query = await this.client.callSingle("Mailbox/query", { accountId });
    const ids = (query.ids ?? []) as string[];
    const payload = await this.client.callSingle("Mailbox/get", { accountId, ids });
    const list = (payload.list ?? []) as Array<Record<string, unknown>>;
    this.mailboxMap = new Map(
      list.map((mailbox) => [
        String(mailbox.id),
        {
          id: String(mailbox.id),
          name: String(mailbox.name),
          role: mailbox.role ? String(mailbox.role) : undefined
        }
      ])
    );
    return this.mailboxMap;
  }

  private async getIdentity(): Promise<IdentityInfo> {
    if (!this.identities) {
      const accountId = await this.client.getSubmissionAccountId();
      const payload = await this.client.callSingle("Identity/get", { accountId });
      const identities = (payload.list ?? []) as Array<Record<string, unknown>>;
      this.identities = identities.map((identity) => ({
        id: String(identity.id),
        email: String(identity.email),
        name: identity.name ? String(identity.name) : undefined
      }));
    }

    const preferred = this.identities.find(
      (identity) => identity.email.toLowerCase() === this.account.emailAddress.toLowerCase()
    );
    const fallback = this.identities[0];
    if (!preferred && !fallback) {
      throw new Error("No Fastmail sending identity is available for this account.");
    }
    if (preferred) {
      return preferred;
    }
    return fallback as IdentityInfo;
  }

  private async findMailboxIdByRole(role: string): Promise<string | undefined> {
    const mailboxes = await this.getMailboxMap();
    return [...mailboxes.values()].find((mailbox) => mailbox.role === role)?.id;
  }

  private async getMessages(ids: string[]): Promise<MessageDetail[]> {
    const accountId = await this.client.getMailAccountId();
    const mailboxes = await this.getMailboxMap();
    const payload = await this.client.callSingle("Email/get", {
      accountId,
      ids,
      fetchTextBodyValues: true,
      fetchHTMLBodyValues: true,
      properties: [
        "id",
        "threadId",
        "mailboxIds",
        "keywords",
        "subject",
        "from",
        "to",
        "cc",
        "bcc",
        "replyTo",
        "receivedAt",
        "sentAt",
        "preview",
        "references",
        "bodyValues",
        "textBody",
        "htmlBody"
      ]
    });

    return ((payload.list ?? []) as RawEmail[]).map((email) => messageDetail(email, mailboxes));
  }

  async searchMessages(input: MessageSearchInput): Promise<MessageSummary[]> {
    const accountId = await this.client.getMailAccountId();
    const mailboxes = await this.getMailboxMap();
    const query = await this.client.callSingle("Email/query", {
      accountId,
      filter: buildFilter(input),
      sort: [{ property: "receivedAt", isAscending: false }],
      limit: input.limit ?? 20
    });

    const ids = (query.ids ?? []) as string[];
    if (ids.length === 0) {
      return [];
    }

    const payload = await this.client.callSingle("Email/get", {
      accountId,
      ids,
      properties: ["id", "threadId", "mailboxIds", "keywords", "subject", "from", "to", "receivedAt", "sentAt", "preview"]
    });

    return ((payload.list ?? []) as RawEmail[]).map((email) => messageSummary(email, mailboxes));
  }

  async readMessageBatch(messageIds: string[]): Promise<MessageDetail[]> {
    return await this.getMessages(messageIds);
  }

  async readThread(threadId: string): Promise<MessageDetail[]> {
    const accountId = await this.client.getMailAccountId();
    const payload = await this.client.callSingle("Email/query", {
      accountId,
      filter: { threadId },
      sort: [{ property: "receivedAt", isAscending: true }],
      limit: 200
    });

    return await this.getMessages((payload.ids ?? []) as string[]);
  }

  async composeMessage(draft: DraftMessage): Promise<DraftMessage> {
    return {
      ...draft,
      subject: draft.subject.trim(),
      textBody: draft.textBody.trim()
    };
  }

  async draftReply(messageId: string, instructions?: string): Promise<DraftMessage> {
    const [message] = await this.getMessages([messageId]);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }
    const replyTo = message.replyTo && message.replyTo.length > 0 ? message.replyTo : message.from;
    const subject = message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`;
    const quoted = message.textBody
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");

    return {
      to: replyTo,
      subject,
      textBody: `${instructions?.trim() ?? ""}${instructions ? "\n\n" : ""}${quoted}`.trim(),
      inReplyTo: messageId,
      references: message.references.length > 0 ? message.references : [messageId],
      threadId: message.threadId
    };
  }

  async sendMessage(draft: DraftMessage): Promise<{ id: string; threadId?: string }> {
    const mailAccountId = await this.client.getMailAccountId();
    const submissionAccountId = await this.client.getSubmissionAccountId();
    const identity = await this.getIdentity();
    const sentMailboxId = await this.findMailboxIdByRole("sent");

    const emailCreateId = "mail-create";
    const submissionCreateId = "submission-create";
    const responses = await this.client.call([
      [
        "Email/set",
        {
          accountId: mailAccountId,
          create: {
            [emailCreateId]: {
              mailboxIds: sentMailboxId ? { [sentMailboxId]: true } : {},
              from: [{ email: identity.email, name: identity.name }],
              to: draft.to.map((email) => ({ email })),
              cc: draft.cc?.map((email) => ({ email })) ?? [],
              bcc: draft.bcc?.map((email) => ({ email })) ?? [],
              subject: draft.subject,
              ...(draft.inReplyTo ? { inReplyTo: [draft.inReplyTo] } : {}),
              ...(draft.references ? { references: draft.references } : {}),
              bodyValues: {
                text: { value: draft.textBody },
                ...(draft.htmlBody ? { html: { value: draft.htmlBody } } : {})
              },
              textBody: [{ partId: "text", type: "text/plain" }],
              ...(draft.htmlBody ? { htmlBody: [{ partId: "html", type: "text/html" }] } : {})
            }
          }
        },
        "create-email"
      ],
      [
        "EmailSubmission/set",
        {
          accountId: submissionAccountId,
          create: {
            [submissionCreateId]: {
              identityId: identity.id,
              emailId: `#${emailCreateId}`,
              envelope: {
                mailFrom: { email: identity.email, parameters: null },
                rcptTo: [...draft.to, ...(draft.cc ?? []), ...(draft.bcc ?? [])].map((email) => ({
                  email,
                  parameters: null
                }))
              }
            }
          }
        },
        "submit-email"
      ]
    ]);
    const [emailResult, submissionResult] = responses;
    if (!emailResult || !submissionResult) {
      throw new Error("Fastmail send did not return both Email/set and EmailSubmission/set results.");
    }

    const createdEmail = (emailResult[1].created as Record<string, { id?: string }> | undefined)?.[emailCreateId];
    const createdSubmission = (submissionResult[1].created as Record<string, { emailId?: string }> | undefined)?.[
      submissionCreateId
    ];
    return {
      id: String(createdSubmission?.emailId ?? createdEmail?.id ?? "")
    };
  }

  private async updateEmails(messageIds: string[], patch: Record<string, unknown>): Promise<{ updated: string[] }> {
    const accountId = await this.client.getMailAccountId();
    const update = Object.fromEntries(messageIds.map((id) => [id, patch]));
    await this.client.callSingle("Email/set", {
      accountId,
      update
    });
    return { updated: messageIds };
  }

  async archiveMessages(messageIds: string[]): Promise<{ archived: string[] }> {
    const inboxId = await this.findMailboxIdByRole("inbox");
    const patch = inboxId ? { [`mailboxIds/${inboxId}`]: null } : {};
    await this.updateEmails(messageIds, patch);
    return { archived: messageIds };
  }

  async moveMessages(messageIds: string[], destinationMailbox: string): Promise<{ moved: string[] }> {
    await this.updateEmails(messageIds, {
      mailboxIds: { [destinationMailbox]: true }
    });
    return { moved: messageIds };
  }

  async tagMessages(messageIds: string[], tags: string[]): Promise<{ updated: string[]; tags: string[] }> {
    const patch = Object.fromEntries(tags.map((tag) => [`keywords/${slugKeyword(tag)}`, true]));
    await this.updateEmails(messageIds, patch);
    return { updated: messageIds, tags };
  }

  async markMessages(messageIds: string[], flags: Record<string, boolean>): Promise<{ updated: string[] }> {
    const patch: Record<string, unknown> = {};
    for (const [flag, value] of Object.entries(flags)) {
      patch[`keywords/${flag}`] = value ? true : null;
    }
    await this.updateEmails(messageIds, patch);
    return { updated: messageIds };
  }

  async deleteMessages(messageIds: string[]): Promise<{ destroyed: string[] }> {
    const accountId = await this.client.getMailAccountId();
    await this.client.callSingle("Email/set", {
      accountId,
      destroy: messageIds
    });
    return { destroyed: messageIds };
  }
}
