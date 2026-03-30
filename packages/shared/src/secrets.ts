import fs from "node:fs/promises";
import path from "node:path";
import { AuthError } from "./errors.js";
import { getRuntimeDir } from "./runtime.js";
import type { AuthMaterial } from "./types.js";

const SERVICE = "mail-agent";

export type SecretStore = {
  save(accountId: string, material: AuthMaterial): Promise<void>;
  load(accountId: string): Promise<AuthMaterial>;
  remove(accountId: string): Promise<void>;
};

class FileSecretStore implements SecretStore {
  private readonly secretFile = path.join(getRuntimeDir(), "secrets.json");

  private async readAll(): Promise<Record<string, AuthMaterial>> {
    try {
      const raw = await fs.readFile(this.secretFile, "utf8");
      return JSON.parse(raw) as Record<string, AuthMaterial>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  async save(accountId: string, material: AuthMaterial): Promise<void> {
    const current = await this.readAll();
    current[accountId] = material;
    await fs.mkdir(getRuntimeDir(), { recursive: true });
    await fs.writeFile(this.secretFile, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }

  async load(accountId: string): Promise<AuthMaterial> {
    const current = await this.readAll();
    const secret = current[accountId];

    if (!secret) {
      throw new AuthError(`No credentials stored for account: ${accountId}`);
    }

    return secret;
  }

  async remove(accountId: string): Promise<void> {
    const current = await this.readAll();
    delete current[accountId];
    await fs.writeFile(this.secretFile, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }
}

class KeytarSecretStore implements SecretStore {
  private async loadKeytar() {
    try {
      return await import("keytar");
    } catch (error) {
      throw new AuthError(`OS keychain backend is unavailable: ${(error as Error).message}`);
    }
  }

  async save(accountId: string, material: AuthMaterial): Promise<void> {
    const keytar = await this.loadKeytar();
    await keytar.setPassword(SERVICE, `${accountId}:username`, material.username);
    await keytar.setPassword(SERVICE, `${accountId}:token`, material.accessToken);
  }

  async load(accountId: string): Promise<AuthMaterial> {
    const keytar = await this.loadKeytar();
    const [username, accessToken] = await Promise.all([
      keytar.getPassword(SERVICE, `${accountId}:username`),
      keytar.getPassword(SERVICE, `${accountId}:token`)
    ]);

    if (!username || !accessToken) {
      throw new AuthError(`No credentials stored for account: ${accountId}`);
    }

    return { username, accessToken };
  }

  async remove(accountId: string): Promise<void> {
    const keytar = await this.loadKeytar();
    await Promise.all([
      keytar.deletePassword(SERVICE, `${accountId}:username`),
      keytar.deletePassword(SERVICE, `${accountId}:token`)
    ]);
  }
}

export function getSecretStore(): SecretStore {
  if (process.env.MAIL_AGENT_SECRET_BACKEND === "file" || process.env.CI === "true") {
    return new FileSecretStore();
  }

  return new KeytarSecretStore();
}
