import type {ReadingClaim,ReadingInsight} from './insights';
import type {RelationalDiscoveryTrace} from './relational-discovery';
export type MeaningUtilization={recordId:string;binding:string;eligibility:'missing'|'restricted'|'topic-filtered'|'eligible';usability:'not-eligible'|'eligible-but-unmodelled'|'modelled-but-unselected'|'semantically-rejected'|'rendered';candidateIds:string[];selectedInsightIds:string[];renderedParagraphIds:string[];semanticRejections:string[];reasonCodes:string[]};

/** Eligibility and use are different axes. A rejected lexical sense does not
 * revoke an eligible full record or hide another valid interpretation of it. */
export function meaningUtilization(trace:RelationalDiscoveryTrace,selected:ReadingInsight[],claims:ReadingClaim[],paragraphs:{paragraphId:string;claimIds:string[]}[]):MeaningUtilization[]{
 const byId=new Map(claims.map(c=>[c.claimId,c]));
 function records(ids:string[],seen=new Set<string>()):Set<string>{const result=new Set<string>();for(const id of ids){if(seen.has(id))continue;seen.add(id);const c=byId.get(id);if(!c)continue;if(c.sources.length)result.add(c.propositionKey);for(const x of records([...c.requiredPremiseIds,...c.supportRoutes.flatMap(r=>r.claimIds)],seen))result.add(x);}return result;}
 const inParagraph=paragraphs.map(p=>({id:p.paragraphId,records:records(p.claimIds)}));
 return trace.records.map(row=>{
  const eligibility=row.status==='missing-source'?'missing':row.status==='topic-not-selected'?'topic-filtered':row.status.startsWith('eligible')?'eligible':'restricted';
  const candidates=trace.candidates.filter(c=>c.nodeKeys.includes(row.binding));
  const selectedIds=candidates.filter(c=>selected.some(i=>i.insightId===c.insightId)).map(c=>c.insightId);
  const rendered=inParagraph.filter(p=>[...p.records].some(key=>key.startsWith('discovery-source:'+row.binding+':'))).map(p=>p.id);
  const rejections=trace.semanticRejections.filter(r=>r.binding===row.binding).map(r=>r.premise.reason);
  const bounded=trace.proposalDispositions.some(r=>r.nodeKeys?.includes(row.binding));
  const usability=eligibility!=='eligible'?'not-eligible':rendered.length?'rendered':candidates.length||bounded?'modelled-but-unselected':rejections.length?'semantically-rejected':'eligible-but-unmodelled';
  return {recordId:row.recordId,binding:row.binding,eligibility,usability,candidateIds:candidates.map(c=>c.insightId),selectedInsightIds:selectedIds,renderedParagraphIds:rendered,semanticRejections:rejections,reasonCodes:row.reasons};
 });
}
