import { canonicalJson } from "../domain/composite-hash";
import type { RelationshipClaimV1, RelationshipReportV1 } from "../intelligence/relationship-contracts";
import type { StructuralClaimV1, StructuralReadingV1 } from "../intelligence/relationship-phase1-contracts";

export type ReadingLevel="compact"|"expanded"|"full";
export type ReadingGroup={claim:StructuralClaimV1;legacyAlias:RelationshipClaimV1|null};

/** Combine only the selected-fact adapter, never unrelated claims with similar wording. */
export function relationshipReadingPresentation(report:RelationshipReportV1,reading:StructuralReadingV1|null,level:ReadingLevel) {
 const findings=reading?(level==="compact"?reading.claims.slice(0,1):reading.claims):[];
 const visible=level==="compact"?report.claims.filter(x=>x.id.endsWith(":mechanics")||x.id.endsWith(":reflection")):report.claims;
 const used=new Set<string>();
 const groups:ReadingGroup[]=findings.map(claim=>{
  const legacyAlias=visible.find(x=>!used.has(x.id)&&claim.ruleId==="selection"&&x.id.endsWith(":mechanics")&&x.kind==="deterministicFact"&&x.status==="supported"&&x.text===claim.summary&&x.scope===claim.scope&&canonicalJson(x.subjectPersonIds)===canonicalJson(claim.subjectPersonIds)&&canonicalJson(x.factIds)===canonicalJson(claim.provenance.structuralSupport.factIds)&&canonicalJson(x.supportingContributionIds)===canonicalJson(claim.provenance.structuralSupport.contributionIds))||null;
  if(legacyAlias)used.add(legacyAlias.id);
  return {claim,legacyAlias};
 });
 return {groups,legacyClaims:visible.filter(x=>!used.has(x.id))};
}
