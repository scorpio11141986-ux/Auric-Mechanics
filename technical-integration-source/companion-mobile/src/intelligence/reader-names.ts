import { gates, runtime } from "../content/records";
import { gateRef, channelRef } from "./mechanics-references";

// Normalize inherited free-text explanations at the presentation boundary; source records stay exact.
export function labelMechanics(text: string, protectedNames: string[] = []): string {
  const names=[...new Set(protectedNames.filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(names.length){
    const pattern=new RegExp(`(${names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})`,"g");
    return text.split(pattern).map(part=>names.includes(part)?part:labelMechanics(part)).join("");
  }
  let value = text.replace(/\bGate (\d{1,2})(?:\.(\d))?(?![\d.])(?! \()/g, (original, gate, line) => gates.has(Number(gate))&&(!line||Number(line)>=1&&Number(line)<=6)?gateRef(Number(gate), line ? Number(line) : undefined):original);
  for (const record of runtime.channels) {
    const [a,b] = record.gates;
    const pattern = new RegExp(`(?:Channel )?\\b(?:${a}[-–]${b}|${b}[-–]${a})(?![\\d])(?! \\()`, "g");
    value = value.replace(pattern, channelRef(record.id));
  }
  return value;
}
