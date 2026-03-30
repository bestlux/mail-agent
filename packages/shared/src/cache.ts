import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getRuntimeDir } from "./runtime.js";

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

export class FileCache {
  private readonly root = path.join(getRuntimeDir(), "cache");

  private getPath(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return path.join(this.root, `${digest}.json`);
  }

  async read<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await fs.readFile(this.getPath(key), "utf8");
      const parsed = JSON.parse(raw) as CachedValue<T>;
      if (parsed.expiresAt < Date.now()) {
        return undefined;
      }
      return parsed.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async write<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const payload: CachedValue<T> = {
      expiresAt: Date.now() + ttlMs,
      value
    };
    await fs.writeFile(this.getPath(key), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  async clear(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }
}
