import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const pin = JSON.parse(await readFile(new URL("../assets/dataset-pin.json", import.meta.url), "utf8"));
for (const [name, expected] of Object.entries(pin.files)) {
  const bytes = await readFile(new URL(`../assets/${name}`, import.meta.url));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
    throw Error(`Canonical bytes differ from approved pin: ${name}`);
}
console.log(JSON.stringify({ result: "PASS_PINNED_BYTES", files: Object.keys(pin.files).length, sourceAuthentication: pin.sourceAuthentication, rights: "unresolved; private evaluation only" }, null, 2));
