#!/usr/bin/env node
import { Command } from "commander";
import { runServer } from "@mail-agent/daemon";
import { authFastmail, authGoogle, logoutAccount } from "../auth.js";
import { runDoctor } from "../doctor.js";
import { installPluginBundle } from "../installer.js";

const program = new Command();
program
  .name("mail-agent")
  .description("Provider-native Codex plugin bundle for agent workflows.")
  .version("0.1.0");

program
  .command("daemon")
  .description("Run the local mail-agent MCP daemon over stdio.")
  .action(async () => {
    await runServer();
  });

program
  .command("install")
  .description("Install the plugin bundle into the local Codex marketplace.")
  .action(async () => {
    const result = await installPluginBundle();
    console.log(JSON.stringify(result, null, 2));
  });

const auth = program.command("auth").description("Authenticate a provider.");
auth
  .command("fastmail")
  .description("Store Fastmail credentials and create an account profile.")
  .requiredOption("--account <id>", "Account id")
  .option("--email <email>", "Fastmail email address")
  .option("--username <username>", "Username for CalDAV/CardDAV basic auth; defaults to email")
  .option("--jmap-token <token>", "Fastmail JMAP API token")
  .option("--app-password <password>", "Fastmail app password for CalDAV/CardDAV")
  .option("--name <displayName>", "Display name")
  .action(async (options: { account: string; email?: string; username?: string; jmapToken?: string; appPassword?: string; name?: string }) => {
    const account = await authFastmail({
      accountId: options.account,
      email: options.email,
      username: options.username,
      jmapToken: options.jmapToken,
      appPassword: options.appPassword,
      displayName: options.name
    });
    console.log(JSON.stringify(account, null, 2));
  });

auth
  .command("google")
  .description("Authenticate Google mail, calendar, and contacts through OAuth.")
  .requiredOption("--account <id>", "Account id")
  .option("--email <email>", "Email hint for the Google account chooser")
  .option("--client-id <clientId>", "Google OAuth desktop client id")
  .option("--client-secret <clientSecret>", "Google OAuth desktop client secret")
  .option("--redirect-host <host>", "Loopback host to bind during OAuth", "127.0.0.1")
  .option("--redirect-port <port>", "Loopback port to bind during OAuth", (value) => Number.parseInt(value, 10))
  .option("--full-gmail-access", "Request the broader Gmail scope required for permanent delete support", false)
  .option("--name <displayName>", "Display name")
  .action(async (options: {
    account: string;
    email?: string;
    clientId?: string;
    clientSecret?: string;
    redirectHost?: string;
    redirectPort?: number;
    fullGmailAccess?: boolean;
    name?: string;
  }) => {
    const account = await authGoogle({
      accountId: options.account,
      email: options.email,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      redirectHost: options.redirectHost,
      redirectPort: options.redirectPort,
      fullGmailAccess: options.fullGmailAccess,
      displayName: options.name
    });
    console.log(JSON.stringify(account, null, 2));
  });

program
  .command("doctor")
  .description("Report runtime health and config paths.")
  .action(async () => {
    console.log(JSON.stringify(await runDoctor(), null, 2));
  });

program
  .command("logout")
  .description("Remove a configured account and its stored credentials.")
  .argument("<accountId>", "Account id")
  .action(async (accountId: string) => {
    await logoutAccount(accountId);
    console.log(JSON.stringify({ removed: accountId }, null, 2));
  });

void program.parseAsync(process.argv);
