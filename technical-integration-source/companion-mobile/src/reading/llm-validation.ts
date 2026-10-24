import {LOCAL_LLM_SCHEMA,type LocalLLMBundle,type LLMClaim,type LLMChapter} from './llm-contract';
import {checkStandardPriorities} from './local-salience';
export function requireLocal(condition:unknown,code:string):asserts condition{if(!condition)throw Error(code);}
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Only bounded factual notices may name wholly withheld interpretation records.
 * Occurrence support is checked separately. No person or chart is special-cased. */
function withheldLineNotice(text:string,gate:number,line:number,packet:any){
 const recordId=packet.records.find((r:any)=>r.gate===gate&&r.line===line)?.id||`gate-${gate}-line-${line}`;
 const restricted=packet.withheld.filter((w:any)=>w.recordId===recordId);
 const meanings=packet.evidence.filter((e:any)=>e.recordId===recordId&&e.exactLineMeaning);
 if(!restricted.length||meanings.length)return null;
 const label=`(?:Gate\\s+)?${gate}\\.${line}`;
 const notice=new RegExp(`^${label}\\s+(?:is identified but not interpreted because its exact teaching is unavailable|remains an identity-only detail here)\\.?$`,'i');
 const matching=text.split(/(?<=[.!?])\s+|;\s*/).filter(clause=>new RegExp(`\\b${gate}\\.${line}\\b`).test(clause));
 requireLocal(matching.length>0&&matching.every(clause=>notice.test(clause.trim())),'TEACHING_WITHHELD_LINE_INTERPRETATION');
 return {recordId,gate,line,clauses:matching,meaningSupplied:false,restrictedFields:restricted.map((w:any)=>({fieldKey:w.fieldKey,reason:w.reason}))};
}
function object(v:any,keys:string[],code:string){requireLocal(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),code);}
function strings(v:any,max=200){requireLocal(Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==='string'&&x.length<=4000),'INVALID_STRING_LIST');}
/** Mechanical fact closure. Alternatives remain lists of sufficient witness sets;
 * expanding a topology fact never turns one route into a necessity assertion. */
