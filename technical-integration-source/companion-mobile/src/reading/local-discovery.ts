import {runtime,datasetPin} from '../content/records';
import {deriveStructure} from '../domain/calculator';
import {contentHash} from '../domain/composite-hash';
import {CENTER_NAMES,type CenterId,type HumanDesignFactsV1} from '../domain/contracts';
import {assertReadingChartIndex} from './chart-index';
import type {ReadingChartIndex} from './contracts';
import {freezeReadingValue} from './compiler';
export type LocalDiscovery={id:string;relationKey:string;title:string;text:string;personIds:string[];activationIds:string[];factIds:string[];conditions:string[];limitations:string[];proof:any;kind:'computed-structural-discovery'};
const sorted=(n:number[])=>[...new Set(n)].sort((a,b)=>a-b);
const motors:CenterId[]=['Ego','SolarPlexus','Sacral','Root'];
const motorPath=(s:ReturnType<typeof deriveStructure>)=>s.definitionIslands.some(g=>g.includes('Throat')&&motors.some(m=>g.includes(m)));
const chLabel=(id:string)=>{const c=runtime.channels.find(c=>c.id===id)!;return `${c.gates.join('–')} (${c.centers.map(v=>v.replace(' Center','')).join(' ↔ ')})`;};
const groups=(s:Pick<HumanDesignFactsV1,'definitionIslands'>)=>s.definitionIslands.map(g=>g.map(c=>CENTER_NAMES[c]).join('–')).join('; ');
function addition(base:number[],added:number[]){
 const before=deriveStructure(base),after=deriveStructure(sorted([...base,...added]));
 const joined:number[][]=[];before.definitionIslands.forEach((a,i)=>before.definitionIslands.slice(i+1).forEach((b,j)=>{if(after.definitionIslands.some(c=>a.some(x=>c.includes(x))&&b.some(x=>c.includes(x))))joined.push([i,i+1+j]);}));
 return {added,before,after,joined,addedChannels:after.channels.filter(c=>!before.channels.some(b=>b.id===c.id)).map(c=>c.id),addedCenters:after.centers.filter(c=>c.defined&&!before.centers.find(b=>b.id===c.id)?.defined).map(c=>c.id),motorToThroat:motorPath(after),createsMotorToThroat:!motorPath(before)&&motorPath(after)};
}
const enumerations=new Map<string,ReturnType<typeof enumerate>>();
function enumerate(gates:number[]){
 const absent=Array.from({length:64},(_,i)=>i+1).filter(g=>!gates.includes(g));
 const singles=absent.map(g=>addition(gates,[g])),pairs=[] as ReturnType<typeof addition>[];
 for(let i=0;i<absent.length;i++)for(let j=i+1;j<absent.length;j++)pairs.push(addition(gates,[absent[i],absent[j]]));
 return {absent,singles,pairs,complete:true,scope:'all absent single Gates and all unordered two-Gate additions; no transit timing'};
}
function enumeration(gates:number[]){const k=sorted(gates).join(',');let v=enumerations.get(k);if(!v){v=enumerate(gates);if(enumerations.size>=24)enumerations.delete(enumerations.keys().next().value!);enumerations.set(k,v);}return v;}
export function buildLocalDiscovery(index:ReadingChartIndex){
 assertReadingChartIndex(index);
 const rows:LocalDiscovery[]=[],standard:LocalDiscovery[]=[],deep:LocalDiscovery[]=[];
 const people=index.participants,actor=(id:string)=>people.find(p=>p.personId===id)!;
 const emit=(relationKey:string,title:string,text:string,personIds:string[],proof:any,depth:'standard'|'deep')=>{
  const acts=index.activations.filter(a=>personIds.includes(a.personId));
  const predicates=relationKey==='ownership-versus-new-pair-completion'?['activation','channel-ownership','channel-completion']:['activation','natal-classification','center-state','channel-completion','channel-ownership','definition-component'];
  const facts=index.facts.filter(f=>predicates.includes(f.predicate)&&f.personIds.some(id=>personIds.includes(id)));
  if(relationKey==='actual-pair-join-relative-to-natal')facts.push(proof);
  if(relationKey==='alternative-routes-and-shared-endpoint-dependencies')facts.push(...index.facts.filter(f=>f.predicate==='actual-island-join'&&f.personIds.some(id=>personIds.includes(id))));
  const d:LocalDiscovery={id:'local-discovery:'+contentHash([people.map(p=>p.snapshotHash),relationKey,proof]),relationKey,title,text,personIds,activationIds:acts.map(a=>a.id),factIds:facts.map(f=>f.id),conditions:['Exact saved revisions and current canonical endpoints','Hypothetical additions/removals are not natal facts or time intervals'],limitations:['Computed connectivity is not observed behavior or a decision instruction','No restricted source meaning or named Cross interpretation is added'],proof,kind:'computed-structural-discovery'};
  rows.push(d);(depth==='standard'?standard:deep).push(d);return d;
 };
 const repeated=(composite:boolean)=>{
  for(const p of people)for(const gate of sorted(p.facts.gates)){
   const acts=p.facts.activations.filter(a=>a.gate===gate);if(acts.length<2)continue;
   const withoutOne=p.facts.activations.filter(a=>a.id!==acts[0].id),withoutAll=p.facts.activations.filter(a=>a.gate!==gate),natal=deriveStructure(withoutAll.map(a=>a.gate));
   const lost=p.facts.channels.filter(c=>!natal.channels.some(n=>n.id===c.id));if(!lost.length)continue;
   const combinedBefore=deriveStructure(people.flatMap(p=>p.facts.gates)),combinedAfter=deriveStructure([...withoutAll.map(a=>a.gate),...people.filter(q=>q!==p).flatMap(q=>q.facts.gates)]);
   if(composite&&!lost.some(c=>c.centers.every(center=>combinedAfter.centers.find(v=>v.id===center)?.defined)))continue;
   const labels=acts.map(a=>`${a.side==='design'?'Design':'Personality'} ${a.planet} at ${a.gate}${a.boundaryRisk||p.eligibility!=='exact-point'?' (exact Line uncertain; interpretation withheld)':'.'+a.line}`);
   const proof={personId:p.personId,gate,occurrences:acts,oneRemovedGateStillPresent:withoutOne.some(a=>a.gate===gate),allRemovedNatal:natal,allRemovedCombined:combinedAfter,combinedBefore,lostNatalChannels:lost.map(c=>c.id)};
   emit('occurrence-support-versus-route-survival','A repeated activation is an alternative witness, not another Channel',`${p.birth.name} has Gate ${gate} through ${labels.join(' and ')}. Removing one occurrence leaves that Gate and its completed pathway available. Removing all of this person's Gate ${gate} occurrences removes ${lost.map(c=>chLabel(c.id)).join(', ')} from their natal graph. ${composite?`In the combined counterfactual, ${combinedAfter.definitionIslands.length} groups remain, compared with ${combinedBefore.definitionIslands.length} before removal; the other person's contributions still matter, so natal loss and pair connectivity must be checked separately.`:`The natal group count becomes ${natal.definitionIslands.length}, from ${p.facts.definitionIslands.length}. ${natal.centers.filter(c=>c.defined).length<p.facts.centers.filter(c=>c.defined).length?'Some defined Centers disappear: a lower group count here does not mean formerly separate groups have joined.':''}`} Repetition supplies alternative occurrences; it does not prove stronger energy.`,people.map(p=>p.personId),proof,'deep');return;
  }
 };
 let coverage:any;
 if(index.context==='natal'){
  const p=people[0],e=enumeration(p.facts.gates),joins=e.singles.filter(s=>s.joined.length);
  coverage={absentGates:e.absent,testedSingles:e.singles.length,testedPairs:e.pairs.length,complete:true,singleGateJoins:joins};
  if(joins.length){const every=joins.every(s=>s.createsMotorToThroat);emit('exhaustive-single-gate-join-pattern','What every single-Gate bridge has in common',`${p.birth.name}'s defined Centers form ${p.facts.definitionIslands.length} separate groups: ${groups(p.facts)}. Of all ${e.absent.length} absent Gates tested, the single-Gate additions that join existing groups are ${joins.map(s=>`${s.added[0]} → ${s.addedChannels.map(chLabel).join(' + ')}`).join('; ')}. ${every?'Every one creates a motor-to-Throat path in that hypothetical graph.':'Their exact routes have different consequences; joining groups does not by itself establish a new motor-to-Throat path.'} ${joins.every(s=>s.after.definitionIslands.length>1)?'Each still leaves at least one group separate.':''} This is a feature of the available routes, not a claim that you need a particular person or should change your natal Strategy or Authority.`,[p.personId],{tested:e.absent,joins,universalNewMotorRoute:every},'standard');}
  const alternate=e.pairs.find(s=>s.joined.length&&s.addedCenters.length&&!s.motorToThroat&&s.added.every(g=>!e.singles.find(v=>v.added[0]===g)!.joined.length));
  if(alternate)emit('new-center-mediated-join-without-throat','A bridge can join different groups without reaching the Throat',`A different hypothetical addition, Gates ${alternate.added.join(' + ')}, completes ${alternate.addedChannels.map(chLabel).join(' + ')}. It adds ${alternate.addedCenters.map(c=>CENTER_NAMES[c]).join(', ')} and joins existing groups, leaving ${alternate.after.definitionIslands.length} groups: ${groups(alternate.after)}. There is no motor-to-Throat path in this result. The connection depends on the full route, so “a bridge” cannot be treated as one universal change or a promise about speed.`,[p.personId],alternate,'standard');
  const all=e.pairs.find(s=>p.facts.definitionIslands.length>2&&s.after.definitionIslands.length===1&&s.added.every(g=>e.singles.find(v=>v.added[0]===g)!.after.definitionIslands.length>1));
  if(all)emit('two-complementary-joins-connect-all-groups','Two complementary joins do what one cannot',`Gates ${all.added.join(' + ')} together complete ${all.addedChannels.map(chLabel).join(' + ')} and connect all ${p.facts.definitionIslands.length} original groups. Neither tested addition alone does that. This distinguishes connecting two groups from connecting the whole defined graph; more than one sufficient route can exist. It remains a hypothetical overlay, not permanent natal definition.`,[p.personId],all,'standard');
  const redundant=e.pairs.find(s=>s.joined.length&&s.addedChannels.length>=2&&s.added.every(g=>{const one=e.singles.find(v=>v.added[0]===g)!;return one.joined.length&&JSON.stringify(one.joined)===JSON.stringify(s.joined);})&&s.after.definitionIslands.length>1);
  if(redundant)emit('redundant-joins-do-not-connect-another-island','Two routes can still leave the same group separate',`Adding ${redundant.added.join(' + ')} supplies ${redundant.addedChannels.map(chLabel).join(' and ')}. Both connect the same original groups; the result still has ${redundant.after.definitionIslands.length} groups. Counting two new Channels would therefore overstate how much integration occurred. Remove either proposed addition and compare the remaining witness rather than assuming every edge is uniquely necessary.`,[p.personId],redundant,'deep');
  repeated(false);
 }else{
  const pair=index.composite!,topology=pair.facts.topology;
  const joins=(index.facts.filter(f=>f.predicate==='actual-island-join') as any[]).sort((a,b)=>a.value.personId.localeCompare(b.value.personId)||a.value.witness.edges.map((e:any)=>e.channelId).join(',').localeCompare(b.value.witness.edges.map((e:any)=>e.channelId).join(',')));
  const first=joins[0];
  if(first){const p=actor(first.value.personId),route=first.value.witness.edges.map((e:any)=>e.channelId);emit('actual-pair-join-relative-to-natal','What connects together, compared with each person alone',`${people.map(p=>`${p.birth.name}: ${p.facts.definitionIslands.length} natal groups`).join('; ')}. The combined chart has ${topology.combinedGraph.components.length} groups. One sufficient route joining ${p.birth.name}'s previously separate groups is ${route.map(chLabel).join(' + ')}. This result belongs to the combined graph; it does not rewrite either person's natal Type or Authority, and one witness does not establish that the route is unique.`,people.map(p=>p.personId),first,'standard');}
  const changed=topology.centers.filter(c=>people.some(p=>c.combinedDefined&&!p.facts.centers.find(n=>n.id===c.centerId)?.defined));
  if(changed.length)emit('center-state-depends-on-comparison-baseline','New for one person is different from new for both',changed.map(c=>`${CENTER_NAMES[c.centerId]} is defined together; ${people.map(p=>`${p.birth.name}'s natal state is ${p.facts.centers.find(n=>n.id===c.centerId)?.defined?'defined':p.facts.activations.some(a=>a.center===c.centerId)?'undefined with activated Gates':'completely open'}`).join(', ')}. ${c.combinedOnly?'It is absent as definition from both natal charts.':'It is already defined for at least one person; calling it new for both would be wrong.'}`).join(' ')+' Each statement needs its own natal baseline and complete Channel evidence.',people.map(p=>p.personId),changed,'standard');
  const shared=pair.facts.channelRelations.filter(c=>c.classification==='companionship'),newly=pair.facts.channelRelations.filter(c=>c.combinedOnly);
  if(shared.length&&newly.length)emit('ownership-versus-new-pair-completion','Shared ownership and a new completion contribute differently',`${shared.map(c=>chLabel(c.channelId)).join(', ')} ${shared.length===1?'is':'are'} already complete in both natal charts. In contrast, ${newly.map(c=>chLabel(c.channelId)).join(', ')} ${newly.length===1?'is':'are'} completed only when the participants' endpoints combine. The first does not require the other person to supply a missing endpoint; the second does. These are contribution patterns, not proof of shared intentions or obligations.`,people.map(p=>p.personId),{shared,newly},'standard');
  if(first){const other=joins.find(f=>f.value.personId===first.value.personId&&JSON.stringify(f.value.witness.edges.map((e:any)=>e.channelId))!==JSON.stringify(first.value.witness.edges.map((e:any)=>e.channelId)));if(other){const routes=[first,other].map(f=>f.value.witness.edges.map((e:any)=>e.channelId));const common=sorted(routes[0].flatMap((id:string)=>runtime.channels.find(c=>c.id===id)!.gates)).filter(g=>routes[1].some((id:string)=>runtime.channels.find(c=>c.id===id)!.gates.includes(g)));const removed=common[0];const after=removed?deriveStructure(index.activations.filter(a=>a.gate!==removed).map(a=>a.gate)):null;emit('alternative-routes-and-shared-endpoint-dependencies','Different Channel routes can share a vulnerable endpoint',`Two sufficient routes for ${actor(first.value.personId).birth.name} are ${routes.map(r=>r.map(chLabel).join(' + ')).join(' versus ')}. ${removed?`They both use Gate ${removed}; removing all combined occurrences of that Gate leaves ${after!.definitionIslands.length} groups in a fresh counterfactual calculation. Different route names therefore do not prove independent support.`:'Their contribution support must be checked separately before claiming that either route is necessary.'} Remaining routes are recalculated; loss of a particular witness is not automatically loss of every connection.`,people.map(p=>p.personId),{routes,removedGate:removed??null,after},'deep');}}
  repeated(true);coverage={actualPairFacts:true,fullNatalBaselines:true,friendshipScope:'No romantic or sexual interpretation is inferred'};
 }
 const gaps=[...(standard.length<3?[`Only ${standard.length} distinct structural themes are supported in this pilot; Standard is incomplete.`]:[]),...(deep.length<2?[`Only ${deep.length} additional relations are supported; Deep is incomplete.`]:[]),'This finite structural pilot is not the full canonical personal or relationship interpretation architecture.'];
 return freezeReadingValue({schema:'AuricLocalDiscoveryV1',authorization:'S48-CONTEXT-LOCAL-20261025',indexHash:index.indexHash,participants:people.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash})),catalogSha256:datasetPin.files['app1_runtime.min.json'].sha256,standard,deep,discoveries:rows,coverage,gaps,sourceUse:'computed application mechanics, no new psychological teaching',providerCalls:0});
}
