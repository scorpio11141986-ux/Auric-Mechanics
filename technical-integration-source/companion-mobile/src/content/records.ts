import rawRuntime from "../../assets/app1_runtime.min.json";
import rawDocs from "../../assets/app2_documents.json";
import rawConfig from "../../assets/query_config.json";
import pin from "../../assets/dataset-pin.json";
import type { CenterId } from "../domain/contracts";

export type Block = {
  block_id: string;
  text: string;
  authority: string;
  classification: string;
  lineage: string;
};
export type AppContent = {
  sections: Record<string, Block[]>;
  canonical_boundary: string;
  interpretive_boundary: string;
  lineage: Record<string, string>;
};
export type LineRecord = {
  id: string;
  gate_number: number;
  line_number: number;
  gate_line: string;
  traditional_title: string;
  mechanical_kernel: string;
  deep_mechanics: string;
  coherent_expression: string;
  distorted_expression: string;
  harmonic_channel_interaction: string;
  boundary_nonclaim: string;
  source_comparison_reasoning: string;
  source_relationship_note: string;
  provenance: Record<string, string>;
  humdes_fixing_labels: string;
  source2_anomaly_note: string | null;
};
export type GateRecord = {
  id: string;
  gate_number: number;
  traditional_name: string;
  display_short_name: string;
  center: string;
  source5_evidence_completeness: string;
  source6: {
    mechanical_core: string;
    gate_synthesis: string;
    boundary_nonclaim: string;
    source_resolution: string;
    center_logic: string;
    process_arc: string;
    channel_expression: string;
    recognition_signals: string[];
  };
  lines: LineRecord[];
  app_content: AppContent;
};
export type ChannelRecord = {
  id: string;
  pair: string;
  name: string;
  gates: number[];
  centers: string[];
  circuit: string;
  mechanical_category: string;
  substream: string;
  energy_movement: string;
  defined_expression: string;
  hanging_gate_a: string;
  hanging_gate_b: string;
  composite_mechanics: string;
  conditioning_deconditioning: string;
  mechanical_kernel: string;
  coherent_expression: string;
  distorted_expression: string;
  boundary_nonclaim: string;
  source_disagreement: string;
  source_agreement: string;
  source_relationship_note: string;
  source_urls: string[];
  app_content: AppContent;
};
export type SearchDoc = {
  id: string;
  type: "gate" | "line" | "channel";
  title: string;
  aliases: string[];
  tags: string[];
  gate_number?: number;
  line_number?: number;
  channel_pair?: string;
  center?: string;
  centers?: string[];
  gate_numbers?: number[];
  fields: Record<string, string>;
};
export const runtime = rawRuntime as unknown as {
  gates: GateRecord[];
  channels: ChannelRecord[];
  version: string;
};
export const documents = rawDocs.documents as unknown as SearchDoc[];
export const queryConfig = rawConfig;
export const datasetPin = pin;
export function validateCatalog(data: typeof runtime, docs: SearchDoc[]) {
  const ids = docs.map((d) => d.id);
  if (data.gates.length !== 64 || data.channels.length !== 36 || docs.length !== 484 || new Set(ids).size !== 484)
    throw Error("Invalid canonical catalog: counts or duplicate identities");
  const actual = new Set<string>();
  for (const gate of data.gates) {
    if (gate.id !== gateId(gate.gate_number) || gate.gate_number < 1 || gate.gate_number > 64 || gate.lines.length !== 6 || actual.has(gate.id))
      throw Error("Invalid canonical Gate identity");
    actual.add(gate.id);
    for (const line of gate.lines) {
      if (line.gate_number !== gate.gate_number || line.line_number < 1 || line.line_number > 6 || line.id !== `${gate.id}-line-${line.line_number}` || actual.has(line.id) ||
        !line.provenance || !/^[a-f0-9]{64}$/.test(line.provenance.source_1_record_sha256 || "") || !/^[a-f0-9]{64}$/.test(line.provenance.source_2_record_sha256 || ""))
        throw Error("Invalid canonical Line identity/provenance");
      actual.add(line.id);
    }
  }
  for (const channel of data.channels) {
    const members = [...channel.gates].sort((a, b) => a - b);
    if (members.length !== 2 || members[0] === members[1] || !members.every((n) => actual.has(gateId(n))) ||
      channel.id !== `channel-${channel.gates.map((n) => String(n).padStart(2, "0")).join("-")}` || actual.has(channel.id) ||
      channel.source_urls.some((url) => { try { return new URL(url).protocol !== "https:"; } catch { return true; } }))
      throw Error("Invalid canonical Channel identity/provenance");
    actual.add(channel.id);
  }
  if (ids.some((id) => !actual.has(id))) throw Error("Canonical retrieval identity missing from runtime");
}
validateCatalog(runtime, documents);
export const gates = new Map(runtime.gates.map((g) => [g.gate_number, g]));
export const channels = new Map(runtime.channels.map((c) => [c.id, c]));
export const lines = new Map(
  runtime.gates.flatMap((g) => g.lines).map((l) => [l.id, l]),
);
export const byId = new Map(documents.map((d) => [d.id, d]));
export function gateId(n: number) {
  return `gate-${String(n).padStart(2, "0")}`;
}
export function channelId(a: number, b: number) {
  return (
    runtime.channels.find(
      (c) => c.gates.includes(a) && c.gates.includes(b) && a !== b,
    )?.id ||
    `channel-${[a, b]
      .sort((x, y) => x - y)
      .map((n) => String(n).padStart(2, "0"))
      .join("-")}`
  );
}
export function centerId(name: string): CenterId {
  const lookup: Record<string, CenterId> = {
    "Head/Crown Center": "Head",
    "Third Eye/Ajna Center": "Ajna",
    "Throat Center": "Throat",
    "G/Identity Center": "G",
    "Ego/Will Center": "Ego",
    "Heart/Ego Center": "Ego",
    "Spleen Center": "Spleen",
    "Solar Plexus/Emotional Center": "SolarPlexus",
    "Sacral Center": "Sacral",
    "Root Center": "Root",
  };
  if (!lookup[name]) throw Error(`Unrecognized canonical center: ${name}`);
  return lookup[name];
}
export function recordFor(
  id: string,
): GateRecord | ChannelRecord | LineRecord | undefined {
  return (
    lines.get(id) || channels.get(id) || runtime.gates.find((g) => g.id === id)
  );
}
