import { gateId, runtime } from "../content/records";
import { issueDesignPreviewScope } from "./eligibility";
import { readingDemoFixtures } from "./demo-fixtures";

/** Exact isolated synthetic cohort, shared by the real app and output harness. */
export function readingDemoSession() {
  const fixtures = readingDemoFixtures();
  const activations = [...fixtures.rowan.facts.activations, ...fixtures.mira.facts.activations];
  const existing = new Set(activations.map(a => a.gate));
  const cohort = [...activations.flatMap(a => [gateId(a.gate), `${gateId(a.gate)}-line-${a.line}`]),
    ...runtime.channels.filter(c => c.gates.some(g => existing.has(g))).map(c => c.id)];
  const capability = issueDesignPreviewScope({ cohort: [...new Set(cohort)], variantIds: ["r4"] });
  return { fixtures, capability };
}
