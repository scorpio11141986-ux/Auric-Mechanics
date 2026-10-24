/** General structural priorities, not interpretation recipes or person-specific rules. */
export type ReadingPriority={id:string;kind:'island-join'|'new-center';factIds:string[];channelIds:string[];sourceRecordIds:string[];personIds:string[];reason:string;requiredInStandard:boolean};
export function localReadingPriorities(input:any):ReadingPriority[]{
 if(input.participants.length!==2)return [];
 const records=new Set(input.records.map((r:any)=>r.id));
 const eligible=(ids:string[])=>ids.length>0&&ids.every(id=>records.has(id));
 const facts=input.facts as any[],out:ReadingPriority[]=[];
 for(const f of facts.filter(f=>f.predicate==='actual-island-join')){
  const channels=f.value.witness.edges.map((e:any)=>e.channelId);
  if(!eligible(channels))continue;
  out.push({id:`join:${f.personIds.join(':')}:${channels.join(':')}`,kind:'island-join',factIds:[f.id],channelIds:channels,sourceRecordIds:channels,personIds:input.participants.map((p:any)=>p.personId),reason:'Actual pair connectivity joins previously separate natal islands. Develop the meanings of the complete witness together, distinguish both contributions and alternative routes; do not assert necessity from one sufficient route.',requiredInStandard:false});
 }
 for(const f of facts.filter(f=>f.predicate==='center-state'&&f.personIds.length===2&&f.value.state==='defined')){
  const natal=facts.filter(n=>n.predicate==='center-state'&&n.personIds.length===1&&n.value.centerId===f.value.centerId);
  if(natal.length!==2||natal.some(n=>n.value.state==='defined')||!eligible(f.value.completedChannelIds))continue;
  out.push({id:`new-center:${f.value.centerId}`,kind:'new-center',factIds:[f.id,...natal.map(n=>n.id)],channelIds:f.value.completedChannelIds,sourceRecordIds:f.value.completedChannelIds,personIds:f.personIds,reason:'This Center becomes defined relative to BOTH natal charts. Explain the actual completing Channel and its eligible meaning without inventing Center psychology or replacing natal Authority.',requiredInStandard:false});
 }
 // Explicit semantic tie-breaks; timestamps, provenance hashes and names are absent.
 out.sort((a,b)=>Number(b.kind==='island-join')-Number(a.kind==='island-join')||a.channelIds.join(',').localeCompare(b.channelIds.join(','))||a.id.localeCompare(b.id));
 const joins=out.filter(p=>p.kind==='island-join').slice(0,2),centers=out.filter(p=>p.kind==='new-center').slice(0,2);
 const required=new Set([...joins,...centers].map(p=>p.id));
 return out.map(p=>({...p,requiredInStandard:required.has(p.id)}));
}
export function checkStandardPriorities(bundle:any,packet:any){
 const priorities:ReadingPriority[]=packet.model.readingPriorities||[];
 const claims=new Map<string,any>(bundle.claims.map((c:any)=>[c.id,c]));
 const served=new Set<string>();
 const add=(id:string)=>{if(served.has(id))return;served.add(id);claims.get(id)?.requiredClaimIds.forEach(add);};
 [...bundle.standard.thesisClaimIds,...bundle.standard.chapters.flatMap((c:any)=>[...c.titleClaimIds,...c.paragraphs.flat()])].forEach(add);
 const selected=[...served].map(id=>claims.get(id)).filter(Boolean),text=selected.map(c=>c.text).join(' ');
 const ids=new Set(selected.flatMap(c=>c.factIds));
 return priorities.map(p=>{
  const missingFacts=p.factIds.filter(id=>!ids.has(id));
  const missingChannels=p.channelIds.filter(id=>{const gates=id.match(/\d+/g)!.map(Number);return !new RegExp(`\\b(?:${gates[0]}\\s*[-–—]\\s*${gates[1]}|${gates[1]}\\s*[-–—]\\s*${gates[0]})\\b`).test(text);});
  const usedRecords=new Set(selected.filter(c=>c.kind!=='computed-fact').flatMap(c=>c.evidenceIds.map((id:string)=>packet.evidence.find((e:any)=>e.id===id)?.recordId)));
  const missingMeaning=p.sourceRecordIds.filter(id=>!usedRecords.has(id));
  return {...p,status:missingFacts.length||missingChannels.length||missingMeaning.length?'missing':'referenced',missingFacts,missingChannels,missingMeaning,semanticAcceptance:'pending-independent-review'};
 });
}
