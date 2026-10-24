import { CENTER_NAMES } from "../domain/contracts";
import { mechanicsTraceFor } from "../domain/composite";
import { canonicalJson, contentHash } from "../domain/composite-hash";
import type { CompositeCalculationV1, MechanicsFactV1 } from "../domain/composite-contracts";
import { relationshipClaimTrace, validateRelationshipReport } from "./relationship";
import type { RelationshipReportV1 } from "./relationship-contracts";
import { candidateRuleGate, PAIR_RULES } from "./relationship-rule-policy";
import type { RequirementStatusV1, StructuralClaimV1, StructuralReadingV1, StructuralTraceV1 } from "./relationship-phase1-contracts";

export const STRUCTURAL_READING_VERSION="CM04b-phase1-1.0.0" as const;
const lensNames=[['friendship','Friendship'],['sexual-attraction','Sexual attraction'],['sexual-sustainability','Sexual sustainability'],['romantic-bonding','Romantic bonding'],['long-term','Long-term partnership'],['intellectual','Intellectual connection'],['communication','Communication'],['emotional','Emotional dynamics'],['pacing','Pacing and endurance'],['autonomy','Autonomy'],['reciprocity','Reciprocity'],['friction','Friction'],['coexistence','Ordinary coexistence']];
const pathwayNames=[['A','Mental expression'],['B','Emotional contract'],['C','Caretaking and responsibility'],['D','Sacral and autonomy']];
const fieldNames=['Initiating conditions','Verified structure','Possible manifestations','Maintaining loop','Repair or interruption','Disconfirmation and alternatives'];
const synthesisNames=['Structural finding','Potential attraction','Long-term mechanisms','Emotional and mental friction','Feedback loop','Each person\'s contribution','Separation','Relationship context','Confirmation, disconfirmation and alternatives'];
const blocked=(id:string,label:string):RequirementStatusV1=>({id,label,status:'blocked-source-review',reason:'Advanced interpretation requires reviewed pair rules, source permission and inference approval. Structural facts remain available separately.'});
export function advancedCoverage():StructuralReadingV1['coverage'] {return {lenses:lensNames.map(([id,label])=>blocked(id,label)),pathways:pathwayNames.map(([id,label])=>({id,label,fields:fieldNames.map((name,i)=>blocked(`${id}.${i+1}`,name))})),synthesis:synthesisNames.map((name,i)=>blocked(String.fromCharCode(65+i),name))};}

