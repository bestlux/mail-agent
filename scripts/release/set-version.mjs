import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const version = process.argv[2];

if (!version) {
  console.error("Usage: node ./scripts/release/set-version.mjs <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semver-like version: ${version}`);
  process.exit(1);
}

const files = [
  "package.json",
  "packages/plugin/package.json",
  "packages/daemon/package.json",
  "packages/shared/package.json"
];

for (const relativePath of files) {
  const filePath = path.resolve(relativePath);
  const packageJson = JSON.parse(await readFile(filePath, "utf8"));
  packageJson.version = version;
  await writeFile(filePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  console.log(`Updated ${relativePath} -> ${version}`);
}
