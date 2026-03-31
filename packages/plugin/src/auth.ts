import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { upsertAccount, getSecretStore, removeAccount, type AccountConfig } from "@iomancer/mail-agent-shared";
import { runLoopbackOAuth } from "./oauth.js";

type FastmailAuthOptions = {
  accountId: string;
  email?: string;
  displayName?: string;
  jmapToken?: string;
  appPassword?: string;
  username?: string;
};

type GoogleAuthOptions = {
  accountId: string;
  email?: string;
  displayName?: string;
  clientId?: string;
  clientSecret?: string;
  redirectHost?: string;
  redirectPort?: number;
  fullGmailAccess?: boolean;
  openBrowser?: boolean;
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
  const jmapToken = options.jmapToken ?? (await prompt("Fastmail JMAP API token: "));
  const appPassword = options.appPassword ?? (await prompt("Fastmail app password for CalDAV/CardDAV: "));
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
    kind: "fastmail-basic",
    username,
    jmapAccessToken: jmapToken,
    davPassword: appPassword
  });
  return account;
}

export async function authGoogle(options: GoogleAuthOptions): Promise<AccountConfig> {
  const clientId = options.clientId ?? (await prompt("Google OAuth client ID: "));
  const clientSecretInput =
    options.clientSecret ?? (await prompt("Google OAuth client secret (press Enter to skip for desktop apps): "));
  const clientSecret = clientSecretInput.trim() || undefined;

  const redirectHost = options.redirectHost ?? "127.0.0.1";
  const redirectPort = options.redirectPort;
  const scopes = [
    options.fullGmailAccess ? "https://mail.google.com/" : "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/contacts.readonly"
  ];

  console.log(
    JSON.stringify(
      {
        provider: "google-workspace",
        accountId: options.accountId,
        emailHint: options.email,
        redirectHost,
        redirectPort: redirectPort ?? "auto",
        openBrowser: options.openBrowser !== false,
        fullGmailAccess: options.fullGmailAccess === true,
        scopes
      },
      null,
      2
    )
  );
  console.log("Google app requirements: External user type, Testing audience, your Gmail added as a test user, Desktop app OAuth client.\n");

  const tokenSet = await runLoopbackOAuth({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId,
    clientSecret,
    scopes,
    redirectHost,
    redirectPort,
    loginHint: options.email,
    openBrowser: options.openBrowser
  });

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      authorization: `Bearer ${tokenSet.accessToken}`
    }
  });

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    throw new Error(`Unable to fetch Gmail profile after OAuth auth: ${profileResponse.status} ${errorText}`);
  }

  const profile = (await profileResponse.json()) as { emailAddress: string };
  const email = options.email ?? profile.emailAddress;
  const displayName = options.displayName ?? options.accountId;

  const account: AccountConfig = {
    id: options.accountId,
    provider: "google-workspace",
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
    google: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      gmailBaseUrl: "https://gmail.googleapis.com/gmail/v1",
      calendarBaseUrl: "https://www.googleapis.com/calendar/v3",
      peopleBaseUrl: "https://people.googleapis.com/v1",
      redirectHost,
      redirectPort,
      scopes
    }
  };

  await upsertAccount(account);
  await getSecretStore().save(account.id, {
    kind: "oauth",
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    expiresAt: tokenSet.expiresAt,
    scopes: tokenSet.scopes,
    tokenType: tokenSet.tokenType,
    clientId,
    clientSecret,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    redirectUri: tokenSet.redirectUri,
    accountHint: email
  });

  return account;
}

export async function logoutAccount(accountId: string): Promise<void> {
  await getSecretStore().remove(accountId);
  await removeAccount(accountId);
}
