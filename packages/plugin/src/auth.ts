import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { upsertAccount, getSecretStore, removeAccount, type AccountConfig } from "@mail-agent/shared";

type FastmailAuthOptions = {
  accountId: string;
  email?: string;
  displayName?: string;
  token?: string;
  username?: string;
};

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function authFastmail(options: FastmailAuthOptions): Promise<AccountConfig> {
  const email = options.email ?? (await prompt("Fastmail email address: "));
  const username = options.username ?? email;
  const token = options.token ?? (await prompt("Fastmail API token or app password: "));
  const displayName = options.displayName ?? options.accountId;

  const account: AccountConfig = {
    id: options.accountId,
    provider: "fastmail",
    displayName,
    emailAddress: email,
    capabilities: ["mail-read", "mail-write", "calendar-read", "contacts-read"],
    trustMode: "trusted-automation",
    automationPolicy: {
      allowSend: true,
      allowMutations: true,
      allowDelete: false
    },
    cache: {
      searchTtlMs: 60_000,
      threadTtlMs: 60_000,
      eventTtlMs: 60_000,
      contactTtlMs: 60_000
    },
    fastmail: {
      apiBaseUrl: "https://api.fastmail.com",
      jmapSessionUrl: "https://api.fastmail.com/jmap/session",
      caldavUrl: "https://caldav.fastmail.com",
      carddavUrl: "https://carddav.fastmail.com"
    }
  };

  await upsertAccount(account);
  await getSecretStore().save(account.id, {
    username,
    accessToken: token
  });
  return account;
}

export async function logoutAccount(accountId: string): Promise<void> {
  await getSecretStore().remove(accountId);
  await removeAccount(accountId);
}
