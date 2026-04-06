import fs from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMarketplaceRoot, getPluginInstallRoot } from "@iomancer/mail-agent-shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const bundleEntries = [
  ".codex-plugin",
  ".mcp.json",
  "assets",
  "dist",
  "package.json",
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

type PackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
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
  await fs.cp(source, target, { recursive: true, force: true, dereference: true });
}

async function copyPackageDirectory(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    await copyTree(sourcePath, targetPath);
  }
}

async function readPackageManifest(packageDir: string): Promise<PackageManifest> {
  const raw = await fs.readFile(path.join(packageDir, "package.json"), "utf8");
  return JSON.parse(raw) as PackageManifest;
}

function getRuntimeDependencyNames(manifest: PackageManifest): string[] {
  return [...new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ])];
}

function isBuiltinDependency(packageName: string): boolean {
  const normalized = packageName.startsWith("node:") ? packageName.slice(5) : packageName;
  return builtinModules.includes(packageName) || builtinModules.includes(normalized);
}

async function resolveInstalledPackageDir(sourcePackageDir: string, packageName: string): Promise<string> {
  const manifestPath = await fs.realpath(path.join(sourcePackageDir, "package.json"));
  const packageRequire = createRequire(manifestPath);
  const searchRoots = packageRequire.resolve.paths(packageName) ?? [];

  for (const searchRoot of searchRoots) {
    const candidate = path.join(searchRoot, ...packageName.split("/"));
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate installed dependency "${packageName}" from "${sourcePackageDir}"`);
}

async function copyRuntimeDependencyGraph(
  sourcePackageDir: string,
  targetPackageDir: string,
  seen = new Set<string>()
): Promise<void> {
  const manifest = await readPackageManifest(sourcePackageDir);

  for (const dependencyName of getRuntimeDependencyNames(manifest)) {
    if (isBuiltinDependency(dependencyName)) {
      continue;
    }

    const sourceDependencyDir = await resolveInstalledPackageDir(sourcePackageDir, dependencyName);
    const targetDependencyDir = path.join(targetPackageDir, "node_modules", ...dependencyName.split("/"));
    const cycleKey = `${await fs.realpath(sourceDependencyDir)}=>${targetDependencyDir}`;

    if (seen.has(cycleKey)) {
      continue;
    }

    seen.add(cycleKey);
    await copyPackageDirectory(sourceDependencyDir, targetDependencyDir);
    await copyRuntimeDependencyGraph(sourceDependencyDir, targetDependencyDir, seen);
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
  await copyRuntimeDependencyGraph(packageRoot, target);
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
