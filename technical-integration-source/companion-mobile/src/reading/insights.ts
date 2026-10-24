import { contentHash } from "../domain/composite-hash";
import type { CenterId } from "../domain/contracts";

/** Claims are symbolic design proposals, never approval receipts or behavior diagnoses. */
export type ReadingClaimKind = "computed-fact" | "sourced-symbolic" | "conditional-synthesis" | "user-observation" | "teaching" | "reflective-prompt";
export type ReadingDepth = "quick" | "standard" | "deep";
export type ReadingSelection = {kind:"whole"} | {kind:"activation";activationId:string} | {kind:"gate";gate:number} | {kind:"exact-line";gate:number;line:number;activationIds:string[]} | {kind:"channel";channelId:string} | {kind:"center";centerId:CenterId} | {kind:"component";componentId:string};
export type ClaimSource = {recordId:string;variantId:string;fieldKey:string;ref:unknown;text:string;shared:boolean;realization:"faithful-paraphrase-with-canonical-labels"};
export type ClaimScope = {context:"natal"|"composite";personIds:string[];chartRevisionIds:string[];worldIds:string[]};
export type SupportRoute = {factIds:string[];activationIds:string[];claimIds:string[]};
export type ReadingRule = {
  ruleId:string;version:"reading-design-rules-1";relation:"contextual-meaning"|"completed-endpoint-interaction"|"repeated-line-contrast"|"parallel-network-contrast"|"reciprocal-island-join"|"combined-topology-context"|"unfinished-path-consequence"|"directional-contribution"|"separation-persistence"|"coherent-distorted-alternative"|"optional-observation";
  premiseIds:string[];modifierRecordIds:string[];qualifications:string[];forbiddenInferences:string[];
  semanticStatus:"design-only";approvedForConsumer:false;
};
export type ReadingClaim = {
  argument?:{recipe:string;clauseKey:string;role:string;relationshipKeys:string[];breakBefore:boolean};
  schema:"AuricReadingClaimV1";claimId:string;kind:ReadingClaimKind;propositionKey:string;text:string;
  scope:ClaimScope;factIds:string[];activationIds:string[];sources:ClaimSource[];meaningPropositionIds:string[];
  requiredPremiseIds:string[];supportRoutes:SupportRoute[];rule:ReadingRule|null;
  alternatives:string[];qualifications:string[];disconfirmation:string[];forbiddenInferences:string[];
  publicationStatus:"design-only";realization:{mode:"deterministic-design";semanticApproval:"design-only"};
};
export type ReadingInsight = {
  insightId:string;propositionKey:string;mechanism:string;claimIds:string[];requiredPremiseIds:string[];
  sectionIds:string[];relationKind:ReadingRule["relation"]|"baseline";discoveryDepth:ReadingDepth;
  salienceReason:string;priority:number;noveltyAgainst:string[];necessityWitnessRefs:string[];
  semanticKey?:string;themeKey?:string;themeTitle?:string;expressedRelations?:string[];
  discoveryMeaning?:{conclusionKey?:string;meaningKeys:string[];consequenceKey:string;substantiveConsequence:boolean;predicate:string;scope?:'individual'|'pair-derived'|'natal-background'};
};
export const FORBIDDEN_INFERENCES = ["observed behavior", "diagnosis", "competence", "consent", "safety", "compatibility score", "shared natal Authority", "planet-role psychology without a modifier corpus", "side-specific psychology without a modifier corpus"];
export class ReadingEngineError extends Error {
  constructor(public readonly code:string,message:string){super(message);this.name="ReadingEngineError";}
}
export function readingFail(code:string,message:string):never{throw new ReadingEngineError(code,message);}
export const unique = <T>(items:T[]) => [...new Set(items)];

