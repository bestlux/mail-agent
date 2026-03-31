import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function normalizeTag(rawTag) {
  if (!rawTag) {
    return "";
  }

  if (rawTag.startsWith("refs/tags/")) {
    return rawTag.slice("refs/tags/".length);
  }

  return rawTag;
}

const rawTag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF;
const tag = normalizeTag(rawTag);

if (!tag) {
  console.error("Missing release tag. Pass a tag like v0.1.0.");
  process.exit(1);
}

if (!tag.startsWith("v")) {
  console.error(`Release tags must start with 'v'. Received: ${tag}`);
  process.exit(1);
}

const expectedVersion = tag.slice(1);
const files = [
  "package.json",
  "packages/plugin/package.json",
  "packages/daemon/package.json",
  "packages/shared/package.json"
];

const versions = new Map();

for (const relativePath of files) {
  const filePath = path.resolve(relativePath);
  const packageJson = JSON.parse(await readFile(filePath, "utf8"));
  versions.set(relativePath, packageJson.version);
}

const mismatches = [...versions.entries()].filter(([, version]) => version !== expectedVersion);

if (mismatches.length > 0) {
  console.error(`Tag ${tag} does not match workspace versions:`);
  for (const [file, version] of mismatches) {
    console.error(`- ${file}: ${version}`);
  }
  process.exit(1);
}

console.log(`Release tag ${tag} matches all publishable package versions (${expectedVersion}).`);
