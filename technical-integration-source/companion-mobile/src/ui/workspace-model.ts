import {
  byId,
  centerId,
  channelId,
  gateId,
  gates,
  runtime,
} from "../content/records";
import {
  CENTER_NAMES,
  type CenterId,
  type HumanDesignFactsV1,
} from "../domain/contracts";
import { gateRef, channelRef } from "../intelligence/mechanics-references";

export type ChartFocus =
  | "type"
  | "authority"
  | "profile"
  | "centers"
  | "channels"
  | "activations";
export type Selection =
  | { kind: "chart"; focus?: ChartFocus }
  | { kind: "center"; id: CenterId }
  | { kind: "channel"; id: string }
  | { kind: "gate"; gate: number; line?: number; activationId?: string }
  | { kind: "definition"; island?: number };
export const chartSelection: Selection = { kind: "chart" };
export function selectionFromRecord(id: string): Selection | null {
  const doc = byId.get(id);
  if (!doc) return null;
  return doc.type === "channel"
    ? { kind: "channel", id }
    : {
        kind: "gate",
        gate: doc.gate_number!,
        ...(doc.line_number ? { line: doc.line_number } : {}),
      };
}
export function selectionRecord(selection: Selection) {
  return selection.kind === "channel"
    ? selection.id
    : selection.kind === "gate"
      ? `${gateId(selection.gate)}${selection.line ? `-line-${selection.line}` : ""}`
      : null;
}
export function selectionKey(selection: Selection) {
  return JSON.stringify(selection);
}
export function selectionTitle(
  selection: Selection,
  chart: HumanDesignFactsV1,
) {
  if (selection.kind === "center")
    return {
      title: "Center Mechanics",
      subtitle: `${CENTER_NAMES[selection.id]} / ${chart.centers.find((c) => c.id === selection.id)?.defined ? "Defined" : "Undefined"}`,
    };
  if (selection.kind === "channel")
    return {
      title: "Channel Mechanics",
      subtitle: runtime.channels.some(c=>c.id===selection.id)?channelRef(selection.id):"Channel unavailable",
    };
  if (selection.kind === "gate")
    return {
      title: "Gate Mechanics",
      subtitle: `${gateRef(selection.gate,selection.line)} / ${gates.get(selection.gate)?.display_short_name || ""}`,
    };
  if (selection.kind === "definition")
    return {
      title: "Definition Mechanics",
      subtitle:
        selection.island === undefined
          ? chart.definition
          : `Island ${selection.island + 1} / ${chart.definition}`,
    };
  return {
    title: "Chart Mechanics",
    subtitle: selection.focus
      ? selection.focus[0].toUpperCase() + selection.focus.slice(1)
      : "Natal structure",
  };
}
// Presentation-only relationships, read from existing facts/topology. No new chart derivation.
export function highlightFor(selection: Selection, chart: HumanDesignFactsV1) {
  let centers: CenterId[] = [],
    gateNumbers: number[] = [],
    channelIds: string[] = [];
  if (selection.kind === "center") {
    centers = [selection.id];
    gateNumbers = chart.activations
      .filter((a) => a.center === selection.id)
      .map((a) => a.gate);
    channelIds = chart.channels
      .filter((c) => c.centers.includes(selection.id))
      .map((c) => c.id);
  } else if (selection.kind === "channel") {
    const channel = runtime.channels.find((c) => c.id === selection.id);
    if (channel) {
      centers = channel.centers.map(centerId);
      gateNumbers = channel.gates;
      channelIds = [channel.id];
    }
  } else if (selection.kind === "gate") {
    const gate = gates.get(selection.gate);
    if (gate) {
      centers = [centerId(gate.center)];
      gateNumbers = [selection.gate];
      channelIds = runtime.channels
        .filter((c) => c.gates.includes(selection.gate))
        .map((c) => c.id);
    }
  } else if (selection.kind === "definition") {
    centers =
      selection.island === undefined
        ? chart.definitionIslands.flat()
        : chart.definitionIslands[selection.island] || [];
    channelIds = chart.channels
      .filter((c) => c.centers.every((center) => centers.includes(center)))
      .map((c) => c.id);
    gateNumbers = chart.activations
      .filter((a) => centers.includes(a.center))
      .map((a) => a.gate);
  } else if (selection.kind === "chart" && (!selection.focus || selection.focus === "type" || selection.focus === "centers" || selection.focus === "channels")) {
    centers = chart.centers.filter((c) => c.defined).map((c) => c.id);
    channelIds = chart.channels.map((c) => c.id);
    gateNumbers = chart.channels.flatMap((c) => c.gates);
  } else if (selection.kind === "chart" && selection.focus === "authority") {
    const authorityCenter: Record<string, CenterId> = { Emotional: "SolarPlexus", Sacral: "Sacral", Splenic: "Spleen", "Ego Manifested": "Ego", "Ego Projected": "Ego", "Self-Projected": "G" };
    const id = authorityCenter[chart.authority];
    centers = id ? [id] : chart.centers.filter(c => c.defined).map(c => c.id);
    channelIds = chart.channels.filter(c => c.centers.some(center => centers.includes(center))).map(c => c.id);
    gateNumbers = chart.channels.filter(c => channelIds.includes(c.id)).flatMap(c => c.gates);
  } else if (selection.kind === "chart" && selection.focus === "activations") {
    gateNumbers = chart.gates;
    centers = chart.activations.map(a => a.center);
  } else if (selection.focus === "profile") {
    gateNumbers = chart.activations
      .filter((a) => a.planet === "Sun")
      .map((a) => a.gate);
    centers = gateNumbers.map((g) => centerId(gates.get(g)!.center));
  }
  return {
    centers: [...new Set(centers)],
    gates: [...new Set(gateNumbers)],
    channels: [...new Set(channelIds)],
  };
}
export function relevantActivations(
  selection: Selection,
  chart: HumanDesignFactsV1,
) {
  if (selection.kind === "gate")
    return chart.activations.filter(
      (a) =>
        a.gate === selection.gate &&
        (selection.activationId === undefined || a.id === selection.activationId) &&
        (!selection.line || a.line === selection.line),
    );
  if (selection.kind === "chart")
    return chart.activations.filter(
      (a) => selection.focus !== "profile" || a.planet === "Sun",
    );
  const highlighted = highlightFor(selection, chart);
  return chart.activations.filter((a) =>
    selection.kind === "center"
      ? a.center === selection.id
      : highlighted.gates.includes(a.gate),
  );
}
export function channelState(id: string, chart: HumanDesignFactsV1) {
  const channel = runtime.channels.find((c) => c.id === id)!;
  const active = channel.gates.filter((g) => chart.gates.includes(g));
  return {
    channel,
    active,
    completed: chart.channels.some((c) => c.id === id),
    missing: channel.gates.filter((g) => !chart.gates.includes(g)),
  };
}
export function structureReason(chart: HumanDesignFactsV1, focus?: ChartFocus) {
  const defined = (id: CenterId) =>
    chart.centers.some((c) => c.id === id && c.defined);
  const motors = chart.definitionIslands
    .filter((island) => island.includes("Throat"))
    .flatMap((island) =>
      island.filter((id) =>
        ["Sacral", "SolarPlexus", "Ego", "Root"].includes(id),
      ),
    );
  if (focus === "profile")
    return `Profile ${chart.profile} comes from ${chart.activations
      .filter((a) => a.planet === "Sun")
      .map((a) => `${a.side} Sun ${a.gate}.${a.line}`)
      .join(" / ")}. Personality Sun Line precedes Design Sun Line.`;
  if (focus === "authority") {
    const reasons: Record<string, string> = {
      Lunar:
        "No Centers are defined; the existing resolver assigns Lunar Authority to the Reflector structure.",
      Emotional:
        "Solar Plexus is defined. This takes priority over other defined Centers in the existing Authority resolver.",
      Sacral:
        "Solar Plexus is undefined and Sacral is defined; the existing resolver selects Sacral Authority.",
      Splenic:
        "Solar Plexus and Sacral are undefined; Spleen is defined, selecting Splenic Authority.",
      "Ego Manifested":
        "Higher-priority Authority Centers are undefined; Ego and Throat belong to the same defined island.",
      "Ego Projected":
        "Higher-priority Authority Centers are undefined; Ego and Identity / G share a defined island, without an Ego-to-Throat island connection.",
      "Self-Projected":
        "Higher-priority Authority conditions are absent; Identity / G and Throat share a defined island.",
      "Environmental / Mental Projected":
        "None of the higher-priority Authority conditions applies in the existing resolver. Inspect the actual Center and Channel facts below.",
    };
    return `${chart.authority}. ${reasons[chart.authority] || "Inspect the calculated Center and Channel facts below."}`;
  }
  if (focus === "type")
    return `${chart.type}. Sacral is ${defined("Sacral") ? "defined" : "undefined"}. ${motors.length ? `The Throat's defined island contains motor Center(s): ${motors.map((c) => CENTER_NAMES[c]).join(", ")}.` : "No completed-Channel island connects a motor Center to Throat."} ${chart.channels.length ? `The ${chart.channels.length} completed Channels below establish this structure.` : "There are no completed Channels or defined Centers."}`;
  return "Completed Channels define their endpoint Centers. Connected components of those completed Channels form the chart's Definition islands.";
}
export { channelId };
