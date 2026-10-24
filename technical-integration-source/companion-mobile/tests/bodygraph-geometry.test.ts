import test from "node:test";
import assert from "node:assert/strict";
import { centerId, runtime } from "../src/content/records";
import { deriveStructure } from "../src/domain/calculator";
import reference from "../src/ui/bodygraph-reference.json";
import {
  GRAPH_HEIGHT, GRAPH_WIDTH, gatePorts, gatePaths, centerShapes,
  channelRoute, channelGeometry, integrationChannels, integrationPaths, integrationState,
} from "../src/ui/bodygraph-geometry";
import { planetSymbols } from "../src/ui/planet-symbols";
import type { Activation } from "../src/domain/contracts";
import { activationInk, channelInk, halfPlane, gateInkAxis, gateInkPartition, isIntegration } from "../src/ui/bodygraph-geometry";
import { theme } from "../src/ui/theme";

test("BodyGraph contains all fixed ports, centers, half-channels and pinned reference provenance", () => {
  assert.equal(Object.keys(gatePorts).length, 64);
  assert.equal(Object.keys(gatePaths).length, 64);
  assert.equal(Object.keys(centerShapes).length, 9);
  assert.equal(channelGeometry.length, 36);
  assert.equal(reference.source.commit, "95af7eefd34b65723bf13a466059ced7b4341846");
  assert.equal(reference.source.sha256, "b090e04d707b93b8344045a7389662a38424b2296cae5392f329e899cf84bcef");
  for (let n = 1; n <= 64; n++) {
    assert.ok(gatePorts[n].x > 0 && gatePorts[n].x < GRAPH_WIDTH);
    assert.ok(gatePorts[n].y > 0 && gatePorts[n].y < GRAPH_HEIGHT);
    assert.ok(gatePaths[n].startsWith("M"));
  }
});

test("conventional port rows and sides never follow gate-number grid order", () => {
  for (const row of [[64, 61, 63], [47, 24, 4], [62, 23, 56], [31, 8, 33], [5, 14, 29], [42, 3, 9], [53, 60, 52]]) {
    assert.ok(gatePorts[row[0]].x < gatePorts[row[1]].x);
    assert.ok(gatePorts[row[1]].x < gatePorts[row[2]].x);
    assert.ok(Math.max(...row.map((g) => gatePorts[g].y)) - Math.min(...row.map((g) => gatePorts[g].y)) < 1);
  }
  assert.ok(gatePorts[10].x < centerShapes.G.x);
  assert.ok(gatePorts[25].x > centerShapes.G.x);
  assert.ok(gatePorts[34].x < centerShapes.Sacral.x);
  assert.ok(gatePorts[59].x > centerShapes.Sacral.x);
  assert.ok(gatePorts[54].x < centerShapes.Root.x && gatePorts[19].x > centerShapes.Root.x);
});

test("all 36 channel routes start and end at their actual harmonic gate ports", () => {
  for (const channel of runtime.channels) {
    const points = channelRoute(channel.gates);
    assert.deepEqual(points[0], gatePorts[channel.gates[0]], channel.pair);
    assert.deepEqual(points.at(-1), gatePorts[channel.gates[1]], channel.pair);
    assert.deepEqual(new Set(channel.gates.map((g) => centerId(runtime.gates.find((record) => record.gate_number === g)!.center))), new Set(channel.centers.map(centerId)));
  }
});

test("Integration preserves all six routes and the shared trunk instead of center-to-center shortcuts", () => {
  assert.deepEqual(integrationChannels.map((c) => [...c.gates].sort((a, b) => a - b).join("-")).sort(), ["10-20", "10-34", "10-57", "20-34", "20-57", "34-57"]);
  assert.equal(Object.keys(integrationPaths).length, 3);
  assert.deepEqual(channelRoute([20, 57]).slice(1, -1), [{ x: 218, y: 693 }, { x: 140, y: 820 }]);
  assert.equal(channelRoute([10, 20]).length, 3);
  assert.equal(channelRoute([34, 57]).length, 3);
});

