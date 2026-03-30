import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ConfigError } from "./errors.js";
import { getRuntimeDir } from "./runtime.js";
import { accountConfigSchema, configFileSchema, type AccountConfig, type ConfigFile } from "./types.js";

const accountUpdateSchema = accountConfigSchema.partial().extend({
  id: z.string().min(1)
});

export function getConfigPath(): string {
  return path.join(getRuntimeDir(), "config.json");
}

export async function ensureRuntimeDirs(): Promise<void> {
  await fs.mkdir(getRuntimeDir(), { recursive: true });
  await fs.mkdir(path.join(getRuntimeDir(), "cache"), { recursive: true });
}

export async function loadConfig(): Promise<ConfigFile> {
  await ensureRuntimeDirs();
  const configPath = getConfigPath();

  try {
    const raw = await fs.readFile(configPath, "utf8");
    return configFileSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, accounts: [] };
    }

    if (error instanceof Error) {
      throw new ConfigError(`Unable to read config: ${error.message}`);
    }

    throw error;
  }
}

export async function saveConfig(config: ConfigFile): Promise<void> {
  await ensureRuntimeDirs();
  const configPath = getConfigPath();
  await fs.writeFile(configPath, `${JSON.stringify(configFileSchema.parse(config), null, 2)}\n`, "utf8");
}

export async function upsertAccount(account: AccountConfig): Promise<AccountConfig> {
  const config = await loadConfig();
  const next = config.accounts.filter((entry) => entry.id !== account.id);
  next.push(accountConfigSchema.parse(account));
  await saveConfig({ version: 1, accounts: next });
  return account;
}

export async function patchAccount(update: z.input<typeof accountUpdateSchema>): Promise<AccountConfig> {
  const parsed = accountUpdateSchema.parse(update);
  const config = await loadConfig();
  const existing = config.accounts.find((account) => account.id === parsed.id);

  if (!existing) {
    throw new ConfigError(`Unknown account: ${parsed.id}`);
  }

  const merged = accountConfigSchema.parse({
    ...existing,
    ...parsed,
    fastmail: parsed.fastmail ? { ...existing.fastmail, ...parsed.fastmail } : existing.fastmail,
    automationPolicy: parsed.automationPolicy ? { ...existing.automationPolicy, ...parsed.automationPolicy } : existing.automationPolicy,
    cache: parsed.cache ? { ...existing.cache, ...parsed.cache } : existing.cache
  });

  const remaining = config.accounts.filter((account) => account.id !== parsed.id);
  remaining.push(merged);
  await saveConfig({ version: 1, accounts: remaining });
  return merged;
}

export async function removeAccount(accountId: string): Promise<void> {
  const config = await loadConfig();
  await saveConfig({
    version: 1,
    accounts: config.accounts.filter((account) => account.id !== accountId)
  });
}

export async function getAccount(accountId: string): Promise<AccountConfig> {
  const config = await loadConfig();
  const account = config.accounts.find((entry) => entry.id === accountId);

  if (!account) {
    throw new ConfigError(`Unknown account: ${accountId}`);
  }

  return account;
}
