import type { ReaderFinding, AdaptiveReading } from "./relationship-reader";
import type { ReaderPreferencesV1 } from "./reader-preferences";

// Reading depth is independent of the legacy Compact / Expanded / Full container.
export function visibleReaderFindings(reading:AdaptiveReading,depth:ReaderPreferencesV1["depth"],overview:boolean):ReaderFinding[] {
  if(!overview)return reading.findings;
  return depth==="quick"?reading.findings.filter(f=>reading.narrative.featuredIds.includes(f.id)&&f.id!==reading.findings[0]?.id):reading.findings.slice(1);
}
