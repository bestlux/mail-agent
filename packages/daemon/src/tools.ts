import { z } from "zod";
import {
  FileCache,
  assertMutationAllowed,
  assertSendAllowed,
  consumeDeleteConfirmation,
  getAccount,
  issueDeleteConfirmation,
  loadConfig,
  requiresDeleteConfirmation,
  type AccountConfig,
  type DraftMessage,
  type MessageSearchInput,
  type ToolResult
} from "@mail-agent/shared";
import { createProviderBundle } from "./providers/factory.js";

const cache = new FileCache();

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const toolSchemas = {
  accountOnly: z.object({
    accountId: z.string().min(1)
  }),
  searchMessages: z.object({
    accountId: z.string().min(1),
    text: z.string().optional(),
    mailbox: z.string().optional(),
    mailboxRole: z.string().min(1).optional(),
    from: z.string().optional(),
    subject: z.string().optional(),
    unread: z.boolean().optional(),
    excludeMailingLists: z.boolean().optional(),
    collapseThreads: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    limit: z.number().int().min(1).max(250).optional()
  }),
  listMailboxes: z.object({
    accountId: z.string().min(1)
  }),
  readMessageBatch: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1)
  }),
  readThread: z.object({
    accountId: z.string().min(1),
    threadId: z.string().min(1)
  }),
  composeMessage: z.object({
    accountId: z.string().min(1),
    draft: z.object({
      subject: z.string(),
      to: z.array(z.string()).min(1),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      textBody: z.string(),
      htmlBody: z.string().optional(),
      inReplyTo: z.string().optional(),
      references: z.array(z.string()).optional(),
      threadId: z.string().optional()
    })
  }),
  draftReply: z.object({
    accountId: z.string().min(1),
    messageId: z.string().min(1),
    instructions: z.string().optional()
  }),
  sendMessage: z.object({
    accountId: z.string().min(1),
    draft: z.object({
      subject: z.string(),
      to: z.array(z.string()).min(1),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      textBody: z.string(),
      htmlBody: z.string().optional(),
      inReplyTo: z.string().optional(),
      references: z.array(z.string()).optional(),
      threadId: z.string().optional()
    })
  }),
  archiveMessages: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1)
  }),
  moveMessages: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1),
    destinationMailbox: z.string().min(1)
  }),
  tagMessages: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1),
    tags: z.array(z.string()).min(1)
  }),
  markMessages: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1),
    flags: z.record(z.string(), z.boolean())
  }),
  deleteMessages: z.object({
    accountId: z.string().min(1),
    messageIds: z.array(z.string()).min(1),
    confirmationToken: z.string().optional()
  }),
  getEvents: z.object({
    accountId: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    calendarId: z.string().optional()
  }),
  searchContacts: z.object({
    accountId: z.string().min(1),
    query: z.string().min(1),
    addressBookId: z.string().optional()
  }),
  getContact: z.object({
    accountId: z.string().min(1),
    contactId: z.string().min(1)
  })
};

async function withBundle<T>(
  accountId: string,
  fn: (account: AccountConfig, bundle: Awaited<ReturnType<typeof createProviderBundle>>) => Promise<T>
): Promise<ToolResult<T>> {
  const account = await getAccount(accountId);
  const bundle = await createProviderBundle(account);
  const data = await fn(account, bundle);
  return {
    accountId: account.id,
    provider: account.provider,
    data
  };
}

