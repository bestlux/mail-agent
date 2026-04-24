import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handlers, toolSchemas } from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mail-agent",
    version: "0.1.0"
  });

  server.registerTool("list_accounts", {
    title: "List accounts",
    description: "List configured mail-agent accounts."
  }, handlers.listAccounts as never);

  server.registerTool("list_mailboxes", {
    title: "List mailboxes",
    description: "List available mailboxes with ids, names, and roles for the account.",
    inputSchema: toolSchemas.listMailboxes.shape
  }, handlers.listMailboxes as never);

  server.registerTool("search_messages", {
    title: "Search messages",
    description: "Search provider-backed mail with pagination, thread collapsing, mailbox filters, and date filters.",
    inputSchema: toolSchemas.searchMessages.shape
  }, handlers.searchMessages as never);

  server.registerTool("read_message_batch", {
    title: "Read message batch",
    description: "Fetch message details for a batch. Defaults are agent-safe: text body only, capped at 8000 characters, with HTML omitted. Use bodyMode \"metadata\" for headers only, or bodyMode \"full\" with includeHtml true and maxBodyChars when full/html body content is needed.",
    inputSchema: toolSchemas.readMessageBatch.shape
  }, handlers.readMessageBatch as never);

  server.registerTool("read_thread", {
    title: "Read thread",
    description: "Fetch all messages from a thread. Defaults are agent-safe: text body only, capped at 8000 characters, with HTML omitted. Use bodyMode \"metadata\" for headers only, or bodyMode \"full\" with includeHtml true and maxBodyChars when full/html body content is needed.",
    inputSchema: toolSchemas.readThread.shape
  }, handlers.readThread as never);

  server.registerTool("compose_message", {
    title: "Compose message",
    description: "Normalize a draft message before send.",
    inputSchema: toolSchemas.composeMessage.shape
  }, handlers.composeMessage as never);

  server.registerTool("draft_reply", {
    title: "Draft reply",
    description: "Prepare a reply envelope and quoted context from an existing message. Optional instructions are used as draft body text above the quote; this tool does not generate reply prose.",
    inputSchema: toolSchemas.draftReply.shape
  }, handlers.draftReply as never);

  server.registerTool("send_message", {
    title: "Send message",
    description: "Send a composed or reply draft through the configured provider.",
    inputSchema: toolSchemas.sendMessage.shape
  }, handlers.sendMessage as never);

  server.registerTool("archive_messages", {
    title: "Archive messages",
    description: "Archive messages by removing them from the inbox mailbox.",
    inputSchema: toolSchemas.archiveMessages.shape
  }, handlers.archiveMessages as never);

  server.registerTool("move_messages", {
    title: "Move messages",
    description: "Move messages into a target mailbox id.",
    inputSchema: toolSchemas.moveMessages.shape
  }, handlers.moveMessages as never);

  server.registerTool("tag_messages", {
    title: "Tag messages",
    description: "Apply mail-agent keyword tags to messages.",
    inputSchema: toolSchemas.tagMessages.shape
  }, handlers.tagMessages as never);

  server.registerTool("mark_messages", {
    title: "Mark messages",
    description: "Toggle message keyword flags such as $seen or $flagged.",
    inputSchema: toolSchemas.markMessages.shape
  }, handlers.markMessages as never);

  server.registerTool("delete_messages", {
    title: "Delete messages",
    description: "Delete messages. This always requires a confirmation token in trusted mode.",
    inputSchema: toolSchemas.deleteMessages.shape
  }, handlers.deleteMessages as never);

  server.registerTool("list_calendars", {
    title: "List calendars",
    description: "List calendars for the configured account.",
    inputSchema: toolSchemas.accountOnly.shape
  }, handlers.listCalendars as never);

  server.registerTool("get_events", {
    title: "Get events",
    description: "Read calendar events inside a time range.",
    inputSchema: toolSchemas.getEvents.shape
  }, handlers.getEvents as never);

  server.registerTool("search_contacts", {
    title: "Search contacts",
    description: "Search contacts for the configured account.",
    inputSchema: toolSchemas.searchContacts.shape
  }, handlers.searchContacts as never);

  server.registerTool("get_contact", {
    title: "Get contact",
    description: "Fetch a specific contact or best matching contact.",
    inputSchema: toolSchemas.getContact.shape
  }, handlers.getContact as never);

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
