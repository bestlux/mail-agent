import fs from "node:fs/promises";
import path from "node:path";
import { AuthError } from "./errors.js";
import { getRuntimeDir } from "./runtime.js";
import type { AuthMaterial, FastmailAuthMaterial, OAuthAuthMaterial } from "./types.js";

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
    const secret = current[accountId] as AuthMaterial | ({ username: string; accessToken: string } & Partial<AuthMaterial>) | undefined;

    if (!secret) {
      throw new AuthError(`No credentials stored for account: ${accountId}`);
    }

    if ("kind" in secret && secret.kind === "oauth" && typeof secret.accessToken === "string" && typeof secret.refreshToken === "string") {
      return secret as OAuthAuthMaterial;
    }

    if ("kind" in secret && secret.kind === "fastmail-basic" && typeof secret.jmapAccessToken === "string" && typeof secret.davPassword === "string") {
      return secret as FastmailAuthMaterial;
    }

    if ("accessToken" in secret) {
      const username = "username" in secret && typeof secret.username === "string" ? secret.username : accountId;
      return {
        kind: "fastmail-basic",
        username,
        jmapAccessToken: secret.accessToken,
        davPassword: secret.accessToken
      } satisfies FastmailAuthMaterial;
    }

    throw new AuthError(`Stored credentials for account ${accountId} are incomplete.`);
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
    await keytar.setPassword(SERVICE, `${accountId}:json`, JSON.stringify(material));

    if (material.kind === "fastmail-basic") {
      await keytar.setPassword(SERVICE, `${accountId}:username`, material.username);
      await keytar.setPassword(SERVICE, `${accountId}:jmap-token`, material.jmapAccessToken);
      await keytar.setPassword(SERVICE, `${accountId}:dav-password`, material.davPassword);
      return;
    }

    await Promise.all([
      keytar.deletePassword(SERVICE, `${accountId}:username`),
      keytar.deletePassword(SERVICE, `${accountId}:jmap-token`),
      keytar.deletePassword(SERVICE, `${accountId}:dav-password`),
      keytar.deletePassword(SERVICE, `${accountId}:token`)
    ]);
  }

  async load(accountId: string): Promise<AuthMaterial> {
    const keytar = await this.loadKeytar();
    const [jsonBlob, username, jmapAccessToken, davPassword, legacyToken] = await Promise.all([
      keytar.getPassword(SERVICE, `${accountId}:json`),
      keytar.getPassword(SERVICE, `${accountId}:username`),
      keytar.getPassword(SERVICE, `${accountId}:jmap-token`),
      keytar.getPassword(SERVICE, `${accountId}:dav-password`),
      keytar.getPassword(SERVICE, `${accountId}:token`)
    ]);

    if (jsonBlob) {
      const parsed = JSON.parse(jsonBlob) as AuthMaterial;
      if (parsed.kind === "oauth" || parsed.kind === "fastmail-basic") {
        return parsed;
      }
    }

    const resolvedJmap = jmapAccessToken ?? legacyToken;
    const resolvedDav = davPassword ?? legacyToken;

    if (!username || !resolvedJmap || !resolvedDav) {
      throw new AuthError(`No credentials stored for account: ${accountId}`);
    }

    return {
      kind: "fastmail-basic",
      username,
      jmapAccessToken: resolvedJmap,
      davPassword: resolvedDav
    } satisfies FastmailAuthMaterial;
  }

  async remove(accountId: string): Promise<void> {
    const keytar = await this.loadKeytar();
    await Promise.all([
      keytar.deletePassword(SERVICE, `${accountId}:json`),
      keytar.deletePassword(SERVICE, `${accountId}:username`),
      keytar.deletePassword(SERVICE, `${accountId}:jmap-token`),
      keytar.deletePassword(SERVICE, `${accountId}:dav-password`),
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
