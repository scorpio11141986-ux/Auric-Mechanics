import reference from "./bodygraph-reference.json";
import { runtime } from "../content/records";
import type { Activation, CenterId } from "../domain/contracts";

export type Point = { x: number; y: number };
export const GRAPH_WIDTH = 851.41;
export const GRAPH_HEIGHT = 1309.4;
export const GRAPH_VIEWBOX = `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`;
export const gatePorts: Record<number, Point> = reference.ports;
export const gatePaths: Record<number, string> = reference.paths;
export const centerShapes: Record<CenterId, Point & { path: string }> = reference.centers;
export const integrationPaths = reference.integration;
const branches: Record<number, Point> = reference.branches;
const integrationGates = new Set([10, 20, 34, 57]);
const upperJunction = { x: 218, y: 693 };
const lowerJunction = { x: 140, y: 820 };
export const integrationAxis = [upperJunction, lowerJunction] as const;
export const branchCenters = branches;
export type ActivationInk = "none" | "design" | "personality" | "both";
export const channelInk = { design: "#32bd7a", personality: "#4fa7ef", inactive: "#46544e", edge: "#7f8c83" };

// Midpoints of the original Integration ribbon end edges, not the offset label ports.
const integrationInkEnds: Record<number, readonly [Point, Point]> = {
  10: [{ x: 223.93, y: 692.975 }, { x: 342.445, y: 691.51 }],
  20: [{ x: 354.66, y: 489.575 }, { x: 217.815, y: 700.46 }],
  34: [{ x: 136.355, y: 826.745 }, { x: 349.355, y: 975.05 }],
  57: [{ x: 140.61, y: 819.43 }, { x: 72.1, y: 925.03 }],
};

export function gateInkPartition(gate: number) {
  const channel = runtime.channels.find(c => c.gates.includes(gate) && !isIntegration(c.gates));
  const [a, b] = integrationInkEnds[gate] ?? (channel ? channel.gates.map(g => branches[g]) : [branches[gate], gatePorts[gate]]);
  const dx = b.x - a.x, dy = b.y - a.y;
  const reverse = Math.abs(dy) < Math.abs(dx) * 0.1 ? dx < 0 : dy < 0;
  return { pivot: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, direction: { x: dx * (reverse ? -1 : 1), y: dy * (reverse ? -1 : 1) } };
}

export function activationInk(gates: readonly number[], activations: readonly Activation[]): ActivationInk {
  const matches = activations.filter((a) => gates.includes(a.gate));
  const design = matches.some((a) => a.side === "design");
  const personality = matches.some((a) => a.side === "personality");
  return design && personality ? "both" : design ? "design" : personality ? "personality" : "none";
}

// A clipping half-plane separates the shared Integration trunk at its midpoint.
export function halfPlane(pivot: Point, direction: Point, side = 1) {
  const length = Math.hypot(direction.x, direction.y);
  if (!length) throw Error("BodyGraph clipping axis has zero length");
  const dx = direction.x / length * 2000, dy = direction.y / length * 2000;
  const nx = -dy * side, ny = dx * side;
  return routePath([
    { x: pivot.x - dx, y: pivot.y - dy },
    { x: pivot.x + dx, y: pivot.y + dy },
    { x: pivot.x + dx + nx, y: pivot.y + dy + ny },
    { x: pivot.x - dx + nx, y: pivot.y - dy + ny },
  ]) + " Z";
}

export function isIntegration(gateNumbers: number[]) {
  return gateNumbers.length === 2 && gateNumbers.every((g) => integrationGates.has(g));
}

export const integrationChannels = runtime.channels.filter((c) => isIntegration(c.gates));

export function gateInkAxis(gate: number): Point {
  const channel = runtime.channels.find((c) => c.gates.includes(gate) && !isIntegration(c.gates));
  const [from, to] = channel
    ? channel.gates.map((g) => gatePorts[g])
    : [branches[gate], gatePorts[gate]];
  const dx = to.x - from.x, dy = to.y - from.y;
  const reverse = Math.abs(dy) < Math.abs(dx) * 0.1 ? dx < 0 : dy < 0;
  return { x: dx * (reverse ? -1 : 1), y: dy * (reverse ? -1 : 1) };
}

export function channelRoute(gateNumbers: number[]): Point[] {
  const [a, b] = gateNumbers;
  if (!gatePorts[a] || !gatePorts[b]) throw Error("Missing BodyGraph gate port");
  if (!isIntegration(gateNumbers))
    return [gatePorts[a], branches[a], branches[b], gatePorts[b]];
  const junction = (g: number) => g === 10 || g === 20 ? upperJunction : lowerJunction;
  const first = junction(a), last = junction(b);
  return [gatePorts[a], first, ...(first === last ? [] : [last]), gatePorts[b]];
}

export function routePath(points: Point[]) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

// The common trunk is defined only by a completed cross-junction channel.
export function integrationState(activeGates: readonly number[]) {
  return {
    GateConnect10: activeGates.includes(10),
    GateConnect34: activeGates.includes(34),
    GateSpan: [10, 20].some((g) => activeGates.includes(g)) &&
      [34, 57].some((g) => activeGates.includes(g)),
  };
}

export const channelGeometry = runtime.channels.map((channel) => ({
  channel,
  integration: isIntegration(channel.gates),
  path: routePath(channelRoute(channel.gates)),
}));
