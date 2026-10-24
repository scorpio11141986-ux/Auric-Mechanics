import { CENTER_NAMES, type CenterId, type HumanDesignFactsV1 } from "../domain/contracts";
import { gates, centerId, runtime } from "../content/records";
import { channelState, relevantActivations, structureReason, type Selection } from "./workspace-model";
import { labelMechanics } from "../intelligence/reader-names";

const names = (ids: HumanDesignFactsV1["definitionIslands"][number]) => ids.map(id => CENTER_NAMES[id]).join(" + ");
const channelName = (id: string) => {
  const channel = runtime.channels.find(c => c.id === id)!;
  return `${channel.pair} (${channel.name}; ${channel.centers.map(center => CENTER_NAMES[centerId(center)]).join(" - ")})`;
};
function rawInspectorReading(selection: Selection, chart: HumanDesignFactsV1) {
  const contributions = relevantActivations(selection, chart);
  const planets = contributions.map(a => `${a.side === "design" ? "Design" : "Personality"} ${a.planet} ${a.gate}.${a.line}`).join("; ");
  const islandFor = (id: CenterId) => chart.definitionIslands.findIndex(island => island.includes(id));
  if (selection.kind === "gate") {
    const gate = gates.get(selection.gate)!;
    const center = CENTER_NAMES[centerId(gate.center)];
    const connected = chart.channels.filter(c => c.gates.includes(selection.gate));
    const missing = runtime.channels.filter(c => c.gates.includes(selection.gate) && !connected.some(active => active.id === c.id)).map(c => c.gates.filter(g => !chart.gates.includes(g))).flat();
    return {
      personal: !!contributions.length,
      summary: contributions.length
        ? `Gate ${selection.gate}${selection.line ? `.${selection.line}` : ""} is active in your ${center}. ${connected.length ? `It participates in ${connected.length} completed Channel${connected.length === 1 ? "" : "s"} in this chart.` : "It is a hanging activation: it does not complete a Channel here."}`
        : `This ${selection.line ? "exact Line or activation" : "Gate"} is reference-only for this chart. Its source meaning is not a verified personal activation.`,
      paragraphs: contributions.length ? [
        `The actual contributions are ${planets}.`,
        connected.length ? `The completed connection${connected.length === 1 ? " is" : "s are"} ${connected.map(c => channelName(c.id)).join("; ")}. These connections, not Gate ${selection.gate} alone, define their endpoint Centers.`
          : `The missing harmonic Gate${missing.length === 1 ? " is" : "s are"} ${[...new Set(missing)].join(", ")}. A hanging Gate is not a complete connection and cannot by itself define a Center or bridge islands.`,
      ] : ["Other activations of this Gate, if present at a different Line, do not make this selected Line or activation active."],
      limitation: "Activation describes chart structure; it does not establish a fixed personality or behavioral outcome.",
    };
  }
  if (selection.kind === "channel") {
    const state = channelState(selection.id, chart);
    return {
      personal: state.completed,
      summary: state.completed
        ? `${state.channel.name} (${state.channel.pair}) is a complete connection between ${state.channel.centers.map(c => CENTER_NAMES[centerId(c)]).join(" and ")} in your chart.`
        : `${state.channel.name} (${state.channel.pair}) is not complete in your chart. ${state.active.length ? `Gate ${state.active.join(" and ")} is active, but ${state.missing.join(" and ")} is missing.` : "Neither endpoint is active."}`,
      paragraphs: state.completed ? [
        `Both endpoint Gates ${state.channel.gates.join(" and ")} are activated by ${planets}. This Channel defines both endpoint Centers and places them in the same connected island.`,
        `It belongs to Island ${islandFor(centerId(state.channel.centers[0])) + 1}: ${names(chart.definitionIslands[islandFor(centerId(state.channel.centers[0]))] || [])}. Its canonical theme below is an interpretive possibility, not a prediction.`,
      ] : ["The source description below is reference context, not a completed natal Channel. Missing endpoints are not silently filled by a partner, transit or assumption."],
      limitation: "No relationship or transit calculation is being applied to this natal selection.",
    };
  }
  if (selection.kind === "center") {
    const completed = chart.channels.filter(c => c.centers.includes(selection.id));
    const defined = chart.centers.find(c => c.id === selection.id)?.defined;
    return {
      personal: true,
      summary: defined
        ? `Your ${CENTER_NAMES[selection.id]} is defined through ${completed.map(c => channelName(c.id)).join("; ")}. It is part of Island ${islandFor(selection.id) + 1}, connected with ${names(chart.definitionIslands[islandFor(selection.id)] || [])}.`
        : `Your ${CENTER_NAMES[selection.id]} is undefined: no completed natal Channel connects to it. ${contributions.length ? `Its ${[...new Set(contributions.map(a => a.gate))].length} activated Gate(s) do not change that.` : "There are no natal Gate activations in this Center."}`,
      paragraphs: [defined
        ? "Here, defined means these endpoint connections are present in the calculated natal structure. It is not a measure of strength, health or how consistently you behave."
        : "Here, undefined means absent completed connections, not that a function is missing or that a psychological trait can be inferred."],
      limitation: "The pinned corpus has no separate Center teaching record. This is a chart-specific structural reading; inspect contributing Gates or Channels for their actual source meanings.",
    };
  }
  if (selection.kind === "definition") {
    const selected = selection.island === undefined ? chart.definitionIslands.map((_, i) => i) : [selection.island];
    return {
      personal: true,
      summary: `${chart.definition}: your completed Channels form ${chart.definitionIslands.length} separate connected group${chart.definitionIslands.length === 1 ? "" : "s"} of defined Centers. ${chart.definitionIslands.length > 1 ? "No completed natal Channel path joins those groups in this chart." : chart.definitionIslands.length ? "All defined Centers belong to one connected group." : "There are no defined Centers or completed Channels."}`,
      paragraphs: selected.filter(i => !!chart.definitionIslands[i]).map(i => `Island ${i + 1}: ${names(chart.definitionIslands[i])}. Connected by ${chart.channels.filter(c => c.centers.every(center => chart.definitionIslands[i].includes(center))).map(c => channelName(c.id)).join("; ")}.`),
      limitation: "Separate islands are structural, not a diagnosis of fragmentation or a prediction about needing other people. Full bridge-path analysis and a separate Definition teaching record are not available; no bridge recommendation is invented.",
    };
  }
  return {
    personal: true,
    summary: selection.focus === "centers" ? `Your defined Centers are ${names(chart.centers.filter(c => c.defined).map(c => c.id)) || "none"}. They are defined by ${chart.channels.map(c => channelName(c.id)).join("; ") || "no completed Channels"}.`
      : selection.focus === "channels" ? `Your ${chart.channels.length} completed Channels are ${chart.channels.map(c => channelName(c.id)).join("; ") || "none"}. Each has both activated endpoints; incomplete connections are not counted here.`
      : selection.focus === "activations" ? `This chart has ${chart.activations.length} planetary contributions: ${planets}. Repeated Gates retain their distinct planets, Lines and Design/Personality ownership.`
      : selection.focus ? structureReason(chart, selection.focus) : `Your calculated chart is ${chart.type}, with ${chart.authority} Authority, Profile ${chart.profile} and ${chart.definition}. Its ${chart.channels.length} completed Channels connect ${chart.centers.filter(c => c.defined).length} defined Centers into ${chart.definitionIslands.length} island(s).`,
    paragraphs: selection.focus ? [] : chart.definitionIslands.map((island, i) => `Island ${i + 1}: ${names(island)}.`),
    limitation: "This explains the calculated natal structure. Whole-chart personal synthesis and Type/Authority teaching records are not supplied by the pinned corpus; no generic teaching is substituted as a sourced personal reading.",
  };
}
export function inspectorReading(selection: Selection, chart: HumanDesignFactsV1) {
  const reading=rawInspectorReading(selection,chart);
  return {...reading,summary:labelMechanics(reading.summary),paragraphs:reading.paragraphs.map(text=>labelMechanics(text))};
}
