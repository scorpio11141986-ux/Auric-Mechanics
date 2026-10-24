import type {LLMDepth,LocalReadingResult,LLMClaim} from './llm-contract';
export type CompactPremise={text:string;factIds:string[];claimIds:string[];graphId?:string};
export type CompactOpening={status:'supported'|'needs-full-context';depth:LLMDepth;requestDigest:string;packetDigest:string;premises:CompactPremise[];claimIds:string[];evidenceIds:string[];factIds:string[];conclusion:{claimId:string;originalText:string;text:string;transformations:string[]}|null;reason?:string};
const names:Record<string,string>={G:'Identity/G',Ajna:'Ajna',Head:'Head/Crown',Ego:'Ego',Throat:'Throat',Sacral:'Sacral',Spleen:'Spleen',SolarPlexus:'Solar Plexus',Root:'Root'};
/** Presentation only. Model text, issued facts and original depth plans are immutable.
 * Captions use issued mechanical facts; the conclusion is an existing opening claim.
 * Only bounded antecedent substitutions bind a phrase to the now-visible captions. */
export function compactOpening(result:LocalReadingResult,depth:LLMDepth):CompactOpening{
 const empty:CompactOpening={status:'needs-full-context',depth,requestDigest:result.requestDigest,packetDigest:result.packetDigest,premises:[],claimIds:[],evidenceIds:[],factIds:[],conclusion:null};
 try{
  if(result.bundle.requestDigest!==result.requestDigest||result.bundle.packetDigest!==result.packetDigest)throw Error('COMPACT_IDENTITY_MISMATCH');
  const bundle=result.bundle,claims=new Map(bundle.claims.map(c=>[c.id,c])),trace=new Map<string,any>((result.trace as any[]).map(t=>[t.claimId,t]));
  const opening=depth==='quick'?bundle.quick.claimIds:bundle.standard.thesisClaimIds;
  const thesis=opening.map(id=>claims.get(id)!).find(c=>c.kind==='proposed-synthesis')||opening.map(id=>claims.get(id)!).find(c=>c.kind!=='computed-fact');
  // A brief heading-like thesis cannot stand in for the first developed insight.
  // Reuse a full supported sentence from the served first theme; never invent prose.
  const developed=depth!=='quick'&&thesis&&thesis.text.split(/\s+/).length<12?bundle.standard.chapters[0]?.paragraphs.flat().map(id=>claims.get(id)!).find(c=>c.kind==='proposed-synthesis'&&c.text.split(/\s+/).length>=12):undefined;
  const conclusion=developed||thesis;
  if(!conclusion)throw Error('NO_SUPPORTED_OPENING_CONCLUSION');
  const closure=new Set<string>(),active=new Set<string>();
  const visit=(id:string)=>{if(closure.has(id))return;if(active.has(id)||!claims.has(id)||!trace.has(id))throw Error('UNRESOLVED_COMPACT_CLAIM');active.add(id);claims.get(id)!.requiredClaimIds.forEach(visit);active.delete(id);closure.add(id);};visit(conclusion.id);
  const facts=new Map<string,any>(),allFacts=new Map<string,any>();
  for(const t of trace.values())for(const f of t.factDependencyClosure||[])allFacts.set(f.id,f);
  for(const id of closure)for(const f of trace.get(id).factDependencyClosure||[])facts.set(f.id,f);
  for(const id of closure)for(const fid of claims.get(id)!.factIds)if(!facts.has(fid))throw Error('UNRESOLVED_COMPACT_FACT');
  const actors=result.case.people.map(p=>p.id),role=(id:string)=>actors.length===1?'Your':actors.indexOf(id)===0?'A':'B';
  const channelFacts=[...facts.values()].filter(f=>['channel-completion','channel-ownership'].includes(f.predicate)&&f.value.complete);
  const channel=(id:string)=>channelFacts.find(f=>f.value.channelId===id&&f.personIds.length===actors.length)||channelFacts.find(f=>f.value.channelId===id);
  const label=(id:string)=>{const f=channel(id);if(!f)throw Error('COMPACT_CHANNEL_WITNESS_MISSING');const v=f.value;return `${v.gates.join('–')} (${v.centers.map((c:string)=>names[c]||c).join('↔')})`;};
  const anchors=new Set<string>((trace.get(conclusion.id).factDependencyClosure||[]).filter((f:any)=>['channel-completion','channel-ownership'].includes(f.predicate)&&f.value.complete).map((f:any)=>f.value.channelId));
  if(!anchors.size)channelFacts.forEach(f=>anchors.add(f.value.channelId));
  if(!anchors.size)throw Error('NO_COMPACT_MECHANICAL_PREMISE');
  const premises:CompactPremise[]=[],covered=new Set<string>();
  const support=(ids:string[])=>[...trace.values()].filter(t=>t.factDependencyClosure?.some((f:any)=>ids.includes(f.id))).map(t=>t.claimId).filter(id=>closure.has(id)||claims.get(id)?.kind==='computed-fact');
  if(actors.length===2){
   const joins=[...facts.values()].filter(f=>f.predicate==='actual-island-join'&&f.value.witness?.edges.length).sort((a,b)=>{
    const overlap=(f:any)=>f.value.witness.edges.filter((e:any)=>anchors.has(e.channelId)).length;
    return overlap(b)-overlap(a)||a.value.witness.edges.length-b.value.witness.edges.length||a.value.witness.edges.map((e:any)=>e.channelId).join(',').localeCompare(b.value.witness.edges.map((e:any)=>e.channelId).join(','));
   });
   const join=joins[0];
   if(join&&join.value.witness.edges.some((e:any)=>anchors.has(e.channelId))){
    const route=join.value.witness.edges.map((e:any)=>e.channelId);const ids=[join.id,...route.map((id:string)=>channel(id).id)];route.forEach((id:string)=>covered.add(id));
    premises.push({text:`One link between ${role(join.value.personId)}’s separate Center groups: Channels ${route.map(label).join(' + ')}.`,factIds:ids,claimIds:support(ids)});
   }
   for(const f of facts.values())if(f.predicate==='center-state'&&f.personIds.length===2&&f.value.state==='defined'){
    const natal=[...facts.values()].filter(n=>n.predicate==='center-state'&&n.personIds.length===1&&n.value.centerId===f.value.centerId);
    if(natal.length!==2||natal.some(n=>n.value.state==='defined'))continue;
    const channels=f.value.completedChannelIds.filter((id:string)=>anchors.has(id));if(!channels.length)continue;
    const ids=[f.id,...natal.map(n=>n.id),...channels.map((id:string)=>channel(id).id)];channels.forEach((id:string)=>covered.add(id));
    premises.push({text:`New together, absent in both natal charts: ${names[f.value.centerId]} Center via Channel ${channels.map(label).join(', ')}.`,factIds:ids,claimIds:support(ids)});
   }
  }
  const remaining=[...anchors].filter(id=>!covered.has(id));
  if(remaining.length){
   const groups=new Map<string,string[]>();
   for(const id of remaining){const f=channel(id),owners=f.value.relation?.fullOwnerIds||[];const prefix=actors.length===1?'Your completed Channels':owners.length===2?'Both already have Channels':owners.length===1?`${role(owners[0])} already has Channels`:'Together you complete Channels';groups.set(prefix,[...(groups.get(prefix)||[]),id]);}
   for(const [prefix,ids] of groups){const fs=ids.map(id=>channel(id).id);let heading=prefix;let graphId:string|undefined;
    if(actors.length===1){const graph=result.facts.graphs.find((g:any)=>g.scope.personIds.length===1&&g.scope.personIds[0]===actors[0]);const classification=[...allFacts.values()].find(f=>f.predicate==='natal-classification'&&f.personIds.length===1&&f.personIds[0]===actors[0]);if(graph&&classification){heading=`${graph.componentCount} ${graph.componentCount===1?'defined':'separate'} Center ${graph.componentCount===1?'group':'groups'} · Channels`;fs.push(classification.id);graphId=graph.id;}}
    premises.push({text:`${heading}: ${ids.map(label).join('; ')}.`,factIds:fs,claimIds:support(fs),...(graphId?{graphId}:{})});}
  }
  // No clipping, sentence cutting, new symbolic meanings or source promotion.
  let text=conclusion.text;const transformations:string[]=[];
  for(const [from,to] of [['If these themes resonate,','If these connections resonate,'],['If these possibilities fit your experience,','If these connections fit your experience,'],['Symbolically, that meeting could','Symbolically, these connections could']] as const){if(text.startsWith(from)){text=to+text.slice(from.length);transformations.push(`Bound antecedent: ${from} -> ${to}`);}}
  if(/\b(?:these themes|these possibilities|that meeting|the above)\b/i.test(text))throw Error('UNRESOLVED_COMPACT_ANTECEDENT');
  const ids=[...new Set([...closure,...premises.flatMap(p=>p.claimIds)])];
  const evidence=[...new Set([...closure].flatMap(id=>claims.get(id)!.evidenceIds))];
  for(const id of closure)if(claims.get(id)!.evidenceIds.some(eid=>!trace.get(id).sourceFields.some((e:any)=>e.id===eid)))throw Error('UNRESOLVED_COMPACT_SOURCE');
  return {...empty,status:'supported',premises,claimIds:ids,evidenceIds:evidence,factIds:[...new Set(premises.flatMap(p=>p.factIds))],conclusion:{claimId:conclusion.id,originalText:conclusion.text,text,transformations}};
 }catch(e){return {...empty,reason:(e as Error).message};}
}
