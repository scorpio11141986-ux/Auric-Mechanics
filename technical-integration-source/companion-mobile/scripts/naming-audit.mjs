import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(appRoot, "..");
const exclusions = [
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-android/**",
  "**/artifacts/**",
  "**/vendor/**",
  "**/.git/**",
  "**/.expo/**",
  "**/.codex/**",
  "**/.agents/**",
  "*.zip",
  "*.log",
  "*.jsonl",
  "**/NAMING_AUDIT.md",
  "**/remaining-legacy-names.json",
  "**/naming-audit.mjs",
];
const args = [
  "--hidden",
  "--json",
  "-i",
  "infinity[ _-]*rae",
  ...exclusions.flatMap((glob) => ["--glob", `!${glob}`]),
  ".",
];
const raw = execFileSync("rg", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const matches = raw
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => row.type === "match")
  .flatMap(({ data }) => {
    const path = data.path.text
      .replace(/^\.\\|^\.\//, "")
      .replaceAll("\\", "/");
    const historical =
      path.startsWith("docs/") ||
      path.startsWith("dataset-reconciliation-") ||
      path.endsWith("legacy-preservation.json");
    const reason = historical
      ? "Historical audit or immutable input evidence; retained, not active branding."
      : /test/i.test(path)
        ? "Regression coverage of preserved storage/engine compatibility."
        : "Protected package, class, storage, key-vault or engine identifier; changing it risks compatibility.";
    return data.submatches.map((match) => ({
      path,
      line: data.line_number,
      column: match.start + 1,
      occurrence: match.match.text,
      reason,
    }));
  });
const archives = execFileSync(
  "rg",
  [
    "--files",
    "--hidden",
    "--no-ignore",
    "--glob",
    "*.zip",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/artifacts/**",
    "--glob",
    "!**/.git/**",
    ".",
  ],
  { cwd: root, encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter((path) => /infinity[ _-]*rae/i.test(path))
  .map((path) => ({
    path: path.replaceAll("\\", "/"),
    reason: "Historical release/input archive; not rewritten or renamed.",
  }));
const output = resolve(appRoot, "docs/remaining-legacy-names.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      date: "2026-10-07",
      scope:
        "Repository text source including hidden workflow files; excludes dependencies, vendored code, generated bundles, logs, previous extracted releases and this audit itself. Generated bundles may contain protected identifiers; previous release copies remain historical.",
      matches,
      archives,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    occurrences: matches.length,
    files: new Set(matches.map((row) => row.path)).size,
    historicalArchives: archives.length,
    output,
  }),
);