export function makeClaim(input:Omit<ReadingClaim,"schema"|"claimId"|"publicationStatus"|"realization">):ReadingClaim {
  if(!input.text.trim() || input.text.length>24000) readingFail("UNSUPPORTED_VISIBLE_CLAIM","A reading assertion is missing or too large.");
  if(!input.supportRoutes.length || input.supportRoutes.some(r=>!r.factIds.length&&!r.activationIds.length&&!r.claimIds.length)) readingFail("RULE_PREMISE_MISSING","A reading assertion has no supporting premise.");
  if(input.kind==="sourced-symbolic"&&!input.sources.length) readingFail("SOURCE_FIELD_MISMATCH","A symbolic meaning has no pinned source field.");
  if(input.kind==="conditional-synthesis"&&(!input.rule||input.requiredPremiseIds.length<2)) readingFail("RULE_PREMISE_MISSING","A combined interpretation is missing a necessary premise.");
  if(input.rule?.modifierRecordIds.length) readingFail("MODIFIER_SOURCE_MISSING","Planet, side, Profile and Cross modifiers are unavailable in this bounded reader.");
  const normalized={...input,forbiddenInferences:unique([...FORBIDDEN_INFERENCES,...input.forbiddenInferences])};
  return {...normalized,schema:"AuricReadingClaimV1",claimId:`claim:${contentHash(normalized)}`,publicationStatus:"design-only",realization:{mode:"deterministic-design",semanticApproval:"design-only"}};
}
export function makeRule(relation:ReadingRule["relation"],premiseIds:string[]):ReadingRule{
  return {ruleId:`reading-rule:${relation}`,version:"reading-design-rules-1",relation,premiseIds:unique(premiseIds),modifierRecordIds:[],qualifications:["A conditional symbolic comparison, not an observed personal state."],forbiddenInferences:[...FORBIDDEN_INFERENCES],semanticStatus:"design-only",approvedForConsumer:false};
}
export function makeInsight(input:Omit<ReadingInsight,"insightId"|"noveltyAgainst"|"necessityWitnessRefs">):ReadingInsight{
  return {...input,semanticKey:input.semanticKey||input.salienceReason,insightId:`insight:${contentHash({propositionKey:input.propositionKey,relation:input.relationKind})}`,noveltyAgainst:[],necessityWitnessRefs:[]};
}

/** Proposition relationships, not wrapper IDs or field overlap, determine repeat credit.
 * This bounded comparison is not a general natural-language entailment test. */
export function novelRelationshipKeys(candidate:ReadingInsight,expressed:ReadonlySet<string>):string[]{
  return [...new Set(candidate.expressedRelations||[])].filter(key=>!expressed.has(key));
}
export function selectNovelDeepInsights(candidates:readonly ReadingInsight[],standard:readonly ReadingInsight[],limit=3):ReadingInsight[]{
  const expressed=new Set(standard.flatMap(i=>i.expressedRelations||[])),selected:ReadingInsight[]=[];
  for(const i of candidates){
    if(selected.length>=limit||!novelRelationshipKeys(i,expressed).length)continue;
    selected.push(i);(i.expressedRelations||[]).forEach(k=>expressed.add(k));
  }
  return selected;
}

