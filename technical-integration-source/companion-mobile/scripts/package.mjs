import {
  readdir,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(root, "artifacts");
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d+Z/, "Z");
const stage = path.join(artifacts, `stage-${stamp}`);
await mkdir(stage, { recursive: true });
const files = {};
const privateDates = (process.env.PRIVATE_RELEASE_DATES || "")
  .split(",")
  .filter(Boolean);
const allowed = new Set([
  "assets",
  "docs",
  "src",
  "server",
  "scripts",
  "tests",
  "dist",
]);
async function copy(dir = "") {
  for (const entry of await readdir(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const relative = path.join(dir, entry.name),
      normalized = relative.replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (dir || allowed.has(entry.name)) await copy(relative);
    } else if (
      (dir ||
        [
          "App.tsx",
          "index.ts",
          "package.json",
          "package-lock.json",
          "tsconfig.json",
          "app.json",
          "eas.json",
          ".gitignore",
          ".easignore",
          "README.md",
          "THIRD_PARTY_NOTICES.md",
          "Launch-Windows.cmd",
          ".env.example",
        ].includes(entry.name)) &&
      !/\.local\.json$|\.log$/.test(entry.name)
    ) {
      const bytes = await readFile(path.join(root, relative));
      if (
        /sk-proj-[A-Za-z0-9]{15}/.test(bytes.toString("utf8")) ||
        privateDates.some((date) => bytes.toString("utf8").includes(date))
      )
        throw Error(
          `Private data or credential pattern in release: ${normalized}`,
        );
      files[normalized] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      await mkdir(path.dirname(path.join(stage, relative)), {
        recursive: true,
      });
      await copyFile(path.join(root, relative), path.join(stage, relative));
    }
  }
}
await copy();
await writeFile(
  path.join(stage, "MANIFEST_SHA256.json"),
  JSON.stringify(
    {
      version: "0.1.0",
      status: "FOUNDATION_CANDIDATE_NOT_ANDROID_VERIFIED",
      files,
    },
    null,
    2,
  ) + "\n",
);
const archive = path.join(
  path.dirname(root.slice(0, -1)),
  `Auric_Mechanics_AddendumC_v0.1_${stamp}.zip`,
);
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(stage)}, ${quote(archive)})`,
  ],
  { stdio: "inherit" },
);
const bytes = await readFile(archive);
console.log(
  JSON.stringify(
    {
      archive,
      files: Object.keys(files).length,
      bytes: (await stat(archive)).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ),
);
