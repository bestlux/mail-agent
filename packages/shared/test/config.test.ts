import { describe, expect, it } from "vitest";
import { accountConfigSchema, configFileSchema } from "../src/types.js";
import { requiresDeleteConfirmation } from "../src/policy.js";

describe("config schema", () => {
  it("hydrates defaults for automation and cache", () => {
    const account = accountConfigSchema.parse({
      id: "personal",
      provider: "fastmail",
      displayName: "Personal",
      emailAddress: "user@example.com",
      capabilities: ["mail-read", "mail-write"]
    });

    expect(account.automationPolicy.allowDelete).toBe(false);
    expect(account.cache.searchTtlMs).toBeGreaterThan(0);
    expect(requiresDeleteConfirmation(account)).toBe(true);
  });

  it("parses a full config file", () => {
    const config = configFileSchema.parse({
      version: 1,
      accounts: [
        {
          id: "personal",
          provider: "fastmail",
          displayName: "Personal",
          emailAddress: "user@example.com",
          capabilities: ["mail-read", "mail-write", "calendar-read", "contacts-read"]
        }
      ]
    });

    expect(config.accounts).toHaveLength(1);
  });
});
