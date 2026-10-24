import type { SavedQuestion } from "../domain/contracts";

export function traceFor(question: SavedQuestion, claimIndex: number | null) {
  const claim =
    claimIndex === null ? undefined : question.response?.claims[claimIndex];
  // An invalid claim must not silently widen into unrelated evidence.
  const evidence =
    claimIndex === null
      ? question.context.evidence
      : question.context.evidence.filter((e) =>
          claim?.evidenceIds.includes(e.id),
        );
  const factIds = new Set([...evidence.flatMap((e) => e.supportingFactIds), ...(claim?.factIds || [])]);
  return {
    claim,
    evidence,
    facts: question.context.facts.filter((f) => factIds.has(f.id)),
  };
}
