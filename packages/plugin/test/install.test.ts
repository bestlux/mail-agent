import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempHome = path.join(os.tmpdir(), "mail-agent-install-test");
vi.mock("@iomancer/mail-agent-shared", async () => {
  const actual = await vi.importActual<typeof import("@iomancer/mail-agent-shared")>("@iomancer/mail-agent-shared");
  return {
    ...actual,
    getMarketplaceRoot: () => path.join(tempHome, ".agents"),
    getPluginInstallRoot: () => path.join(tempHome, "plugins")
  };
});

const { installPluginBundle } = await import("../src/installer.js");

describe("installPluginBundle", () => {
  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("writes the plugin bundle and marketplace entry", async () => {
    const result = await installPluginBundle();
    const raw = await fs.readFile(result.marketplacePath, "utf8");
    const marketplace = JSON.parse(raw) as { plugins: Array<{ name: string }> };

    expect(marketplace.plugins.some((entry) => entry.name === "mail-agent")).toBe(true);
    await expect(fs.stat(result.pluginPath)).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.pluginPath, "node_modules", "commander", "package.json"))).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.pluginPath, "node_modules", "@iomancer", "mail-agent-daemon", "package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.pluginPath, "node_modules", "@modelcontextprotocol", "sdk", "package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(
        path.join(result.pluginPath, "node_modules", "keytar", "package.json")
      )
    ).resolves.toBeTruthy();
  }, 20000);
});
