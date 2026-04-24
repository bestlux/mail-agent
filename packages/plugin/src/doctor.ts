import { getConfigPath, getRuntimeDir, getSecretStore, isOAuthAuthMaterial, loadConfig } from "@iomancer/mail-agent-shared";

export async function runDoctor(): Promise<{
  nodeVersion: string;
  runtimeDir: string;
  configPath: string;
  accounts: number;
  secretBackend: string;
  accountStatus: Array<{
    id: string;
    provider: string;
    emailAddress: string;
    secretStatus: "ok" | "missing" | "error";
    repairCommand?: string;
    secretError?: string;
    deleteSupported?: boolean;
    scopeSummary?: string[];
  }>;
}> {
  const config = await loadConfig();
  const store = getSecretStore();
  const accountStatus = await Promise.all(
    config.accounts.map(async (account) => {
      try {
        const auth = await store.load(account.id);
        if (isOAuthAuthMaterial(auth)) {
          return {
            id: account.id,
            provider: account.provider,
            emailAddress: account.emailAddress,
            secretStatus: "ok" as const,
            deleteSupported: auth.scopes.includes("https://mail.google.com/"),
            scopeSummary: auth.scopes
          };
        }

        return {
          id: account.id,
          provider: account.provider,
          emailAddress: account.emailAddress,
          secretStatus: "ok" as const,
          deleteSupported: account.provider !== "fastmail" ? undefined : true
        };
      } catch (error) {
        if (isMissingCredentialsError(error)) {
          return {
            id: account.id,
            provider: account.provider,
            emailAddress: account.emailAddress,
            secretStatus: "missing" as const,
            repairCommand: repairCommandForAccount(account)
          };
        }

        return {
          id: account.id,
          provider: account.provider,
          emailAddress: account.emailAddress,
          secretStatus: "error" as const,
          secretError: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  return {
    nodeVersion: process.version,
    runtimeDir: getRuntimeDir(),
    configPath: getConfigPath(),
    accounts: config.accounts.length,
    secretBackend: process.env.MAIL_AGENT_SECRET_BACKEND ?? "keytar",
    accountStatus
  };
}

function isMissingCredentialsError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("No credentials stored for account:");
}

function repairCommandForAccount(account: Awaited<ReturnType<typeof loadConfig>>["accounts"][number]): string {
  switch (account.provider) {
    case "google-workspace":
      return `mail-agent auth google --account ${account.id} --email ${account.emailAddress} --client-id <client-id>`;
    case "fastmail":
      return `mail-agent auth fastmail --account ${account.id} --email ${account.emailAddress}`;
    default:
      return "mail-agent doctor";
  }
}
