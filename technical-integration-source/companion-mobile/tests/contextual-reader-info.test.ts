import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { correctionPairs, CORRECTION_NAMES as names } from "../evaluation/correction-pairs";
import { centerId, runtime } from "../src/content/records";
import { CENTER_NAMES } from "../src/domain/contracts";
import { calculateComposite } from "../src/domain/composite";
import { contextActivationLabel, resolveContextInfo, type ContextInfoTarget } from "../src/intelligence/contextual-reader-info";
import { channelRef, gateRef } from "../src/intelligence/mechanics-references";

const pairs = correctionPairs(), c = pairs.P1;

test("R3 all 64 Gate and 36 Channel references use canonical Centers and validate identities", () => {
  for (const gate of runtime.gates) {
    assert.equal(gateRef(gate.gate_number), `Gate ${gate.gate_number} (${CENTER_NAMES[centerId(gate.center)]} Center)`);
    for (let line = 1; line <= 6; line++) assert.equal(gateRef(gate.gate_number, line), `Gate ${gate.gate_number}.${line} (${CENTER_NAMES[centerId(gate.center)]} Center)`);
  }
  for (const channel of runtime.channels) {
    const label = channelRef(channel.id);
    assert.ok(label.includes(channel.gates.join("\u2013")));
    for (const center of channel.centers) assert.ok(label.includes(CENTER_NAMES[centerId(center)]));
  }
  for (const gate of [0, 65, 1.2, NaN]) assert.throws(() => gateRef(gate));
  for (const line of [0, 7, 1.5, NaN]) assert.throws(() => gateRef(48, line));
  assert.throws(() => channelRef("channel-48-16"));
});

test("R3 context requires an issued calculation and calculation-scoped activation contribution", () => {
  const target: ContextInfoTarget = { kind: "activation", id: c.facts.contributions[0].id };
  assert.throws(() => resolveContextInfo(JSON.parse(JSON.stringify(c)), target, names), /Unvalidated calculation/);
  assert.throws(() => resolveContextInfo({ ...c }, target, names), /Unvalidated calculation/);
  assert.throws(() => resolveContextInfo(c, { kind: "activation", id: c.facts.contributions[0].activationId }, names), /contribution ID/);
  assert.throws(() => resolveContextInfo(c, { kind: "activation", id: pairs.P2.facts.contributions[0].id }, names));
  assert.throws(() => resolveContextInfo(c, { kind: "definition", id: "potential-bridge" }, names));
  assert.throws(() => resolveContextInfo(c, { kind: "gate", id: "48garbage" }, names));
  assert.throws(() => resolveContextInfo(c, { kind: "center", id: "toString" }, names));
});

test("R3 exact activation context keeps planet, side, person, chart and immutable activation IDs", () => {
  for (const activation of c.facts.contributions) {
    const info = resolveContextInfo(c, { kind: "activation", id: activation.id }, names), key = info.activationKey!;
    assert.equal(info.title, contextActivationLabel(activation));
    assert.equal(key.contributionId, activation.id); assert.equal(key.personId, activation.personId);
    assert.equal(key.chartVersionId, activation.chartVersionId); assert.equal(key.snapshotHash, activation.snapshotHash);
    assert.equal(key.activationId, activation.activationId); assert.equal(key.planetKey, activation.planetKey);
    assert.equal(key.side, activation.side); assert.equal(key.center, activation.center);
    assert.ok(info.inThisChart.includes(names[activation.personId]));
    assert.ok(info.title.includes(activation.planet)); assert.ok(info.title.includes(CENTER_NAMES[activation.center]));
    assert.ok(key.sourceRecordIds.length); assert.ok(info.factIds.length);
    assert.equal(info.advanced.status, "structural-only-symbolism-withheld");
    assert.match(info.advanced.notes.join(" "), /No cleared symbolic planet meaning/);
    assert.doesNotMatch(info.meaning, /cleared|rights|authenticity|approval/);
    assert.doesNotMatch(info.meaning, /Mercury emphasizes|conscious activation|messages and communication/);
  }
});