test("all 16 Integration activation combinations agree with completed chart topology", () => {
  const gates = [10, 20, 34, 57];
  for (let mask = 0; mask < 16; mask++) {
    const active = gates.filter((_, i) => mask & (1 << i));
    const before = JSON.stringify(active);
    const structure = deriveStructure(active);
    const crossJunction = structure.channels.some((c) => c.gates.some((g) => g === 10 || g === 20) && c.gates.some((g) => g === 34 || g === 57));
    assert.equal(integrationState(active).GateSpan, crossJunction, `mask ${mask}`);
    assert.equal(integrationState(active).GateConnect10, active.includes(10));
    assert.equal(integrationState(active).GateConnect34, active.includes(34));
    assert.equal(JSON.stringify(active), before);
  }
});

test("planetary columns have a symbol for every currently calculated planet", () => {
  assert.equal(Object.keys(planetSymbols).length, 13);
  for (const planet of ["Sun", "Earth", "Moon", "North Node", "South Node", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"])
    assert.equal([...planetSymbols[planet]].length, 1);
});

test("channel ink follows actual activation side with distinct high-contrast colors", () => {
  const activations = [
    { gate: 29, side: "design" }, { gate: 46, side: "design" },
    { gate: 39, side: "personality" }, { gate: 55, side: "personality" },
    { gate: 55, side: "design" },
  ] as Activation[];
  const before = JSON.stringify(activations);
  assert.equal(activationInk([29], activations), "design");
  assert.equal(activationInk([39], activations), "personality");
  assert.equal(activationInk([55], activations), "both");
  assert.equal(activationInk([1], activations), "none");
  assert.equal(channelInk.personality, "#4fa7ef");
  assert.equal(channelInk.design, "#32bd7a");
  assert.ok(halfPlane({ x: 0, y: 0 }, { x: 1, y: 0 }).endsWith("Z"));
  assert.throws(() => halfPlane({ x: 0, y: 0 }, { x: 0, y: 0 }), /zero length/);
  assert.equal(JSON.stringify(activations), before);
});

test("longitudinal partition has the same centerline and orientation across both channel halves", () => {
  for (const channel of runtime.channels.filter((c) => !isIntegration(c.gates))) {
    const [a, b] = channel.gates;
    assert.deepEqual(gateInkAxis(a), gateInkAxis(b), channel.pair);
    assert.deepEqual(gateInkPartition(a), gateInkPartition(b), channel.pair);
  }
});

test("2-14 dual activation keeps one centerline with blue left and green right", () => {
  const activations = [2, 14].flatMap((gate) => [
    { gate, side: "design" }, { gate, side: "personality" },
  ]) as Activation[];
  for (const gate of [2, 14]) {
    assert.equal(activationInk([gate], activations), "both");
    const {pivot,direction}=gateInkPartition(gate);
    assert.ok(direction.y>0);
    const normal={x:direction.y,y:-direction.x};
    assert.ok(normal.x>0,"Design clipping half-plane is to the right for upright segments");
    assert.ok(Math.abs(pivot.x-420.55)<0.01);
  }
  assert.throws(() => halfPlane({x:0,y:0},{x:0,y:0}), /zero length/);
});
test("1-8 and43-23 use continuous shared longitudinal partitions, not repeated dashes", () => {
  for(const [a,b] of [[1,8],[43,23]]){
    const partition=gateInkPartition(a);
    assert.deepEqual(partition,gateInkPartition(b));
    assert.ok(partition.direction.y>0);
    assert.ok(Math.abs(partition.pivot.x-420.7)<0.3);
  }
  const integration=gateInkPartition(20);
  assert.equal(integration.direction.x,217.815-354.66);
  assert.equal(integration.direction.y,700.46-489.575);
  assert.ok(integration.direction.y>0);
});

test("both activation colors remain legible on the dark canvas and distinct from inactive tracks", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const color of [channelInk.design, channelInk.personality]) {
    assert.ok(contrast(color, theme.background) >= 4.5);
    assert.ok(contrast(color, channelInk.inactive) >= 3);
  }
});
