import { calculateChart } from "../domain/calculator";
import { calculateComposite, createParticipantSnapshot } from "../domain/composite";
import type { BirthRecordV1 } from "../domain/contracts";

// Invented adults from the supplied design packet. Recalculate through native
// issuance; saved JSON facts and the authored example prose are never authority.
const REVISION = "2026-10-22T00:00:00.000Z";
function input(id: string, name: string, date: string, confidence: "exact" | "approximate" = "exact"): BirthRecordV1 {
  return { schema: "BirthRecordV1", id, name, date, localTime: "12:00", timezone: "UTC",
    latitude: 0, longitude: 0, place: "Fictional UTC coordinate fixture; not a real person",
    confidence, source: "user-entered", updatedAt: REVISION };
}
function issue(birth: BirthRecordV1) {
  return createParticipantSnapshot({ origin: "application-calculated", personId: birth.id,
    chartVersionId: `${birth.id}:${birth.updatedAt}`, birth, facts: calculateChart(birth) });
}
export function readingDemoFixtures() {
  const rowan = issue(input("design-a", "Rowan (synthetic)", "1981-12-24"));
  const mira = issue(input("design-b", "Mira (synthetic)", "1972-01-13"));
  return { rowan, mira, pair: calculateComposite(rowan, mira,{computedAt:REVISION}),
    names: { "design-a": "Rowan", "design-b": "Mira" } as Record<string, string> };
}
export function sparseReadingFixture() {
  return issue(input("design-sparse", "Sparse synthetic chart", "1971-04-21"));
}
export function provisionalReadingFixture() {
  return issue(input("design-provisional", "Provisional synthetic chart", "1981-12-24", "approximate"));
}
export function zeroNetworkReadingFixture() {
  const a = issue(input("design-zero-a", "Zero A (synthetic)", "1971-04-21"));
  const b = issue(input("design-zero-b", "Zero B (synthetic)", "1971-04-21"));
  return calculateComposite(a, b,{computedAt:REVISION});
}
export function designPreviewRuntimeEnabled(development: boolean, flag: unknown): boolean {
  return development === true && flag === "1";
}
