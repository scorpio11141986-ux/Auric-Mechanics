import {
  readFile,
  writeFile,
  copyFile,
  mkdir,
  readdir,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = path.dirname(root.slice(0, -1));
const source = path.join(workspace, "dataset-reconciliation-20261006/output");
const target = path.join(root, "assets");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceManifest = JSON.parse(
  await readFile(path.join(source, "../MANIFEST_SHA256.json"), "utf8"),
);
await mkdir(target, { recursive: true });
const files = {};
for (const name of [
  "app1_runtime.min.json",
  "app2_documents.json",
  "query_config.json",
  "upstream_query_cases.json",
]) {
  const bytes = await readFile(path.join(source, name));
  const declared = sourceManifest.files.find(
    (file) => file.path === `output/${name}`,
  );
  if (
    !declared ||
    declared.sha256 !== sha(bytes) ||
    declared.bytes !== bytes.length
  )
    throw Error(`Candidate manifest mismatch: ${name}`);
  files[name] = { sha256: sha(bytes), bytes: bytes.length };
  await copyFile(path.join(source, name), path.join(target, name));
}
const runtime = JSON.parse(
  await readFile(path.join(target, "app1_runtime.min.json"), "utf8"),
);
const docs = JSON.parse(
  await readFile(path.join(target, "app2_documents.json"), "utf8"),
);
if (
  runtime.gates.length !== 64 ||
  runtime.channels.length !== 36 ||
  docs.documents.length !== 484
)
  throw Error("Dataset contract mismatch");
await writeFile(
  path.join(target, "dataset-pin.json"),
  JSON.stringify(
    {
      version: "DatasetPinV1",
      releaseStatus: runtime.release_status,
      runtimeVersion: runtime.version,
      canonical: runtime.canonical_master,
      reconciliationArchive:
        "HD_App_Dataset_Reconciliation_v1.0_candidate_2026-10-06.zip",
      reconciliationArchiveSha256: sha(
        await readFile(
          path.join(
            workspace,
            "HD_App_Dataset_Reconciliation_v1.0_candidate_2026-10-06.zip",
          ),
        ),
      ),
      sourceAuthentication:
        "Propagation verified; unavailable original F1/F2 bytes were not authenticated.",
      files,
    },
    null,
    2,
  ) + "\n",
);

const legacy = {};
async function walk(dir) {
  for (const ent of await readdir(path.join(workspace, dir), {
    withFileTypes: true,
  })) {
    const relative = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(relative);
    else
      legacy[relative.replaceAll("\\", "/")] = sha(
        await readFile(path.join(workspace, relative)),
      );
  }
}
await walk("windows-local");
await walk("app");
await writeFile(
  path.join(root, "docs/legacy-preservation.json"),
  JSON.stringify(legacy, null, 2) + "\n",
);
for (const name of [
  "hd-data.js", "hd-engine.js", "resolver/birth-input.js", "resolver/astronomy-engine.js",
  "resolver/design-date.js", "resolver/gate-mapper.js", "resolver/activation-resolver.js",
  "resolver/hd-resolver.js", "vendor/astronomy.browser.min.js", "vendor/ASTRONOMY_ENGINE_LICENSE.txt"
]) {
  const destination = path.join(root, "tests/reference/legacy", name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(workspace, "windows-local", name), destination);
}
console.log(
  "Copied original candidate bytes, pinned 484 records; legacy preservation hashes captured.",
);