test("R3 repeated contributions remain distinct and deleting one record is not endpoint removal", () => {
  const repeated = c.facts.contributions.find(a => c.facts.contributions.filter(b => b.personId === a.personId && b.gate === a.gate).length > 1)!;
  assert.ok(repeated);
  const info = resolveContextInfo(c, { kind: "gate", id: String(repeated.gate) }, names);
  for (const record of c.facts.contributions.filter(a => a.gate === repeated.gate)) assert.ok(info.contributionIds.includes(record.id));
  assert.match(info.inThisChart, /Removing one record does not remove this endpoint/);
  assert.match(info.inThisChart, /not stronger definition/);
  const identical = pairs.P4.facts.contributions.find(a => pairs.P4.facts.contributions.some(b => b.personId !== a.personId && b.activationId === a.activationId));
  if (identical) {
    const same = resolveContextInfo(pairs.P4, { kind: "activation", id: identical.id }, {});
    assert.equal(same.activationKey!.personId, identical.personId);
    assert.equal(same.activationKey!.contributionId, identical.id);
  }
});

test("R3 provisional and boundary-risk Lines are withheld in visible text and activation keys", () => {
  const provisional = pairs.P6.facts.contributions.filter(a => a.uncertaintyRef.eligibility === "provisional-point");
  assert.ok(provisional.length);
  for (const activation of provisional) {
    const info = resolveContextInfo(pairs.P6, { kind: "activation", id: activation.id }, names);
    assert.equal(info.activationKey!.line, null); assert.equal(info.activationKey!.lineStatus, "uncertain-withheld");
    assert.ok(!info.title.includes(`Gate ${activation.gate}.${activation.line}`));
    assert.ok(!info.inThisChart.includes(`${contextActivationLabel(activation).split(" at ")[0]} at Gate ${activation.gate}.${activation.line}`));
    assert.match(info.title, /exact Line uncertain/); assert.match(info.evidence.join(" "), /not a tested interval or a probability/);
  }
  for (const pair of Object.values(pairs)) for (const activation of pair.facts.contributions.filter(a => a.boundaryRisk)) {
    assert.equal(resolveContextInfo(pair, { kind: "activation", id: activation.id }, names).activationKey!.line, null);
  }
});

test("R3 Channels retain both endpoint owners, all repeated supports and source-linked proof", () => {
  for (const relation of c.facts.channelRelations) {
    const info = resolveContextInfo(c, { kind: "channel", id: relation.channelId }, names);
    assert.equal(info.title, channelRef(relation.channelId));
    for (const endpoint of relation.endpoints) {
      assert.ok(info.inThisChart.includes(gateRef(endpoint.gate)));
      for (const id of endpoint.contributionIds) assert.ok(info.contributionIds.includes(id));
    }
    assert.ok(info.sourceRecordIds.includes(relation.channelId));
    assert.ok(info.factIds.includes(c.facts.mechanicsFacts.find(f => f.predicate === "channel-relation" && (f.value as { channelId: string }).channelId === relation.channelId)!.id));
    if (!relation.formed) assert.match(info.inThisChart, /incomplete in A\+B/);
    else for (const state of relation.endpointStates) assert.ok(info.inThisChart.includes(`${names[state.personId]}: ${state.role}`));
  }
});

test("R3 actual Definition routes never become sole or necessary bridges", () => {
  assert.deepEqual(resolveContextInfo(c, { kind: "definition", id: "combined" }, names).inThisChart,
    resolveContextInfo(c, { kind: "definition", id: c.facts.topology.combinedGraph.id }, names).inThisChart);
  assert.ok(c.facts.topology.actualJoins.length);
  for (const join of c.facts.topology.actualJoins) {
    const info = resolveContextInfo(c, { kind: "definition", id: join.witness.id }, names);
    assert.deepEqual(info.witnessIds, [join.witness.id]);
    assert.ok(info.title.includes(names[join.personId]));
    assert.match(info.inThisChart, /one sufficient route, not a unique, sole or necessary bridge/);
    assert.match(info.inThisChart, /alternative routes may exist/);
    for (const edge of join.witness.edges) assert.ok(info.advanced.context.join(" ").includes(channelRef(edge.channelId)));
    assert.match(info.meaning, /does not change natal Type, Authority or Profile/);
  }
  for (const graph of [...c.facts.topology.natalGraphs, c.facts.topology.combinedGraph]) {
    assert.ok(resolveContextInfo(c, { kind: "definition", id: graph.id }, names).inThisChart.includes(`${graph.componentCount} connected`));
    for (const component of graph.components) assert.ok(resolveContextInfo(c, { kind: "definition", id: component.id }, names).title.includes(CENTER_NAMES[component.centerIds[0]]));
  }
});

