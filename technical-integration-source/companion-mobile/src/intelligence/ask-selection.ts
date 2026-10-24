import { gateId, gates } from "../content/records";
import type { Activation, HumanDesignFactsV1 } from "../domain/contracts";
import { highlightFor, relevantActivations, type Selection } from "../ui/workspace-model";

export type ActivationBinding = {
  activationId: string;
  side: Activation["side"];
  planet: string;
  gate: number;
  line: number | null;
  center: Activation["center"];
  lineStatus: "exact-point" | "uncertain-withheld";
  sourceRecordId: string | null;
};
export const exactLineEligible = (chart: HumanDesignFactsV1, a: Activation) =>
  !a.boundaryRisk && !chart.uncertainty.some(s => s.startsWith("Approximate birth time"));

function invalid(message: string): never { throw Error(`Invalid request selection: ${message}`); }
export function validateAskSelection(value: unknown, chart: HumanDesignFactsV1): Selection {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("a versioned target is required");
  const s = value as Selection;
  const keys: Record<string, string[]> = {
    chart: ["kind", "focus"], center: ["kind", "id"], channel: ["kind", "id"],
    gate: ["kind", "gate", "line", "activationId"], definition: ["kind", "island"],
  };
  if (!keys[s.kind] || Object.keys(s).some(k => !keys[s.kind].includes(k))) invalid("unsupported target fields");
  if (s.kind === "chart" && s.focus !== undefined && !["type", "authority", "profile", "centers", "channels", "activations"].includes(s.focus)) invalid("unknown chart focus");
  if (s.kind === "center" && !chart.centers.some(c => c.id === s.id)) invalid("Center absent from this chart");
  if (s.kind === "channel" && !chart.channels.some(c => c.id === s.id)) invalid("Channel is not complete in this natal chart; use reference lookup");
  if (s.kind === "gate") {
    if (!Number.isInteger(s.gate) || !gates.has(s.gate) || !chart.gates.includes(s.gate)) invalid("Gate absent from this chart");
    if (s.line !== undefined && (!Number.isInteger(s.line) || s.line < 1 || s.line > 6)) invalid("invalid Line");
    if (s.activationId !== undefined && (typeof s.activationId !== "string" || !chart.activations.some(a => a.id === s.activationId && a.gate === s.gate && (s.line === undefined || a.line === s.line)))) invalid("activation does not match the selected Gate.Line");
    if (!relevantActivations(s, chart).length) invalid("Line absent from this chart");
  }
  if (s.kind === "definition" && s.island !== undefined && (!Number.isInteger(s.island) || !chart.definitionIslands[s.island])) invalid("definition island absent from this chart");
  return JSON.parse(JSON.stringify(s));
}

// Planet names select calculated occurrences, never fixing-planet text in the corpus.
export function planetaryActivations(question: string, chart: HumanDesignFactsV1): Activation[] | null {
  const roles = [...question.matchAll(/\b(?:(personality|design)\s+)?(north\s+node|south\s+node|sun|earth|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)\b/gi)];
  if (!roles.length) return null;
  return chart.activations.filter(a => roles.some(r =>
    (!r[1] || a.side === r[1].toLowerCase()) && a.planet.toLowerCase() === r[2].toLowerCase().replace(/\s+/g, " ")));
}

export function resolveAskSelection(question: string, chart: HumanDesignFactsV1, target?: Selection) {
  const selection = target === undefined ? undefined : validateAskSelection(target, chart);
  const planets = planetaryActivations(question, chart);
  const focused = selection && !(selection.kind === "chart" && !selection.focus);
  if (!focused && planets === null) return null; // Preserve the legacy general/exact lookup adapter.
  let activations = focused ? relevantActivations(selection, chart) : planets!;
  if (focused && planets !== null) {
    activations = activations.filter(a => planets.some(p => p.id === a.id));
    if (!activations.length) invalid("question's planetary occurrence is outside the selected object");
  }
  const ids = activations.map(a => exactLineEligible(chart, a) ? `${gateId(a.gate)}-line-${a.line}` : gateId(a.gate));
  if (selection?.kind === "channel") ids.unshift(selection.id);
  if (selection?.kind === "gate" && selection.line === undefined && !selection.activationId && planets === null) {
    ids.splice(0, ids.length, gateId(selection.gate));
  }
  if (selection && (selection.kind === "definition" || (selection.kind === "chart" && ["authority", "type", "channels"].includes(selection.focus || "")))) {
    const highlighted = highlightFor(selection, chart);
    const channelIds = chart.channels.filter(c => highlighted.channels.includes(c.id)).map(c => c.id);
    ids.unshift(...channelIds);
  }
  return { recordIds: [...new Set(ids)], activationIds: activations.map(a => a.id), selection: ids.length ? "exact" as const : "not-in-chart" as const };
}
