import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMarketplaceRoot, getPluginInstallRoot } from "@mail-agent/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const bundleEntries = [
  ".codex-plugin",
  ".mcp.json",
  "assets",
  "dist",
  "README.md",
  "skills"
] as const;

type Marketplace = {
  name: string;
  interface?: {
    displayName?: string;
  };
  plugins: Array<{
    name: string;
    source: {
      source: "local";
      path: string;
    };
    policy: {
      installation: "AVAILABLE";
      authentication: "ON_INSTALL";
    };
    category: string;
  }>;
};

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function readMarketplace(filePath: string): Promise<Marketplace> {
  if (!(await exists(filePath))) {
    return {
      name: "local-plugins",
      interface: {
        displayName: "Local Plugins"
      },
      plugins: []
    };
  }

  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as Marketplace;
}

export async function installPluginBundle(): Promise<{ pluginPath: string; marketplacePath: string }> {
  const pluginRoot = getPluginInstallRoot();
  const target = path.join(pluginRoot, "mail-agent");
  const marketplacePath = path.join(getMarketplaceRoot(), "plugins", "marketplace.json");

  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  for (const entry of bundleEntries) {
    const source = path.join(packageRoot, entry);
    const destination = path.join(target, entry);
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
      await copyTree(source, destination);
    } else {
      await fs.copyFile(source, destination);
    }
  }
  await fs.mkdir(path.dirname(marketplacePath), { recursive: true });

  const marketplace = await readMarketplace(marketplacePath);
  const nextEntry = {
    name: "mail-agent",
    source: {
      source: "local" as const,
      path: "./plugins/mail-agent"
    },
    policy: {
      installation: "AVAILABLE" as const,
      authentication: "ON_INSTALL" as const
    },
    category: "Productivity"
  };

  marketplace.plugins = marketplace.plugins.filter((entry) => entry.name !== "mail-agent");
  marketplace.plugins.push(nextEntry);

  await fs.writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
  return { pluginPath: target, marketplacePath };
}
