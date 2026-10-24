import type { CompositeContributionV1, CompositePinsV1 } from "../domain/composite-contracts";
import type { CompositeMode, CompositeScope, CompositeSelection } from "../ui/composite-workspace-model";

export type RelationshipContext = "general" | "friendship" | "romantic";
export type RelationshipIntent = "explain" | "differences" | "observe";
export type ReportRequestV1 = {
  schema:"ReportRequestV1"; relationshipId:string; calculationId:string; factsHash:string;
  inputRefs:{personId:string;chartVersionId:string;snapshotHash:string}[];
  catalogSHA256:string; canonicalSHA256:string; ruleVersion:"CM04a-1.0.0";
  roles:[string,string]; mode:CompositeMode; scope:CompositeScope; context:RelationshipContext;
  selection:CompositeSelection; question:string; intent:RelationshipIntent;
  observation:null|{text:string;consented:true}; requestedAt:string|null;
};
export type RelationshipClaimV1 = {
  id:string; kind:"deterministicFact"|"canonicalInterpretation"|"derivedHypothesis"|"userReportedExperience";
  status:"supported"|"insufficientEvidence"; text:string; subjectPersonIds:string[];
  scope:CompositeScope; factIds:string[]; supportingContributionIds:string[]; sourceRecordIds:string[];
  ruleVersion:"CM04a-1.0.0"; alternatives:string[]; nonclaims:string[];
};
export type ReportEvidencePacketV1 = {
  schema:"ReportEvidencePacketV1"; id:string; calculationId:string; factsHash:string;
  pins:CompositePinsV1; scope:CompositeScope; graphIds:string[]; inputRefs:ReportRequestV1["inputRefs"];
  factIds:string[]; contributions:CompositeContributionV1[];
  sources:{id:string;title:string;status:"reference-only"|"quarantined";reason:string}[];
  rights:"private-internal-evaluation-only"; ruleVersion:"CM04a-1.0.0";
};
export type RelationshipReportV1 = {
  schema:"RelationshipReportV1"; id:string; revisionId:string; parentRevisionId:null;
  status:"ready"|"unsupported"; reason:string|null; request:ReportRequestV1;
  eligibility:"exact-point"|"provisional-point"|null; evidence:ReportEvidencePacketV1|null;
  claims:RelationshipClaimV1[]; nonclaims:string[];
  sourceInterpretation:"withheld-no-vetted-pair-rule"; advancedReport:"not-implemented";
};
/** Persist requests, never trust imported calculated facts or generated prose. */
export type RelationshipReadingEntryV1 = {schema:"RelationshipReadingEntryV1";id:string;request:ReportRequestV1};
