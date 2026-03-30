import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ConfirmationRequiredError, ConfigError } from "./errors.js";
import { getRuntimeDir } from "./runtime.js";
import type { DeleteConfirmation } from "./types.js";

const confirmationsPath = path.join(getRuntimeDir(), "delete-confirmations.json");

async function readAll(): Promise<DeleteConfirmation[]> {
  try {
    const raw = await fs.readFile(confirmationsPath, "utf8");
    return JSON.parse(raw) as DeleteConfirmation[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeAll(entries: DeleteConfirmation[]): Promise<void> {
  await fs.mkdir(getRuntimeDir(), { recursive: true });
  await fs.writeFile(confirmationsPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export async function issueDeleteConfirmation(accountId: string, messageIds: string[], ttlMs = 10 * 60 * 1000): Promise<DeleteConfirmation> {
  const pending = await readAll();
  const next: DeleteConfirmation = {
    token: randomUUID(),
    accountId,
    messageIds,
    expiresAt: new Date(Date.now() + ttlMs).toISOString()
  };
  pending.push(next);
  await writeAll(pending);
  return next;
}

export async function consumeDeleteConfirmation(token: string, accountId: string, messageIds: string[]): Promise<DeleteConfirmation> {
  const pending = await readAll();
  const match = pending.find((entry) => entry.token === token);

  if (!match) {
    throw new ConfirmationRequiredError("Delete confirmation token is missing or invalid.");
  }

  if (match.accountId !== accountId) {
    throw new ConfigError("Delete confirmation token does not match the requested account.");
  }

  if (new Date(match.expiresAt).getTime() < Date.now()) {
    throw new ConfirmationRequiredError("Delete confirmation token has expired.");
  }

  if (match.messageIds.join(",") !== messageIds.join(",")) {
    throw new ConfigError("Delete confirmation token does not match the requested messages.");
  }

  await writeAll(pending.filter((entry) => entry.token !== token));
  return match;
}
