import type {
  AccountConfig,
  DraftMessage,
  MailboxSummary,
  MessageDetail,
  MessageSearchInput,
  MessageSearchResult,
  MessageSummary,
  OAuthAuthMaterial
} from "@mail-agent/shared";
import { GoogleApiClient } from "./client.js";

type GmailLabel = {
  id: string;
  name: string;
  type?: "system" | "user";
  messageListVisibility?: string;
  labelListVisibility?: string;
};

type GmailMessageRef = {
  id: string;
  threadId: string;
};

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
};

type GmailThread = {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
};

type LabelInfo = {
  id: string;
  name: string;
  role?: string;
  system: boolean;
};

const PSEUDO_ARCHIVE_ID = "gmail/archive";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return Buffer.from(value, "base64url").toString("utf8");
}

function toHeaderMap(headers: GmailHeader[] | undefined): Map<string, string> {
  return new Map((headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
}

function walkParts(part: GmailMessagePart | undefined, visitor: (part: GmailMessagePart) => void): void {
  if (!part) {
    return;
  }

  visitor(part);
  for (const child of part.parts ?? []) {
    walkParts(child, visitor);
  }
}

function extractBodies(payload: GmailMessagePart | undefined): { textBody: string; htmlBody?: string } {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];

  walkParts(payload, (part) => {
    if (part.mimeType === "text/plain") {
      textBodies.push(base64UrlDecode(part.body?.data));
    }

    if (part.mimeType === "text/html") {
      htmlBodies.push(base64UrlDecode(part.body?.data));
    }
  });

  if (!textBodies.length && payload?.body?.data && payload.mimeType?.startsWith("text/")) {
    textBodies.push(base64UrlDecode(payload.body.data));
  }

  return {
    textBody: textBodies.join("\n\n").trim(),
    htmlBody: htmlBodies.length ? htmlBodies.join("\n\n").trim() : undefined
  };
}

function normalizeAddressList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function quotedReply(detail: MessageDetail): string {
  const sentAt = detail.receivedAt || "an earlier message";
  const author = detail.from[0] ?? "the sender";
  const body = detail.textBody || detail.preview || "";
  const quoted = body
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .trim();

  return quoted ? `\n\nOn ${sentAt}, ${author} wrote:\n${quoted}` : "";
}

function headerValue(headers: Map<string, string>, name: string): string | undefined {
  return headers.get(name.toLowerCase());
}

function roleFromLabel(label: GmailLabel): string | undefined {
  switch (label.id) {
    case "INBOX":
      return "inbox";
    case "SENT":
      return "sent";
    case "DRAFT":
      return "drafts";
    case "TRASH":
      return "trash";
    case "SPAM":
      return "spam";
    default:
      return undefined;
  }
}

function displayNameForLabel(label: GmailLabel): string {
  switch (label.id) {
    case "INBOX":
      return "Inbox";
    case "SENT":
      return "Sent";
    case "DRAFT":
      return "Drafts";
    case "TRASH":
      return "Trash";
    case "SPAM":
      return "Spam";
    case "STARRED":
      return "Starred";
    case "IMPORTANT":
      return "Important";
    default:
      return label.name;
  }
}

function subjectForReply(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export class GoogleMailAdapter {
  private readonly client: GoogleApiClient;
  private labelsById?: Map<string, LabelInfo>;
  private labelsByName?: Map<string, LabelInfo>;

  constructor(
    private readonly account: AccountConfig,
    auth: OAuthAuthMaterial
  ) {
    this.client = new GoogleApiClient(account, auth);
  }

  private get gmailBaseUrl(): string {
    return this.account.google?.gmailBaseUrl ?? "https://gmail.googleapis.com/gmail/v1";
  }

  private async ensureLabels(): Promise<void> {
    if (this.labelsById && this.labelsByName) {
      return;
    }

    const response = await this.client.requestJson<{ labels?: GmailLabel[] }>(this.gmailBaseUrl, "users/me/labels");
    const labels = response.labels ?? [];
    this.labelsById = new Map();
    this.labelsByName = new Map();

    for (const label of labels) {
      const info: LabelInfo = {
        id: label.id,
        name: displayNameForLabel(label),
        role: roleFromLabel(label),
        system: label.type === "system"
      };
      this.labelsById.set(info.id, info);
      this.labelsByName.set(info.name.toLowerCase(), info);
    }

    const archive: LabelInfo = {
      id: PSEUDO_ARCHIVE_ID,
      name: "Archive",
      role: "archive",
      system: true
    };
    this.labelsById.set(archive.id, archive);
    this.labelsByName.set(archive.name.toLowerCase(), archive);
  }

  private async getLabelById(id: string): Promise<LabelInfo | undefined> {
    await this.ensureLabels();
    return this.labelsById?.get(id);
  }

  private async getLabelByName(name: string): Promise<LabelInfo | undefined> {
    await this.ensureLabels();
    return this.labelsByName?.get(name.toLowerCase());
  }

  async listMailboxes(): Promise<MailboxSummary[]> {
    await this.ensureLabels();
    return [...(this.labelsById?.values() ?? [])]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((label) => ({
        id: label.id,
        name: label.name,
        role: label.role
      }));
  }

  private async resolveMailbox(input: string): Promise<LabelInfo | undefined> {
    const byId = await this.getLabelById(input);
    if (byId) {
      return byId;
    }

    return await this.getLabelByName(input);
  }

  private async resolveMailboxRole(role: string): Promise<LabelInfo | undefined> {
    await this.ensureLabels();
    return [...(this.labelsById?.values() ?? [])].find((entry) => entry.role === role);
  }

  private formatDateFilter(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return undefined;
    }

    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${date.getUTCDate()}`.padStart(2, "0");
    return `${year}/${month}/${day}`;
  }

  private async buildSearch(input: MessageSearchInput): Promise<{ q?: string; labelIds?: string[] }> {
    const terms: string[] = [];
    const labelIds: string[] = [];

    if (input.text) {
      terms.push(input.text);
    }

    if (input.from) {
      terms.push(`from:${input.from}`);
    }

    if (input.subject) {
      terms.push(`subject:(${input.subject})`);
    }

    if (input.unread === true) {
      terms.push("is:unread");
    }

    if (input.since) {
      const formatted = this.formatDateFilter(input.since);
      if (formatted) {
        terms.push(`after:${formatted}`);
      }
    }

    if (input.until) {
      const formatted = this.formatDateFilter(input.until);
      if (formatted) {
        terms.push(`before:${formatted}`);
      }
    }

    if (input.mailbox) {
      const mailbox = await this.resolveMailbox(input.mailbox);
      if (mailbox?.id === PSEUDO_ARCHIVE_ID) {
        terms.push("-label:INBOX");
      } else if (mailbox) {
        labelIds.push(mailbox.id);
      }
    }

    if (input.mailboxRole) {
      const mailbox = await this.resolveMailboxRole(input.mailboxRole);
      if (mailbox?.id === PSEUDO_ARCHIVE_ID) {
        terms.push("-label:INBOX");
      } else if (mailbox) {
        labelIds.push(mailbox.id);
      }
    }

    return {
      q: terms.length ? terms.join(" ") : undefined,
      labelIds: labelIds.length ? [...new Set(labelIds)] : undefined
    };
  }

  private async getMessage(messageId: string): Promise<GmailMessage> {
    return await this.client.requestJson<GmailMessage>(this.gmailBaseUrl, `users/me/messages/${messageId}`, {
      query: {
        format: "full"
      }
    });
  }

  private async getThread(threadId: string): Promise<GmailThread> {
    return await this.client.requestJson<GmailThread>(this.gmailBaseUrl, `users/me/threads/${threadId}`, {
      query: {
        format: "full"
      }
    });
  }

  private async getPagedReferences(
    kind: "messages" | "threads",
    input: MessageSearchInput
  ): Promise<{ refs: GmailMessageRef[]; total: number }> {
    const targetPosition = input.position ?? 0;
    const limit = input.limit ?? 25;
    const { q, labelIds } = await this.buildSearch(input);

    let pageToken: string | undefined;
    let consumed = 0;
    let total = 0;

    while (true) {
      const payload = await this.client.requestJson<{
        messages?: GmailMessageRef[];
        threads?: GmailMessageRef[];
        nextPageToken?: string;
        resultSizeEstimate?: number;
      }>(this.gmailBaseUrl, `users/me/${kind}`, {
        query: {
          q,
          labelIds,
          maxResults: Math.min(limit, 100),
          pageToken
        }
      });

      total = payload.resultSizeEstimate ?? total;
      const refs = (kind === "threads" ? payload.threads : payload.messages) ?? [];

      if (consumed + refs.length > targetPosition || !payload.nextPageToken) {
        const start = Math.max(0, targetPosition - consumed);
        return {
          refs: refs.slice(start, start + limit),
          total
        };
      }

      consumed += refs.length;
      pageToken = payload.nextPageToken;
    }
  }

  private isMailingList(message: GmailMessage): boolean {
    const headers = toHeaderMap(message.payload?.headers);
    return headers.has("list-id") || headers.has("list-unsubscribe");
  }

  private async summarizeMessage(message: GmailMessage): Promise<MessageSummary> {
    await this.ensureLabels();
    const headers = toHeaderMap(message.payload?.headers);
    const labelNames = (message.labelIds ?? [])
      .map((labelId) => this.labelsById?.get(labelId)?.name ?? labelId)
      .filter(Boolean);

    const keywords: string[] = [];
    if (!(message.labelIds ?? []).includes("UNREAD")) {
      keywords.push("$seen");
    }
    if ((message.labelIds ?? []).includes("STARRED")) {
      keywords.push("$flagged");
    }
    for (const labelId of message.labelIds ?? []) {
      const info = this.labelsById?.get(labelId);
      if (info && !info.system) {
        keywords.push(`gmail/${info.name}`);
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      subject: headerValue(headers, "subject") ?? "",
      from: normalizeAddressList(headerValue(headers, "from")),
      to: normalizeAddressList(headerValue(headers, "to")),
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "",
      preview: message.snippet ?? "",
      keywords,
      mailboxNames: labelNames
    };
  }

  private async detailMessage(message: GmailMessage): Promise<MessageDetail> {
    const summary = await this.summarizeMessage(message);
    const headers = toHeaderMap(message.payload?.headers);
    const bodies = extractBodies(message.payload);

    return {
      ...summary,
      cc: normalizeAddressList(headerValue(headers, "cc")),
      bcc: normalizeAddressList(headerValue(headers, "bcc")),
      textBody: bodies.textBody,
      htmlBody: bodies.htmlBody,
      references: (headerValue(headers, "references") ?? "").split(/\s+/).filter(Boolean),
      replyTo: normalizeAddressList(headerValue(headers, "reply-to"))
    };
  }

  async searchMessages(input: MessageSearchInput): Promise<MessageSearchResult> {
    const collapseThreads = input.collapseThreads === true;
    const kind = collapseThreads ? "threads" : "messages";
    const { refs, total } = await this.getPagedReferences(kind, input);

    let messages: MessageSummary[];
    if (collapseThreads) {
      const threads = await Promise.all(refs.map(async (ref) => await this.getThread(ref.id)));
      const expanded = await Promise.all(
        threads.map(async (thread) => {
          const latest = [...(thread.messages ?? [])]
            .sort((left, right) => Number(left.internalDate ?? "0") - Number(right.internalDate ?? "0"))
            .at(-1);
          if (!latest) {
            return undefined;
          }

          if (input.excludeMailingLists && this.isMailingList(latest)) {
            return undefined;
          }

          return await this.summarizeMessage(latest);
        })
      );
      messages = expanded.filter((value): value is MessageSummary => Boolean(value));
    } else {
      const expanded = await Promise.all(refs.map(async (ref) => await this.getMessage(ref.id)));
      messages = (
        await Promise.all(
          expanded.map(async (message) => {
            if (input.excludeMailingLists && this.isMailingList(message)) {
              return undefined;
            }
            return await this.summarizeMessage(message);
          })
        )
      ).filter((value): value is MessageSummary => Boolean(value));
    }

    const position = input.position ?? 0;
    const limit = input.limit ?? 25;
    return {
      messages,
      total,
      position,
      limit,
      nextPosition: position + refs.length < total ? position + refs.length : undefined,
      collapseThreads
    };
  }

  async readMessageBatch(messageIds: string[]): Promise<MessageDetail[]> {
    const messages = await Promise.all(messageIds.map(async (messageId) => await this.getMessage(messageId)));
    const details = await Promise.all(messages.map(async (message) => await this.detailMessage(message)));
    return details.sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  }

  async readThread(threadId: string): Promise<MessageDetail[]> {
    const thread = await this.getThread(threadId);
    const details = await Promise.all((thread.messages ?? []).map(async (message) => await this.detailMessage(message)));
    return details.sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  }

  async composeMessage(draft: DraftMessage): Promise<DraftMessage> {
    return {
      ...draft,
      subject: draft.subject.trim(),
      to: draft.to.map((entry) => entry.trim()).filter(Boolean),
      cc: draft.cc?.map((entry) => entry.trim()).filter(Boolean),
      bcc: draft.bcc?.map((entry) => entry.trim()).filter(Boolean),
      textBody: draft.textBody.trim(),
      htmlBody: draft.htmlBody?.trim()
    };
  }

  async draftReply(messageId: string, instructions?: string): Promise<DraftMessage> {
    const [message] = await this.readMessageBatch([messageId]);
    if (!message) {
      throw new Error(`Unable to load Gmail message for reply draft: ${messageId}`);
    }
    const body = instructions?.trim() ? `${instructions.trim()}${quotedReply(message)}` : quotedReply(message).trimStart();
    return {
      subject: subjectForReply(message.subject),
      to: message.replyTo?.length ? message.replyTo : message.from,
      cc: [],
      textBody: body,
      inReplyTo: message.references.at(-1),
      references: message.references,
      threadId: message.threadId
    };
  }

  private async buildRawMessage(draft: DraftMessage): Promise<string> {
    const headers = [
      `To: ${draft.to.join(", ")}`,
      ...(draft.cc?.length ? [`Cc: ${draft.cc.join(", ")}`] : []),
      ...(draft.bcc?.length ? [`Bcc: ${draft.bcc.join(", ")}`] : []),
      `Subject: ${draft.subject}`,
      "MIME-Version: 1.0",
      ...(draft.inReplyTo ? [`In-Reply-To: ${draft.inReplyTo}`] : []),
      ...(draft.references?.length ? [`References: ${draft.references.join(" ")}`] : [])
    ];

    if (!draft.htmlBody) {
      return base64UrlEncode(
        [...headers, 'Content-Type: text/plain; charset="UTF-8"', "", draft.textBody].join("\r\n")
      );
    }

    const boundary = `mail-agent-${Math.random().toString(16).slice(2)}`;
    const mime = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      draft.textBody,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      draft.htmlBody,
      `--${boundary}--`
    ].join("\r\n");

    return base64UrlEncode(mime);
  }

  async sendMessage(draft: DraftMessage): Promise<{ id: string; threadId?: string }> {
    const raw = await this.buildRawMessage(draft);
    const payload = await this.client.requestJson<{ id: string; threadId?: string }>(this.gmailBaseUrl, "users/me/messages/send", {
      method: "POST",
      body: {
        raw,
        ...(draft.threadId ? { threadId: draft.threadId } : {})
      }
    });

    return {
      id: payload.id,
      threadId: payload.threadId
    };
  }

  private async ensureUserLabel(tag: string): Promise<string> {
    const desiredName = `mail-agent/${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const existing = await this.getLabelByName(desiredName);
    if (existing) {
      return existing.id;
    }

    const created = await this.client.requestJson<GmailLabel>(this.gmailBaseUrl, "users/me/labels", {
      method: "POST",
      body: {
        name: desiredName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show"
      }
    });

    this.labelsById?.set(created.id, {
      id: created.id,
      name: created.name,
      system: false
    });
    this.labelsByName?.set(created.name.toLowerCase(), {
      id: created.id,
      name: created.name,
      system: false
    });

    return created.id;
  }

  private async batchModify(messageIds: string[], addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
    await this.client.requestJson<void>(this.gmailBaseUrl, "users/me/messages/batchModify", {
      method: "POST",
      body: {
        ids: messageIds,
        addLabelIds,
        removeLabelIds
      }
    });
  }

  async archiveMessages(messageIds: string[]): Promise<{ archived: string[] }> {
    await this.batchModify(messageIds, [], ["INBOX"]);
    return { archived: messageIds };
  }

  async moveMessages(messageIds: string[], destinationMailbox: string): Promise<{ moved: string[] }> {
    const mailbox = await this.resolveMailbox(destinationMailbox);
    if (!mailbox) {
      throw new Error(`Unknown Gmail mailbox or label: ${destinationMailbox}`);
    }

    if (mailbox.id === PSEUDO_ARCHIVE_ID) {
      await this.batchModify(messageIds, [], ["INBOX"]);
      return { moved: messageIds };
    }

    const addLabelIds = [mailbox.id];
    const removeLabelIds = mailbox.role === "inbox" ? [] : ["INBOX"];
    await this.batchModify(messageIds, addLabelIds, removeLabelIds);
    return { moved: messageIds };
  }

  async tagMessages(messageIds: string[], tags: string[]): Promise<{ updated: string[]; tags: string[] }> {
    const labelIds = await Promise.all(tags.map(async (tag) => await this.ensureUserLabel(tag)));
    await this.batchModify(messageIds, labelIds, []);
    return { updated: messageIds, tags };
  }

  async markMessages(messageIds: string[], flags: Record<string, boolean>): Promise<{ updated: string[] }> {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    if (typeof flags.$seen === "boolean") {
      if (flags.$seen) {
        removeLabelIds.push("UNREAD");
      } else {
        addLabelIds.push("UNREAD");
      }
    }

    if (typeof flags.$flagged === "boolean") {
      if (flags.$flagged) {
        addLabelIds.push("STARRED");
      } else {
        removeLabelIds.push("STARRED");
      }
    }

    await this.batchModify(messageIds, addLabelIds, removeLabelIds);
    return { updated: messageIds };
  }

  async deleteMessages(messageIds: string[]): Promise<{ destroyed: string[] }> {
    await this.client.requestJson<void>(this.gmailBaseUrl, "users/me/messages/batchDelete", {
      method: "POST",
      body: {
        ids: messageIds
      }
    });
    return { destroyed: messageIds };
  }
}