export function structuralReading(c:CompositeCalculationV1,report:RelationshipReportV1):StructuralReadingV1 {
 validateRelationshipReport(c,report);
 const q=report.request,id=`structural-reading:${contentHash([STRUCTURAL_READING_VERSION,q])}`,claims:StructuralClaimV1[]=[];
 const pair=q.scope==='A+B',people=pair?q.roles:[q.roles[q.scope==='A'?0:1]];
 const role=(personId:string)=>personId===q.roles[0]?'Person A':'Person B';
 const selected=q.selection,overview=selected.kind==='overview';
 const add=(key:string,ruleId:StructuralClaimV1['ruleId'],title:string,summary:string,details:string[],subjectPersonIds:string[],facts:MechanicsFactV1[],contributionIds:string[],selection=q.selection)=>{
  for(const fact of facts)mechanicsTraceFor(c,fact.id,{calculationId:q.calculationId});
  if(!pair&&contributionIds.some(id=>c.facts.contributions.find(x=>x.id===id)?.personId!==people[0]))throw Error('Foreign contribution cannot support an individual reading.');
  claims.push({id:`${id}:${key}`,ruleId,title,summary,details,subjectPersonIds,scope:q.scope,selection,provenance:{structuralSupport:{factIds:facts.map(x=>x.id),contributionIds:[...new Set(contributionIds)]},interpretiveSupport:[],contextOnly:{contributionIds:[],sourceRecordIds:[]},calculationDependency:q.inputRefs.map(x=>({...x})),userObservation:[]}});
 };
 if(!overview){
  const claim=report.claims.find(x=>x.id.endsWith(':mechanics'))!;
  const trace=relationshipClaimTrace(c,report,claim.id);
  add('selection','selection','What this selection adds',claim.text,['These are facts about this selected scope; feelings and personal behavior are not inferred.'],claim.subjectPersonIds,trace.facts,claim.supportingContributionIds);
 }
 if(pair){
  for(const join of c.facts.topology.actualJoins){
   if(!overview&&!(selected.kind==='witness'&&selected.id===join.witness.id))continue;
   const facts=c.facts.mechanicsFacts.filter(f=>f.predicate==='actual-island-join'&&(f.value as {witness:{id:string}}).witness.id===join.witness.id);
   const supports=join.witness.edges.flatMap(e=>e.endpoints.flatMap(x=>x.contributionIds));
   const path=join.witness.centers.map(x=>CENTER_NAMES[x]).join(' → ');
   const details=join.witness.edges.map(edge=>{
    const relation=c.facts.channelRelations.find(x=>x.channelId===edge.channelId)!;
    const endpoints=edge.endpoints.map(e=>`${e.gate}: ${[...new Set(e.contributionIds.map(id=>role(c.facts.contributions.find(x=>x.id===id)!.personId)))].join(' + ')}`).join('; ');
    return `${edge.channelId.replace('channel-','')} (${relation.classification}) · ${endpoints}.`;
   });
   add(`join:${join.witness.id}`,'D01',`${role(join.personId)}: a connection between natal islands`,`${role(join.personId)} has a verified connection between natal islands through ${path}. This changes the pair graph, not their natal chart.`,[...details,'This is one sufficient complete route. It is not claimed to be unique or necessary, and does not establish felt integration or dependence.'],[join.personId],facts,supports,{kind:'witness',id:join.witness.id,personId:join.personId});
  }
  if(overview){
   const t=c.facts.topology,g=t.combinedGraph;
   const inventory=c.facts.mechanicsFacts.filter(f=>f.predicate==='activation-contribution');
   if(t.deltas.combinedOnlyChannelIds.length===0&&t.deltas.combinedOnlyCenterIds.length===0&&t.actualJoins.length===0&&t.deltas.perPerson.every(x=>x.addedChannelIds.length===0&&x.addedCenterIds.length===0)){
    add('no-new-completion','D02','Company without a new structural completion','Together, these charts add no complete Channels, defined Centers or natal-island joins beyond their natal structures. A relationship does not need a new chart connection to matter.',['Neither novelty nor its absence establishes attraction, boredom, comfort or relationship quality. Individual histories and preferences can differ even when chart structures match.'],q.roles,inventory,c.facts.contributions.map(x=>x.id));
   }
   add('connectivity','D03','Definition is more than colored Centers',`The pair has ${g.definedCenters.length} defined Centers in ${g.componentCount} definition island${g.componentCount===1?'':'s'}. ${g.componentCount===0?'There is no defined network.':g.componentCount>1?'These areas do not form one connected network.':'The defined areas form one connected network.'}`,[...g.components.map(comp=>comp.centerIds.map(x=>CENTER_NAMES[x]).join(' + ')),...t.islandEffects.map(e=>`${role(e.personId)}: ${e.natalIslandCount} natal island(s); ${e.status==='no-natal-split'?'no natal split to join':e.status.replaceAll('-',' ')}.`),'Combined connectivity and a particular person\'s natal-island join are different findings. Neither measures compatibility.'],q.roles,inventory,c.facts.contributions.map(x=>x.id));
  }
 }
 for(const personId of people){
  if(!overview)continue;
  const input=c.inputs.find(x=>x.personId===personId)!,g=c.facts.topology.natalGraphs.find(x=>x.scope.personIds[0]===personId)!;
  const own=c.facts.contributions.filter(x=>x.personId===personId);
  add(`identity:${personId}`,'D04',`${role(personId)} keeps their natal identity`,`${role(personId)} remains natal ${input.facts.type}, ${input.facts.authority} Authority, Profile ${input.facts.profile}. Pair definition does not create a new natal identity.`,[`${g.componentCount} natal island(s). A partner's complete Channel or a newly defined pair Center does not replace this person's natal calculation.`, 'Authority is not evidence of consent, interest or a relationship outcome.'],[personId],c.facts.mechanicsFacts.filter(f=>f.predicate==='activation-contribution'&&f.subjectPersonIds.includes(personId)),own.map(x=>x.id));
 }
 return {schema:'StructuralReadingV1',version:STRUCTURAL_READING_VERSION,id,requestHash:contentHash(q),calculationId:c.calculationId,factsHash:c.factsHash,eligibility:c.facts.eligibility,claims,candidateGates:PAIR_RULES.map(rule=>candidateRuleGate(c,report,rule.id)),coverage:advancedCoverage(),advancedInterpretation:'not-implemented'};
}
export function validateStructuralReading(c:CompositeCalculationV1,report:RelationshipReportV1,reading:StructuralReadingV1){
 const expected=structuralReading(c,report);if(canonicalJson(expected)!==canonicalJson(reading))throw Error('Structural reading is altered, stale or outside its pinned context.');return expected;
}
export function structuralClaimTrace(c:CompositeCalculationV1,report:RelationshipReportV1,reading:StructuralReadingV1,claimId:string):StructuralTraceV1 {
 validateStructuralReading(c,report,reading);
 const claim=reading.claims.find(x=>x.id===claimId);if(!claim)throw Error('Claim is outside this structural reading.');
 const facts=new Map<string,MechanicsFactV1>();
 for(const id of claim.provenance.structuralSupport.factIds){const t=mechanicsTraceFor(c,id);for(const f of [t.fact,...t.dependencies])facts.set(f.id,f);}
 return {claim,facts:[...facts.values()],contributions:c.facts.contributions.filter(x=>claim.provenance.structuralSupport.contributionIds.includes(x.id)),provenance:claim.provenance};
}