test("R3 Center context separates natal from combined definition, not active Gates from defined Centers", () => {
  for (const center of Object.keys(CENTER_NAMES) as (keyof typeof CENTER_NAMES)[]) {
    const info = resolveContextInfo(c, { kind: "center", id: center }, names);
    assert.equal(info.title, `${CENTER_NAMES[center]} Center`);
    assert.match(info.meaning, /isolated active Gate does not define/);
    assert.match(info.inThisChart, /Together \(permanent A\+B\)/);
    for (const graph of c.facts.topology.natalGraphs) assert.ok(info.inThisChart.includes(`${names[graph.scope.personIds[0]]} alone`));
  }
});

test("R3 context is stable across A/B display reversal and never copies birth records", () => {
  const reverse = calculateComposite(c.inputs[1], c.inputs[0]);
  for (const activation of c.facts.contributions.slice(0, 5)) {
    const target: ContextInfoTarget = { kind: "activation", id: activation.id };
    assert.deepEqual(resolveContextInfo(reverse, target, names), resolveContextInfo(c, target, names));
  }
  const info = resolveContextInfo(c, { kind: "activation", id: c.facts.contributions[0].id }, names);
  const text = JSON.stringify(info);
  for (const input of c.inputs) for (const value of [input.birth.date, input.birth.localTime, input.birth.place]) assert.ok(!text.includes(value));
  assert.ok(!("birth" in info.advanced.inputRefs[0]));
});

test("R3 initial context stays bounded and full omitted records remain in advanced", () => {
  const targets: ContextInfoTarget[] = [{ kind: "definition", id: "combined" }, { kind: "center", id: "Throat" },
    ...c.facts.channelRelations.map(r => ({ kind: "channel" as const, id: r.channelId })),
    ...c.facts.contributions.map(a => ({ kind: "activation" as const, id: a.id }))];
  for (const target of targets) {
    const info = resolveContextInfo(c, target, names);
    assert.ok(info.inThisChart.split("\n\n").length <= 4);
    assert.ok(info.evidence.length >= 2 && info.evidence.length <= 6);
    assert.doesNotMatch([info.meaning, info.inThisChart, ...info.evidence].join(" "), /rights|clause review|commercial|not cleared|source authenticity/);
    for (const id of info.contributionIds) assert.ok(info.advanced.activationKeys.some(k => k.contributionId === id));
    assert.ok(info.advanced.evidence.length >= info.contributionIds.length);
  }
  const definition = resolveContextInfo(c, { kind: "definition", id: "combined" }, names);
  assert.ok(definition.advanced.context.length > definition.inThisChart.split("\n\n").length);
  assert.ok(definition.inThisChart.length < 1400, "combined Definition must not enumerate the Channel inventory");
});

test("R3 chart selection and planetary rows reuse one modal with keyboard and mobile affordances", () => {
  const ui = readFileSync(new URL("../src/ui/ContextualInfo.tsx", import.meta.url), "utf8");
  assert.match(ui, /resolveContextInfo\(calculation, target, names\)/);
  for (const required of ['e.key === "Escape"', 'e.key === "Tab"', '"focusin"', 'target.focus({ preventScroll: true })', 'accessibilityViewIsModal', 'role="dialog"', 'onRequestClose={onClose}', 'width < 600 ? "flex-end"', 'width: 44, height: 44']) assert.ok(ui.includes(required), required);
  assert.match(ui, /const visibleLabel = label \?\? \(target.kind === "channel" \? info\?\.title/);
  assert.match(ui, /\{visibleLabel\}<\/Text>/);
  const workspace = readFileSync(new URL("../src/ui/CompositeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /target=\{chartContext\}/); assert.match(workspace, /target=\{\{kind:"activation",id:c.id,graphId:contextGraph.id\}\}/);
  assert.match(workspace, /context-planetary-columns/);
  assert.ok(!workspace.includes("resolveContextInfo("), "parent must not duplicate resolver content");
  const graph = readFileSync(new URL("../src/ui/CompositeBodyGraph.tsx", import.meta.url), "utf8");
  assert.match(graph, /name=\{`Composite Gate \$\{n\},/);
  assert.match(graph, /name=\{`Composite Channel \$\{channel.pair\}/);
  assert.match(graph, /CENTER_NAMES\[centerId\(g.center\)\]/);
  assert.match(graph, /channel.centers.map\(c=>CENTER_NAMES\[centerId\(c\)\]\)/);
});
