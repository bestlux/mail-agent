import { loadConfig, getConfigPath, getRuntimeDir } from "@mail-agent/shared";

export async function runDoctor(): Promise<{
  nodeVersion: string;
  runtimeDir: string;
  configPath: string;
  accounts: number;
  secretBackend: string;
}> {
  const config = await loadConfig();
  return {
    nodeVersion: process.version,
    runtimeDir: getRuntimeDir(),
    configPath: getConfigPath(),
    accounts: config.accounts.length,
    secretBackend: process.env.MAIL_AGENT_SECRET_BACKEND ?? "keytar"
  };
}
