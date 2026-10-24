import assert from "node:assert/strict";
import test from "node:test";
import { initialUI01, ui01Reducer, readerKey, currentReader, readingSelection } from "../src/ui/ui01-state";
import type { Selection } from "../src/ui/workspace-model";
const exact: Selection = { kind: "gate", gate: 43, line: 2, activationId: "synthetic-personality-Sun" };
const reference: Selection = { kind: "gate", gate: 8, line: 4 };
const committed = () => ui01Reducer(initialUI01("natal:synthetic:r1:calc1"), { type: "commit", selection: exact });

test("selection has three explicit depths and identical exact activation is idempotent", () => {
  let s = committed();
  assert.equal(s.readingLevel, "compact");
  s = ui01Reducer(s, { type: "level", level: "expanded" });
  s = ui01Reducer(s, { type: "reader", key: readerKey(s), patch: { scrollY: 275, disclosures: { Sources: true } } });
  const same = ui01Reducer(s, { type: "commit", selection: { ...exact } });
  assert.equal(same.readingLevel, "expanded"); assert.deepEqual(currentReader(same), currentReader(s));
  const otherActivation = ui01Reducer(s, { type: "commit", selection: { ...exact, activationId: "synthetic-design-Sun" } });
  assert.equal(otherActivation.readingLevel, "compact");
});
for (const level of ["compact", "expanded"] as const) test(`direct Full and exact ${level} return survive local references and reader changes`, () => {
  let s = ui01Reducer(committed(), { type: "level", level });
  s = ui01Reducer(s, { type: "chart", patch: { zoom: 2.5, center: { x: .37, y: .67 }, layer: "Channels", pageScrollY: 135, canvasScrollY: 310 } });
  s = ui01Reducer(s, { type: "reader", key: readerKey(s), patch: { scrollY: 280, disclosures: { "Rich explanation": true }, view: "Sources" } });
  const chart = s.chartView, reader = currentReader(s);
  s = ui01Reducer(s, { type: "full", opener: level });
  assert.equal(s.readingLevel, "full"); assert.equal(s.fullReturn?.level, level);
  const entry = JSON.stringify(s.fullReturn);
  s = ui01Reducer(s, { type: "commit", selection: reference });
  s = ui01Reducer(s, { type: "reader", key: readerKey(s), patch: { scrollY: 800, disclosures: { Sources: false } } });
  s = ui01Reducer(s, { type: "chart", patch: { zoom: 1 } });
  assert.deepEqual(readingSelection(s), reference); assert.equal(JSON.stringify(s.fullReturn), entry);
  s = ui01Reducer(s, { type: "clear-preview" }); // Ask/Knowledge clears only ephemeral preview.
  s = ui01Reducer(s, { type: "return" });
  assert.deepEqual(s.committedSelection, exact); assert.deepEqual(s.chartView, chart);
  assert.equal(s.readingLevel, level); assert.deepEqual(currentReader(s), reader); assert.equal(s.fullReturn, null);
});
test("Back traverses Full detail history before exact chart return", () => {
  let s = ui01Reducer(committed(), { type: "full", opener: "compact" });
  s = ui01Reducer(s, { type: "commit", selection: reference });
  s = ui01Reducer(s, { type: "back" });
  assert.equal(s.readingLevel, "full"); assert.deepEqual(readingSelection(s), exact);
  s = ui01Reducer(s, { type: "back" }); assert.equal(s.readingLevel, "compact");
});
test("hover of either origin cannot replace or scroll pinned reading; stale scopes cannot preview", () => {
  let s = ui01Reducer(committed(), { type: "level", level: "expanded" });
  s = ui01Reducer(s, { type: "reader", key: readerKey(s), patch: { scrollY: 133, disclosures: { Source: true } } });
  for (const origin of ["graph", "reference"] as const) {
    const preview = ui01Reducer(s, { type: "preview", target: reference, origin });
    assert.deepEqual(preview.committedSelection, exact); assert.equal(preview.readingLevel, "expanded");
    assert.deepEqual(currentReader(preview), currentReader(s)); assert.equal(preview.preview?.origin, origin);
    assert.equal(ui01Reducer(s, { type: "preview", target: reference, scopeKey: "old" }), s);
    const otherOrigin = origin === "graph" ? "reference" : "graph";
    assert.equal(ui01Reducer(preview, { type: "preview", target: null, origin: otherOrigin }), preview, "graph scroll cleanup cannot erase an Inspector focus cue");
  }
});
test("scope revision invalidates return/selection/preview/readers; normalized center remains layout-independent", () => {
  let s = ui01Reducer(committed(), { type: "chart", patch: { zoom: 2, center: { x: .4, y: .6 } } });
  s = ui01Reducer(s, { type: "full", opener: "compact" });
  assert.deepEqual(s.fullReturn?.chartView.center, { x: .4, y: .6 });
  s = ui01Reducer(s, { type: "scope", scopeKey: "natal:other:r2:calc1" });
  assert.equal(s.readingLevel, "compact"); assert.equal(s.fullReturn, null); assert.equal(s.fullCursor, null);
  assert.deepEqual(s.committedSelection, { kind: "chart" }); assert.deepEqual(s.readers, {});
  assert.equal(ui01Reducer(s, { type: "reader", key: "natal:synthetic:r1:calc1/expanded/old", patch: { scrollY: 300 } }), s, "late scroll cannot repopulate old scope");
});