function render(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function normalizeDateFilter(value: string | undefined, bound: "since" | "until"): string | undefined {
  if (!value) {
    return undefined;
  }

  if (isoDatePattern.test(value)) {
    return bound === "since" ? `${value}T00:00:00Z` : `${value}T23:59:59.999Z`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid ${bound} value: ${value}. Use RFC3339 or YYYY-MM-DD.`);
  }

  return parsed.toISOString();
}

function normalizeSearchInput(input: z.infer<typeof toolSchemas.searchMessages>): MessageSearchInput {
  return {
    text: input.text?.trim() || undefined,
    mailbox: input.mailbox?.trim() || undefined,
    mailboxRole: input.mailboxRole?.trim() || undefined,
    from: input.from?.trim() || undefined,
    subject: input.subject?.trim() || undefined,
    unread: input.unread,
    excludeMailingLists: input.excludeMailingLists,
    collapseThreads: input.collapseThreads,
    position: input.position,
    since: normalizeDateFilter(input.since, "since"),
    until: normalizeDateFilter(input.until, "until"),
    limit: input.limit
  };
}

async function cachedSearch(accountId: string, input: MessageSearchInput) {
  const account = await getAccount(accountId);
  const cacheKey = `search:${accountId}:${JSON.stringify(input)}`;
  const cached = await cache.read<ToolResult<unknown>>(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const result = await withBundle(accountId, async (_account, bundle) => await bundle.searchMessages!(input));
  await cache.write(cacheKey, result, account.cache.searchTtlMs);
  return result;
}

export const handlers = {
  async listAccounts() {
    const config = await loadConfig();
    return {
      content: [{ type: "text" as const, text: render(config.accounts) }],
      structuredContent: { accounts: config.accounts }
    };
  },
  async listMailboxes(args: z.infer<typeof toolSchemas.listMailboxes>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.listMailboxes!());
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async searchMessages(args: z.infer<typeof toolSchemas.searchMessages>) {
    const result = await cachedSearch(args.accountId, normalizeSearchInput(args));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async readMessageBatch(args: z.infer<typeof toolSchemas.readMessageBatch>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.readMessageBatch!(args.messageIds));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async readThread(args: z.infer<typeof toolSchemas.readThread>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.readThread!(args.threadId));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async composeMessage(args: z.infer<typeof toolSchemas.composeMessage>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.composeMessage!(args.draft as DraftMessage));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async draftReply(args: z.infer<typeof toolSchemas.draftReply>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.draftReply!(args.messageId, args.instructions));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async sendMessage(args: z.infer<typeof toolSchemas.sendMessage>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      assertSendAllowed(account);
      return await bundle.sendMessage!(args.draft as DraftMessage);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async archiveMessages(args: z.infer<typeof toolSchemas.archiveMessages>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      assertMutationAllowed(account);
      return await bundle.archiveMessages!(args.messageIds);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async moveMessages(args: z.infer<typeof toolSchemas.moveMessages>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      assertMutationAllowed(account);
      return await bundle.moveMessages!(args.messageIds, args.destinationMailbox);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async tagMessages(args: z.infer<typeof toolSchemas.tagMessages>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      assertMutationAllowed(account);
      return await bundle.tagMessages!(args.messageIds, args.tags);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async markMessages(args: z.infer<typeof toolSchemas.markMessages>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      assertMutationAllowed(account);
      return await bundle.markMessages!(args.messageIds, args.flags);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async deleteMessages(args: z.infer<typeof toolSchemas.deleteMessages>) {
    const result = await withBundle(args.accountId, async (account, bundle) => {
      if (requiresDeleteConfirmation(account)) {
        if (!args.confirmationToken) {
          const confirmation = await issueDeleteConfirmation(account.id, args.messageIds);
          return { confirmationRequired: true, confirmation };
        }

        await consumeDeleteConfirmation(args.confirmationToken, account.id, args.messageIds);
      }

      return await bundle.deleteMessages!(args.messageIds);
    });
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async listCalendars(args: z.infer<typeof toolSchemas.accountOnly>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.listCalendars!());
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async getEvents(args: z.infer<typeof toolSchemas.getEvents>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.getEvents!({
      start: args.start,
      end: args.end,
      calendarId: args.calendarId
    }));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async searchContacts(args: z.infer<typeof toolSchemas.searchContacts>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.searchContacts!({
      query: args.query,
      addressBookId: args.addressBookId
    }));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  },
  async getContact(args: z.infer<typeof toolSchemas.getContact>) {
    const result = await withBundle(args.accountId, async (_account, bundle) => await bundle.getContact!(args.contactId));
    return {
      content: [{ type: "text" as const, text: render(result) }],
      structuredContent: result
    };
  }
};