export type SupportAvailability = {factIds:ReadonlySet<string>;activationIds:ReadonlySet<string>;sourceIdentities?:ReadonlySet<string>;worldIds?:ReadonlySet<string>};
const frozenSourceIdentities=new WeakMap<object,string>();
export function sourceIdentity(s:ClaimSource):string{
  const cached=Object.isFrozen(s)?frozenSourceIdentities.get(s):undefined;if(cached)return cached;
  const identity=contentHash({recordId:s.recordId,variantId:s.variantId,fieldKey:s.fieldKey,ref:s.ref,text:s.text});
  if(Object.isFrozen(s))frozenSourceIdentities.set(s,identity);return identity;
}
/** Evaluates AND premises / OR redundant routes. This is a removal experiment, not a chart recalculation. */
export function validateClaimDependencies(claims:readonly ReadingClaim[],available:SupportAvailability):{validClaimIds:string[];withheld:{claimId:string;code:string}[]} {
  if(claims.length>4000)readingFail("UNSUPPORTED_VISIBLE_CLAIM","This reading exceeds the bounded claim limit.");
  const byId=new Map(claims.map(c=>[c.claimId,c]));
  if(byId.size!==claims.length)readingFail("UNSUPPORTED_VISIBLE_CLAIM","Duplicate claim identities are unsupported.");
  // Inspect every dependency before evaluating OR routes. A successful early branch
  // must not conceal a cycle or malformed scope elsewhere in the supplied graph.
  const checked=new Set<string>(),active=new Set<string>();
  const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.length>0)&&new Set(v).size===v.length;
  for(const c of claims){
    if(!c.scope||!['natal','composite'].includes(c.scope.context)||
      !ids(c.scope.personIds)||!c.scope.personIds.length||!ids(c.scope.chartRevisionIds)||!c.scope.chartRevisionIds.length||
      !ids(c.scope.worldIds)||!c.scope.worldIds.length||!ids(c.requiredPremiseIds)||
      !Array.isArray(c.supportRoutes)||!c.supportRoutes.length||
      c.supportRoutes.some(r=>!ids(r.factIds)||!ids(r.activationIds)||!ids(r.claimIds)||!r.factIds.length&&!r.activationIds.length&&!r.claimIds.length))
      readingFail('REQUEST_CONTEXT_MISMATCH','A claim has invalid world, subject or premise scope.');
  }
  function inspect(id:string,depth:number):void{
    if(depth>64||active.has(id))readingFail('RULE_PREMISE_MISSING','The reading contains a cyclic or excessive premise chain.');
    if(checked.has(id))return;
    const c=byId.get(id);if(!c)return; // A removed/missing premise withholds its dependent claim.
    active.add(id);
    unique([...c.requiredPremiseIds,...c.supportRoutes.flatMap(r=>r.claimIds)]).forEach(p=>inspect(p,depth+1));
    active.delete(id);checked.add(id);
  }
  claims.forEach(c=>inspect(c.claimId,0));
  const state=new Map<string,Set<string>>(),reason=new Map<string,string>();
  const intersection=(a:Set<string>,b:Set<string>)=>new Set([...a].filter(w=>b.has(w)));
  function premiseWorlds(id:string,parent:ReadingClaim):Set<string>{
    const child=byId.get(id);
    if(!child||child.scope.context==='composite'&&parent.scope.context==='natal'||
       !child.scope.personIds.every(p=>parent.scope.personIds.includes(p))||
       !child.scope.chartRevisionIds.every(r=>parent.scope.chartRevisionIds.includes(r)))return new Set();
    return visit(id);
  }
  function visit(id:string):Set<string>{
    const cached=state.get(id);if(cached)return cached;
    const c=byId.get(id);if(!c)return new Set();
    let worlds=new Set(c.scope.worldIds.filter(w=>!available.worldIds||available.worldIds.has(w)));
    if(c.sources.some(s=>available.sourceIdentities&&!available.sourceIdentities.has(sourceIdentity(s)))){
      worlds.clear();reason.set(id,'SOURCE_FIELD_MISMATCH');
    }
    // Every declared required premise is an AND, independently of redundant routes.
    for(const p of c.requiredPremiseIds)worlds=intersection(worlds,premiseWorlds(p,c));
    const routes=new Set<string>();
    for(const route of c.supportRoutes){
      if(!route.factIds.every(f=>available.factIds.has(f))||!route.activationIds.every(a=>available.activationIds.has(a)))continue;
      let supported=new Set(worlds);
      for(const p of route.claimIds)supported=intersection(supported,premiseWorlds(p,c));
      supported.forEach(w=>routes.add(w));
    }
    if(!routes.size&&!reason.has(id))reason.set(id,'RULE_PREMISE_MISSING');
    state.set(id,routes);return routes;
  }
  claims.forEach(c=>visit(c.claimId));
  return {validClaimIds:claims.filter(c=>state.get(c.claimId)!.size>0).map(c=>c.claimId),withheld:claims.filter(c=>!state.get(c.claimId)!.size).map(c=>({claimId:c.claimId,code:reason.get(c.claimId)||'RULE_PREMISE_MISSING'}))};
}
export function claimRemovalCheck(claims:readonly ReadingClaim[],available:SupportAvailability,remove:{factIds?:string[];activationIds?:string[];claimIds?:string[]}):{validClaimIds:string[];withheld:{claimId:string;code:string}[]} {
  const removedClaims=new Set(remove.claimIds||[]);
  return validateClaimDependencies(claims.filter(c=>!removedClaims.has(c.claimId)),{...available,factIds:new Set([...available.factIds].filter(x=>!remove.factIds?.includes(x))),activationIds:new Set([...available.activationIds].filter(x=>!remove.activationIds?.includes(x)))});
}
