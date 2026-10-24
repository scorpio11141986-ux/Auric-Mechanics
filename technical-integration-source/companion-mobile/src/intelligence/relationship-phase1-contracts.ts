import type { CompositeSelection } from "../ui/composite-workspace-model";
import type { CompositeContributionV1, MechanicsFactV1 } from "../domain/composite-contracts";
import type { ReportRequestV1 } from "./relationship-contracts";

export type SourceFieldRefV1={recordId:string;field:string;sha256:string};
export type PairRuleV1={schema:"PairRuleV1";id:string;version:string;scope:"two-person-natal-pair";channelId:string;classification:"compromise"|"electromagnetic"|"companionship";exactLine:number|null;sourceFields:SourceFieldRefV1[];hash:string;enabled:false};
export type RuleReviewReceiptV1={schema:"RuleReviewReceiptV1";ruleId:string;ruleHash:string;sourceFields:SourceFieldRefV1[];scope:"two-person-natal-pair";sourceReview:string;inferenceReview:string;permissionGrant:string;ownerApproval:string;allowedUse:"private-internal-evaluation"|"commercial";issuedAt:string;expiresAt:string};
export type ReceiptTrustPolicyV1={trustedReceiptHashes:readonly string[];revokedReceiptHashes:readonly string[];allowedUse:RuleReviewReceiptV1["allowedUse"]};
export type RuleGateV1={ruleId:string;eligible:false;reasons:string[];ruleHash:string};
export type ProvenanceRolesV1={structuralSupport:{factIds:string[];contributionIds:string[]};interpretiveSupport:SourceFieldRefV1[];contextOnly:{contributionIds:string[];sourceRecordIds:string[]};calculationDependency:ReportRequestV1["inputRefs"];userObservation:string[]};
export type StructuralClaimV1={id:string;ruleId:"D01"|"D02"|"D03"|"D04"|"selection";title:string;summary:string;details:string[];subjectPersonIds:string[];scope:ReportRequestV1["scope"];selection:CompositeSelection;provenance:ProvenanceRolesV1};
export type RequirementStatusV1={id:string;label:string;status:"blocked-source-review";reason:string};
export type StructuralReadingV1={schema:"StructuralReadingV1";version:"CM04b-phase1-1.0.0";id:string;requestHash:string;calculationId:string;factsHash:string;eligibility:"exact-point"|"provisional-point";claims:StructuralClaimV1[];candidateGates:RuleGateV1[];coverage:{lenses:RequirementStatusV1[];pathways:{id:string;label:string;fields:RequirementStatusV1[]}[];synthesis:RequirementStatusV1[]};advancedInterpretation:"not-implemented"};
export type StructuralTraceV1={claim:StructuralClaimV1;facts:MechanicsFactV1[];contributions:CompositeContributionV1[];provenance:ProvenanceRolesV1};
