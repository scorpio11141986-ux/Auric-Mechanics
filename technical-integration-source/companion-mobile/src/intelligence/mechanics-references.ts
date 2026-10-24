import { centerId, channels, gates } from "../content/records";
import { CENTER_NAMES } from "../domain/contracts";

export function gateRef(gate: number, line?: number): string {
  const record = gates.get(gate);
  if (!Number.isInteger(gate) || !record) throw Error("Unknown canonical Gate.");
  if (line !== undefined && (!Number.isInteger(line) || line < 1 || line > 6)) throw Error("Unknown canonical Line.");
  return `Gate ${gate}${line === undefined ? "" : `.${line}`} (${CENTER_NAMES[centerId(record.center)]} Center)`;
}

export function channelRef(channelId: string): string {
  const record = channels.get(channelId);
  if (!record) throw Error("Unknown canonical Channel.");
  return `Channel ${record.gates.join("\u2013")} (${record.centers.map(c => CENTER_NAMES[centerId(c)]).join(" \u2194 ")})`;
}
