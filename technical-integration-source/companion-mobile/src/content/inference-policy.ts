import { byId, recordFor, type LineRecord } from "./records";

export const CONTENT_RIGHTS = {
  schema: "ContentRightsV1",
  status: "rights-unresolved",
  permittedEnvironment: "private-internal-evaluation",
  commercialRedistribution: false,
  sourceAuthentication: "recovered-not-original-authenticated",
} as const;

// This known September 29 finding was outside the later five-Line repair scope.
export const QUARANTINED_RECORDS: Record<string, string> = {
  "gate-39-line-3": "IA-02/IA-03: later repair of the unsupported generic-Line/adverse-pole wording has not been established. No personalized inference from this record.",
};

export function inferenceDisposition(id: string) {
  if (!byId.has(id) || !recordFor(id))
    return { allowed: false, reason: "Missing canonical identity" };
  if (QUARANTINED_RECORDS[id])
    return { allowed: false, reason: QUARANTINED_RECORDS[id] };
  const record = recordFor(id)!;
  if (byId.get(id)!.type === "line") {
    const provenance = (record as LineRecord).provenance;
    if (!provenance || Object.values(provenance).some((v) => typeof v !== "string"))
      return { allowed: false, reason: "Malformed exact-Line provenance" };
  }
  return { allowed: true, reason: "Private evaluation only; commercial rights and original-source authentication remain unresolved" };
}
