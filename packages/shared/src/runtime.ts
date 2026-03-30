import os from "node:os";
import path from "node:path";

export function getRuntimeDir(appName = "mail-agent"): string {
  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, appName);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }

  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return path.join(xdg, appName);
}

export function getMarketplaceRoot(): string {
  return path.join(os.homedir(), ".agents");
}

export function getPluginInstallRoot(): string {
  return path.join(os.homedir(), "plugins");
}
