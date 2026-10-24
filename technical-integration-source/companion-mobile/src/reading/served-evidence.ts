import { contentHash } from '../domain/composite-hash';
import { sourceIdentity, unique, type ReadingClaim, type ReadingInsight } from './insights';
import type { ReadingParagraph } from './realization';

export function claimClosure(ids:readonly string[],claims:readonly ReadingClaim[]):ReadingClaim[]{
  const map=new Map(claims.map(c=>[c.claimId,c])),needed=new Set<string>();
  const visit=(id:string)=>{if(needed.has(id))return;const c=map.get(id);if(!c)throw Error('Missing selected claim');needed.add(id);c.requiredPremiseIds.forEach(visit);c.supportRoutes.flatMap(r=>r.claimIds).forEach(visit);};
  ids.forEach(visit);return claims.filter(c=>needed.has(c.claimId));
}

/** A closed deterministic-preview packet. Bindings preserve construction support;
 * they do not claim semantic entailment or authorize new model-written clauses. */
export function servedEvidence(claims:readonly ReadingClaim[],selectedIds:readonly string[],paragraphs:readonly ReadingParagraph[],insights:readonly ReadingInsight[]){
  const selected=claimClosure(selectedIds,claims),required=new Set(selected.flatMap(c=>c.sources).map(sourceIdentity));
  const available=unique(claims.flatMap(c=>c.sources).map(sourceIdentity));
  const meaning=selected.filter(c=>c.kind==='sourced-symbolic').flatMap(c=>c.sources.map(s=>({
    propositionId:`proposition:${contentHash({claim:c.claimId,source:sourceIdentity(s)})}`,
    kind:'source-field' as const,claimIds:[c.claimId],sourceRef:sourceIdentity(s),recordId:s.recordId,fieldKey:s.fieldKey,
    text:s.text,scope:c.scope,activationIds:c.activationIds,sourceSpan:s.ref,
    sourceLayer:s.fieldKey.includes('coherent')||s.fieldKey.includes('distorted')?'derived-application':'pinned-symbolic-field',
    qualificationClaimIds:[c.claimId],semanticStatus:'requires-human-review' as const
  })));
  const facts=selected.filter(c=>c.kind==='computed-fact').map(c=>({propositionId:`proposition:${c.claimId}`,kind:'computed-fact' as const,claimIds:[c.claimId],text:c.text,scope:c.scope,factIds:c.factIds,activationIds:c.activationIds,supportRoutes:c.supportRoutes}));
  const relations=selected.filter(c=>c.kind==='conditional-synthesis').map(c=>({propositionId:`proposition:${c.claimId}`,kind:'conditional-synthesis' as const,claimIds:[c.claimId],text:c.text,scope:c.scope,requiredPremiseIds:c.requiredPremiseIds,conditions:c.qualifications,alternatives:c.alternatives,nonclaims:c.forbiddenInferences,semanticStatus:'requires-human-review' as const}));
  const applications=selected.filter(c=>c.kind==='reflective-prompt').map(c=>({propositionId:`proposition:${c.claimId}`,kind:'illustrative-application' as const,claimIds:[c.claimId],text:c.text,scope:c.scope,requiredPremiseIds:c.requiredPremiseIds,notObservedBehavior:true}));
  const propositions=[...meaning,...facts,...relations,...applications];
  const renderedPropositionBindings=paragraphs.flatMap(p=>{
    let offset=0;
    return p.rootClaimIds.map(id=>{
      const root=claims.find(c=>c.claimId===id)!;const start=p.text.indexOf(root.text,offset);if(start<0)throw Error('Unbound rendered root');offset=start+root.text.length;
      const closure=claimClosure([id],claims),ids=new Set(closure.map(c=>c.claimId));
      return {paragraphId:p.paragraphId,rootClaimId:id,start,end:offset,text:root.text,
        propositionIds:propositions.filter(x=>x.claimIds.some(id=>ids.has(id))).map(x=>x.propositionId),
        requiredClaimIds:[...ids],requiredSourceRefs:unique(closure.flatMap(c=>c.sources).map(sourceIdentity)),
        argument:root.argument||null,bindingKind:root.argument?'bounded-argument-sentence' as const:'deterministic-root-span' as const,semanticEntailment:'not-certified' as const};
    });
  });
  const themes=insights.map(i=>{
    const closure=claimClosure(i.claimIds,claims),sources=closure.flatMap(c=>c.sources);
    return {themeKey:i.themeKey||i.semanticKey,insightId:i.insightId,mainConclusion:claims.find(c=>c.claimId===i.claimIds[0])!.text,
      chartPredicates:closure.filter(c=>c.kind==='computed-fact').map(c=>({claimId:c.claimId,text:c.text,factIds:c.factIds})),
      exactSourcePropositions:meaning.filter(m=>closure.some(c=>m.claimIds.includes(c.claimId))).map(m=>m.propositionId),
      essentialConditions:sources.filter(s=>/trigger_condition|boundary_nonclaim/.test(s.fieldKey)).map(s=>({sourceRef:sourceIdentity(s),text:s.text})),
      alternatives:sources.filter(s=>/coherent_expression|distorted_expression/.test(s.fieldKey)).map(s=>({sourceRef:sourceIdentity(s),text:s.text})),
      thesisInsightId:insights[0]?.insightId,relationshipToThesis:i===insights[0]?'Leading supported theme':`A distinct ${i.themeKey||i.salienceReason} subject within the same chart; no psychological agreement inferred.`,
      expressedRelationships:i.expressedRelations||[],removalBehavior:{requiredClaimIds:closure.map(c=>c.claimId),policy:'Retract affected clauses when their own required support fails; retain independently supported themes.'}};
  });
  return {schema:'AuricSelectedPropositionPacketV1' as const,scope:'served-plan-only' as const,
    candidateSourceRefs:available,requiredSourceRefs:[...required],contextOnlySourceRefs:available.filter(s=>!required.has(s)),
    selectedMeaningPropositionIds:meaning.map(m=>m.propositionId),propositions,renderedPropositionBindings,themes,
    modelProseAuthorized:false,limitations:['Root spans reconstruct deterministic text; they are not general atomic clause entailment.','Ownership and endpoint states are independently retractable. Other synthesis remains bounded and requires semantic review before model transport.']};
}
