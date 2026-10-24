import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const commit = "95af7eefd34b65723bf13a466059ced7b4341846";
const url = `https://raw.githubusercontent.com/jdempcy/hdkit/${commit}/sample-apps/hdkit_sample_app/app/assets/images/bodygraph-blank-with-gate-outlines.svg`;
const response = await fetch(url);
assert.ok(response.ok, `Reference download failed: ${response.status}`);
const source = await response.text();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage();
  // Use the SVG DOM for paths and bounds, including circles encoded as paths.
  await page.setContent(source);
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const pathData = (element) => {
      if (element.hasAttribute("d"))
        return element.getAttribute("d").replace(/\s+/g, " ").trim();
      const points = Array.from({ length: element.points.numberOfItems }, (_, i) => {
        const point = element.points.getItem(i);
        return `${point.x},${point.y}`;
      });
      return `M${points.join(" L")} Z`;
    };
    const bounds = (element) => {
      const { x, y, width, height } = element.getBBox();
      return {
        x: Math.round((x + width / 2) * 100) / 100,
        y: Math.round((y + height / 2) * 100) / 100,
      };
    };
    const paths = {}, centers = {}, ports = {}, branches = {};
    for (const group of svg.querySelector("#Centers").children) {
      const shape = group.querySelector("path");
      centers[group.id] = {
        path: pathData(shape),
        ...bounds(shape),
      };
    }
    for (let gate = 1; gate <= 64; gate++) {
      const path = svg.querySelector(`#Gate${gate}`);
      paths[gate] = pathData(path);
      branches[gate] = bounds(path);
      const circle = svg.querySelector(`#GateTextBg${gate}`).firstElementChild;
      ports[gate] = bounds(circle);
    }
    const integration = {};
    for (const id of ["GateSpan", "GateConnect10", "GateConnect34"]) {
      const element = svg.querySelector(`#${id}`);
      integration[id] = pathData(element);
    }
    return { viewBox: svg.getAttribute("viewBox"), centers, ports, paths, branches, integration };
  });
  assert.equal(Object.keys(geometry.ports).length, 64);
  assert.equal(Object.keys(geometry.centers).length, 9);
  const result = {
    source: {
      url,
      commit,
      sha256: createHash("sha256").update(source).digest("hex"),
      license: "MIT; Copyright (c) 2023 Jonah Dempcy; see THIRD_PARTY_NOTICES.md",
    },
    ...geometry,
  };
  await writeFile(new URL("../src/ui/bodygraph-reference.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
  console.log(`Imported ${Object.keys(geometry.ports).length} fixed gate ports, 9 centers, 64 half-channels and 3 Integration connectors.`);
} finally {
  await browser.close();
}
