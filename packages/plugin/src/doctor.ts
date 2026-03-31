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
    secretStatus: "ok" | "missing";
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
      } catch {
        return {
          id: account.id,
          provider: account.provider,
          emailAddress: account.emailAddress,
          secretStatus: "missing" as const
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