export function localFactClosure(ids:string[],input:any){
 const facts=new Map<string,any>(input.facts.map((f:any)=>[f.id,f])),acts=new Map<string,any>(input.activations.map((a:any)=>[a.id,a]));
 const out=new Map<string,any>(),support=new Set<string>();
 const add=(f:any)=>{out.set(f.id,f);for(const id of f.activationIds){requireLocal(acts.has(id),'FACT_ACTIVATION_MISSING');support.add(id);}};
 const edge=(channelId:string,graph:any)=>{
  const actual=graph.edges.find((e:any)=>e.channelId===channelId);requireLocal(actual,'GRAPH_EDGE_MISSING');
  const pair=graph.scope.kind==='pair',predicate=pair?'channel-ownership':'channel-completion';
  const f=input.facts.find((f:any)=>f.predicate===predicate&&f.value.channelId===channelId&&same(f.personIds,graph.scope.personIds));
  requireLocal(f?.value.complete&&same(f.value.gates.map(String),actual.gates.map(String)),'ISSUED_CHANNEL_WITNESS_MISSING');
  requireLocal(actual.gates.every((g:number)=>f.activationIds.some((id:string)=>acts.get(id)?.gate===g)),'CHANNEL_ENDPOINT_MISSING');
  add(f);return f;
 };
 for(const id of ids){const f=facts.get(id);requireLocal(f,'UNKNOWN_FACT');add(f);
  if(f.predicate==='center-state'){
   const g=input.graphs.find((g:any)=>same(g.scope.personIds,f.personIds));requireLocal(g,'CENTER_GRAPH_MISSING');
   const edges=g.edges.filter((e:any)=>e.centers.includes(f.value.centerId));
   requireLocal(same(edges.map((e:any)=>e.channelId),f.value.completedChannelIds),'CENTER_CHANNEL_MISMATCH');
   requireLocal((f.value.state==='defined')===Boolean(edges.length),'CENTER_DEFINITION_MISMATCH');
   edges.forEach((e:any)=>edge(e.channelId,g));
  }
  if(f.predicate==='definition-component'){
   const g=input.graphs.find((g:any)=>g.id===f.value.graphId),c=g?.components.find((c:any)=>c.id===f.value.componentId);
   requireLocal(c&&same(c.centerIds,f.value.centerIds)&&same(g.scope.personIds,f.personIds),'COMPONENT_SCOPE_MISMATCH');
   const edges=g.edges.filter((e:any)=>e.centers.every((x:string)=>c.centerIds.includes(x)));
   requireLocal(same(edges.map((e:any)=>e.channelId),f.value.channelIds),'COMPONENT_CHANNEL_MISMATCH');edges.forEach((e:any)=>edge(e.channelId,g));
  }
  if((f.predicate==='actual-island-join'||f.predicate==='motor-route')&&f.value.witness){
   const w=f.value.witness,g=input.graphs.find((g:any)=>g.id===w.graphId);requireLocal(g&&same(g.scope.personIds,w.scope.personIds),'WITNESS_GRAPH_MISMATCH');
   for(const e of w.edges){edge(e.channelId,g);for(const endpoint of e.endpoints){requireLocal(endpoint.contributionIds.length,'WITNESS_ENDPOINT_MISSING');for(const cid of endpoint.contributionIds){
    const contribution=input.contributions.find((c:any)=>c.id===cid);requireLocal(contribution&&contribution.gate===endpoint.gate&&g.scope.personIds.includes(contribution.personId),'WITNESS_CONTRIBUTION_MISMATCH');
    const activation=input.activations.find((a:any)=>a.personId===contribution.personId&&a.chartVersionId===contribution.chartVersionId&&a.nativeActivationId===contribution.activationId);
    requireLocal(activation&&activation.gate===endpoint.gate,'WITNESS_ACTIVATION_MISMATCH');support.add(activation.id);
   }}}
  }
 }
 return {facts:[...out.values()],activationIds:[...support]};
}
export function validateLocalBundle(value:unknown,packet:any){
 const v=value as LocalLLMBundle,input=packet.model;
 object(v,['schema','requestDigest','packetDigest','title','quick','standard','deep','claims','discoveries','teaching','limitations'],'BUNDLE_SHAPE');
 requireLocal(v.schema===LOCAL_LLM_SCHEMA&&v.requestDigest===packet.requestDigest&&v.packetDigest===packet.packetDigest,'STALE_OR_FOREIGN_READING');
 requireLocal(typeof v.title==='string'&&v.title.length<=240,'TITLE_SHAPE');
 requireLocal(Array.isArray(v.claims)&&v.claims.length>=10&&v.claims.length<=180,'CLAIM_COUNT');
 const acts=new Map<string,any>(input.activations.map((a:any)=>[a.id,a])),sources=new Map<string,any>(packet.evidence.map((e:any)=>[e.id,e]));
 const byId=new Map<string,LLMClaim>();const trace:any[]=[];
 const people=new Set(input.participants.map((p:any)=>p.personId));
 for(const c of v.claims){
  object(c,['id','text','kind','personIds','activationIds','factIds','factBindings','evidenceIds','requiredClaimIds','conditions','alternatives','limitations'],'CLAIM_SHAPE');
  requireLocal(typeof c.id==='string'&&/^[a-z][a-z\d_-]{0,63}$/i.test(c.id)&&!byId.has(c.id),'DUPLICATE_CLAIM');byId.set(c.id,c);
  requireLocal(typeof c.text==='string'&&c.text.trim().length>5&&c.text.length<=2400&&!/<\/?(?:script|iframe)|javascript:|https?:\/\//i.test(c.text),'VISIBLE_TEXT_SHAPE');
  requireLocal(['computed-fact','source-interpretation','proposed-synthesis','lived-hypothesis'].includes(c.kind),'CLAIM_KIND');
  for(const k of ['personIds','activationIds','factIds','evidenceIds','requiredClaimIds','conditions','alternatives','limitations'] as const)strings(c[k]);
  requireLocal(c.personIds.length&&c.personIds.every(id=>people.has(id)),'WRONG_PERSON_SCOPE');
  requireLocal(c.factIds.length||c.evidenceIds.length,'UNSUPPORTED_CLAIM');
  requireLocal(Array.isArray(c.factBindings)&&c.factBindings.length<=20,'FACT_BINDING_SHAPE');
  for(const b of c.factBindings){object(b,['factId','predicate','path','value'],'FACT_BINDING_SHAPE');const f=input.facts.find((f:any)=>f.id===b.factId);requireLocal(f&&c.factIds.includes(b.factId)&&b.predicate===f.predicate&&typeof b.path==='string'&&(b.path===''||b.path.startsWith('/'))&&Object.hasOwn(b,'value'),'FACT_BINDING_SCOPE');let actual=f.value;try{for(const key of b.path.split('/').slice(1))actual=actual[key.replace(/~1/g,'/').replace(/~0/g,'~')];}catch{throw Error('FACT_BINDING_PATH');}requireLocal(actual!==undefined&&JSON.stringify(actual)===JSON.stringify(b.value),'FACT_BINDING_VALUE_MISMATCH');}
  if(c.kind==='computed-fact')requireLocal(c.factBindings.length,'COMPUTED_FACT_BINDING_REQUIRED');
  const ownershipAssertion=/\b(?:electromagnetic|full[- ](?:natal[- ])?(?:owner|holder))\b/i.test(c.text)||(/\b(?:compromise|companionship|dominance)\b/i.test(c.text)&&(c.kind==='computed-fact'||/\b(?:channel|ownership|classification|endpoint|natal route)\b/i.test(c.text)));
  if(ownershipAssertion)requireLocal(c.factBindings.some(b=>b.predicate==='channel-ownership'&&(/\/(?:relation|classification|fullOwnerIds|endpointStates)/.test(b.path)||b.path==='')),'OWNERSHIP_BINDING_REQUIRED');
  requireLocal(c.activationIds.every(id=>acts.has(id)&&c.personIds.includes(acts.get(id).personId)),'WRONG_ACTIVATION_SCOPE');
  requireLocal(c.evidenceIds.every(id=>sources.has(id)),'WITHHELD_OR_UNKNOWN_SOURCE');
  if(c.kind!=='computed-fact')requireLocal(c.evidenceIds.length&&c.conditions.length&&c.limitations.length,'SYMBOLIC_SUPPORT_REQUIRED');
  if(c.kind==='proposed-synthesis'||c.kind==='lived-hypothesis')requireLocal(c.alternatives.length,'SYNTHESIS_ALTERNATIVE_REQUIRED');
  const closure=localFactClosure(c.factIds,input),support=new Set(closure.activationIds);
  requireLocal(closure.facts.every(f=>f.personIds.every((id:string)=>c.personIds.includes(id))),'FACT_PERSON_SCOPE_MISMATCH');
  for(const eid of c.evidenceIds){const e=sources.get(eid);requireLocal(!packet.withheld.some((w:any)=>w.recordId===e.recordId&&(!w.fieldKey||w.fieldKey===e.fieldKey)),'WITHHELD_SOURCE');
   for(const native of e.activationIds){const a=input.activations.find((a:any)=>a.nativeIndexedId===native);if(a&&c.personIds.includes(a.personId))support.add(a.id);}
  }
  requireLocal(c.activationIds.every(id=>support.has(id)),'ACTIVATION_OUTSIDE_SUPPORT');
  for(const m of c.text.matchAll(/\b(?:Gate\s+)?([1-6]?\d)\.([1-6])\b/gi)){
   const gate=Number(m[1]),line=Number(m[2]);if(gate<1||gate>64)continue;
   requireLocal(c.activationIds.some(id=>{const a=acts.get(id);return a.gate===gate&&a.line===line&&a.exactLineEligible;}),'UNCERTAIN_OR_FOREIGN_EXACT_LINE');
   if(c.kind==='source-interpretation')requireLocal(c.evidenceIds.some(id=>{const e=sources.get(id),r=packet.records.find((r:any)=>r.id===e.recordId);return e.exactLineMeaning&&r?.gate===gate&&r?.line===line;}),'EXACT_LINE_SOURCE_REQUIRED');
  }
  for(const m of c.text.matchAll(/\b(Design|Personality)\s+(North Node|South Node|Sun|Earth|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\b/gi))requireLocal(c.activationIds.some(id=>{const a=acts.get(id);return a.side.toLowerCase()===m[1].toLowerCase()&&a.planet.toLowerCase()===m[2].toLowerCase();}),'WRONG_PLANET_OR_SIDE');
  for(const p of input.participants){
   const first=p.name.split(' ')[0],unique=input.participants.filter((other:any)=>other.name.split(' ')[0]===first).length===1;
   const mechanicalLabel=input.activations.some((a:any)=>a.planet.toLowerCase()===first.toLowerCase());
   // A planet name is not evidence that a similarly named person was mentioned.
   // Full display names still require scope, and exact actor/fact bindings remain mandatory.
   const labels=[p.name,...(unique&&!mechanicalLabel?[first]:[])];
   for(const label of labels){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('\\b'+escaped+'\\b','i').test(c.text))requireLocal(c.personIds.includes(p.personId),'PERSON_LABEL_OUTSIDE_SCOPE');}
  }
  trace.push({claimId:c.id,kind:c.kind,text:c.text,scope:{context:packet.entry.context,personIds:c.personIds,chartRevisionIds:input.participants.filter((p:any)=>c.personIds.includes(p.personId)).map((p:any)=>p.chartVersionId)},sourceFields:c.evidenceIds.map(id=>sources.get(id)),factDependencyClosure:closure.facts,activations:c.activationIds.map(id=>acts.get(id)),semanticEntailment:'pending-review'});
 }
 const done=new Set<string>(),active=new Set<string>();
 function visit(id:string){requireLocal(byId.has(id),'UNKNOWN_CLAIM_DEPENDENCY');if(done.has(id))return;requireLocal(!active.has(id),'CYCLIC_CLAIM_DEPENDENCY');active.add(id);byId.get(id)!.requiredClaimIds.forEach(visit);active.delete(id);done.add(id);}
 v.claims.forEach(c=>visit(c.id));
 const ids=(values:string[])=>{strings(values);requireLocal(values.length&&values.every(id=>byId.has(id)),'UNKNOWN_VISIBLE_CLAIM');};
 object(v.quick,['title','claimIds'],'QUICK_SHAPE');ids(v.quick.claimIds);
 object(v.standard,['title','thesisClaimIds','chapters'],'STANDARD_SHAPE');ids(v.standard.thesisClaimIds);
 requireLocal(Array.isArray(v.standard.chapters)&&v.standard.chapters.length>=3&&v.standard.chapters.length<=5,'STANDARD_DISTINCT_THEMES_REQUIRED');
 object(v.deep,['additionalChapters','gaps'],'DEEP_SHAPE');strings(v.deep.gaps);requireLocal(Array.isArray(v.deep.additionalChapters)&&v.deep.additionalChapters.length<=4,'DEEP_SHAPE');
 requireLocal(Array.isArray(v.discoveries)&&v.discoveries.length<=20,'DISCOVERY_SHAPE');
 const discoveries=new Map(v.discoveries.map(d=>[d.id,d]));requireLocal(discoveries.size===v.discoveries.length,'DUPLICATE_DISCOVERY');
 function chapter(c:LLMChapter){object(c,['id','title','titleClaimIds','paragraphs','discoveryId'],'CHAPTER_SHAPE');requireLocal(typeof c.title==='string'&&c.title.length<=180,'CHAPTER_TITLE');ids(c.titleClaimIds);requireLocal(Array.isArray(c.paragraphs)&&c.paragraphs.length>=1&&c.paragraphs.length<=10,'PARAGRAPHS_SHAPE');c.paragraphs.forEach(ids);requireLocal(discoveries.has(c.discoveryId),'UNKNOWN_DISCOVERY');}
 [...v.standard.chapters,...v.deep.additionalChapters].forEach(chapter);
 for(const d of v.discoveries){object(d,['id','conclusion','mechanism','relationKey','claimIds','evidenceIds','personIds','noveltyBeyondStandard'],'DISCOVERY_SHAPE');ids(d.claimIds);strings(d.evidenceIds);strings(d.personIds);requireLocal(typeof d.conclusion==='string'&&typeof d.mechanism==='string'&&d.mechanism.length>20&&typeof d.relationKey==='string'&&d.evidenceIds.every(id=>sources.has(id)),'DISCOVERY_SUPPORT');
  requireLocal(new Set(d.evidenceIds.map(id=>sources.get(id).recordId)).size>=2,'DISCOVERY_MUST_CONNECT_MEANINGS');
  requireLocal(d.personIds.length&&d.personIds.every(id=>people.has(id)),'DISCOVERY_PERSON_SCOPE');
 }
 const std=v.standard.chapters.map(c=>discoveries.get(c.discoveryId)!);
 requireLocal(new Set(std.map(d=>normalized(d.relationKey))).size===std.length,'REPEATED_STANDARD_THEME');
 const deep=v.deep.additionalChapters.map(c=>discoveries.get(c.discoveryId)!);
 const credited=deep.filter(d=>!std.some(s=>normalized(s.relationKey)===normalized(d.relationKey)||normalized(s.conclusion)===normalized(d.conclusion))&&d.noveltyBeyondStandard?.length>20);
 if(packet.entry.context==='composite')requireLocal(deep.every(d=>input.participants.every((p:any)=>d.personIds.includes(p.personId))),'COMPOSITE_DEEP_MUST_DEPEND_ON_BOTH');
 requireLocal(Array.isArray(v.teaching)&&v.teaching.length<=10,'TEACHING_SHAPE');
 const familiarity=['new','type','profile-authority','centers','gates-channels','advanced','practitioner'];
 const concepts=['typeStrategy','authority','profile','centers','definition','gates','channels','lines','planets','sides'];
 requireLocal(v.teaching.length===concepts.length&&new Set(v.teaching.map(t=>t.concept)).size===concepts.length,'TEACHING_CONCEPTS_REQUIRED');
 for(const t of v.teaching){object(t,['concept','byFamiliarity','factIds','evidenceIds'],'TEACHING_SHAPE');requireLocal(concepts.includes(t.concept)&&t.byFamiliarity&&familiarity.every(k=>typeof t.byFamiliarity[k]==='string'&&t.byFamiliarity[k].length>0&&t.byFamiliarity[k].length<=1800),'FAMILIARITY_EXPLANATION_MISSING');strings(t.factIds);strings(t.evidenceIds);requireLocal(t.factIds.length||t.evidenceIds.length,'TEACHING_SUPPORT_REQUIRED');const closure=localFactClosure(t.factIds,input);requireLocal(t.evidenceIds.every(id=>sources.has(id)),'TEACHING_SOURCE_MISSING');
  const support=new Set(closure.activationIds);for(const id of t.evidenceIds){const e=sources.get(id);for(const native of e.activationIds){const a=input.activations.find((a:any)=>a.nativeIndexedId===native);if(a)support.add(a.id);}}
  for(const [level,text] of Object.entries(t.byFamiliarity)){
   requireLocal(!/<\/?(?:script|iframe)|javascript:|https?:\/\//i.test(text),'TEACHING_TEXT_SHAPE');
   const withholdingDisclosures:any[]=[];
   for(const m of text.matchAll(/\b(?:Gate\s+)?([1-6]?\d)\.([1-6])\b/gi)){const gate=Number(m[1]),line=Number(m[2]);if(gate>=1&&gate<=64){requireLocal([...support].some(id=>{const a=acts.get(id);return a.gate===gate&&a.line===line&&a.exactLineEligible;}),'TEACHING_EXACT_LINE_WITHHELD');const notice=withheldLineNotice(text,gate,line,packet);if(notice)withholdingDisclosures.push({...notice,activationIds:[...support].filter(id=>acts.get(id).gate===gate&&acts.get(id).line===line)});}}
   trace.push({claimId:`teaching-${t.concept}-${level}`,kind:'mechanical-teaching',text,scope:{context:packet.entry.context,personIds:input.participants.map((p:any)=>p.personId)},sourceFields:t.evidenceIds.map(id=>sources.get(id)),factDependencyClosure:closure.facts,activations:[...support].map(id=>acts.get(id)),withholdingDisclosures,semanticEntailment:'pending-review'});
  }
 }
 strings(v.limitations);
 const renderedIds=new Set([...v.quick.claimIds,...v.standard.thesisClaimIds,...[...v.standard.chapters,...v.deep.additionalChapters].flatMap(c=>[...c.titleClaimIds,...c.paragraphs.flat()])]);
 const visibleHeadings=[v.title,v.quick.title,v.standard.title,...v.standard.chapters.map(c=>c.title),...v.deep.additionalChapters.map(c=>c.title)].join('\n');
 const visible=[...renderedIds].map(id=>byId.get(id)!.text).concat(v.teaching.flatMap(t=>Object.values(t.byFamiliarity)),[visibleHeadings,...v.deep.gaps,...v.limitations]).join('\n');
 if(packet.entry.relationshipContext.includes('friendship'))requireLocal(!/\b(?:sexual|romantic|romance|erotic|arousal|attraction|lovers?)\b/i.test(visible),'FRIENDSHIP_CONTEXT_LEAK');
 // Explicit negations preserve the required no-infallibility distinction.
 const certaintyAssertions=visible.replace(/\b(?:does not make (?:you|anyone|intuition|an intuition)|(?:is|are) not (?:a claim|evidence|proof|a guarantee) that (?:you are|anyone is|intuition is)|(?:is|are) not|never)\s+infallible\b/gi,'limited');
 requireLocal(!/\b(?:therefore you always|guarantees? (?:success|safety|health)|infallible)\b/i.test(certaintyAssertions),'UNSUPPORTED_CERTAINTY');
 requireLocal(!/\b(?:frozen source|source architecture|conventional detriment pole|source (?:itself )?(?:supplies|publishes)|editorial (?:record|carrier)|publication eligibility)\b/i.test(visible+'\n'+visibleHeadings),'EDITORIAL_MARKER_IN_PROSE');
 const priorities=checkStandardPriorities(v,packet);
 requireLocal(priorities.every(p=>!p.requiredInStandard||p.status==='referenced'),'STANDARD_STRUCTURAL_PRIORITY_MISSING');
 return {bundle:v,trace,validation:{status:'references-validated' as const,semanticReview:'pending' as const,depthStatus:credited.length>=2?'supported-candidate' as const:'insufficient-supported-depth' as const,issues:credited.length<2?['Fewer than two distinct supported Deep candidates. Existing valid additions retained.']:[]},creditedDeepDiscoveryIds:credited.map(d=>d.id)};
}
