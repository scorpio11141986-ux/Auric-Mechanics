import { runtime, centerId, datasetPin } from '../content/records';
import { CENTER_NAMES, type CenterId } from './contracts';
import type { CompositeCalculationV1 } from './composite-contracts';
import { analyzePairEndpoints, mechanicsTraceFor } from './composite';
import { canonicalJson, contentHash } from './composite-hash';
import type { BridgeAlternative, BridgeAnalysisV1, BridgeBaseline, BridgeContext, BridgeContribution, BridgeFixture, BridgeGraph, BridgeRequest, BridgeTarget, BridgeWitness } from './bridges-contracts';
export type * from './bridges-contracts';

const compareText=(a:string,b:string)=>a<b?-1:a>b?1:0;
const catalog=[...runtime.channels].sort((a,b)=>compareText(a.id,b.id));
const gateNumbers=new Set(runtime.gates.map(g=>g.gate_number));
const centerNames=Object.keys(CENTER_NAMES) as CenterId[];
const ordered=<T extends string|number>(a:readonly T[])=>[...new Set(a)].sort((x,y)=>typeof x==='number'&&typeof y==='number'?x-y:compareText(String(x),String(y)));
const equal=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const freeze=<T>(a:T):T=>{if(a&&typeof a==='object'&&!Object.isFrozen(a)){Object.values(a).forEach(freeze);Object.freeze(a);}return a;};
const nonclaims=['Hypothetical Gates are prerequisites, not calculated planets, people or transits.','Completeness applies only to the declared candidate universe, maximum additions and budgets; F10 release policy remains open.','No compatibility score, behavioral prediction, combined natal identity or rights/authenticity approval.'];
export const BRIDGE_LIMITS={candidateGates:16,maxStates:1_000_000,maxElapsedMs:30_000,maxAlternatives:512,maxPaths:128,maxPathSteps:1_000_000} as const;
type Options={signal?:AbortSignal;onProgress?:(p:{visitedSubsets:number;evaluatedGraphs:number;alternatives:number})=>void};
const refused=(reason:string,status:BridgeAnalysisV1['status']='unsupported'):BridgeAnalysisV1=>freeze({schema:'BridgeAnalysisV1',algorithm:'CM02-1.0.0',resultId:`bridge:${contentHash([status,reason])}`,status,targetState:'unresolved',reason,baseline:null,request:null,alternatives:[],coverage:{candidateGates:[],excludedAbsentGates:[],ignoredPresentGates:[],maxAddedGates:0,visitedSubsets:0,evaluatedGraphs:0,skippedSupersets:0,pathSteps:0,gateSetsComplete:false,pathsComplete:false,elapsedMs:0,bounds:null},sharedAcrossExhaustiveAlternatives:null,nonclaims:[...nonclaims]});
function validateCatalog(){
  if(gateNumbers.size!==64||catalog.length!==36)throw Error('The pinned 64-Gate/36-Channel catalog is unavailable.');
  for(const c of catalog)for(let i=0;i<2;i++)if(!gateNumbers.has(c.gates[i])||centerId(runtime.gates.find(g=>g.gate_number===c.gates[i])!.center)!==centerId(c.centers[i]))throw Error('Channel/Center mapping is incompatible; results withheld.');
}
export function compositeBridgeContext(c:CompositeCalculationV1):BridgeContext{
  mechanicsTraceFor(c,c.facts.mechanicsFacts[0]?.id,{calculationId:c.calculationId});
  return {relationshipId:c.relationshipId,calculationId:c.calculationId,factsHash:c.factsHash,catalogHash:c.pins.catalogSHA256,inputRefs:c.inputs.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash})).sort((a,b)=>compareText(a.personId,b.personId))};
}
function graph(gates:readonly number[]):BridgeGraph{
  const presence=ordered(gates),edges=catalog.filter(c=>c.gates.every(g=>presence.includes(g))).map(c=>({channelId:c.id,gates:[...c.gates] as [number,number],centers:c.centers.map(centerId) as [CenterId,CenterId]}));
  const definedCenters=ordered(edges.flatMap(e=>e.centers)),components:CenterId[][]=[],seen=new Set<CenterId>();
  for(const start of definedCenters){if(seen.has(start))continue;const queue=[start],part:CenterId[]=[];seen.add(start);while(queue.length){const next=queue.shift()!;part.push(next);for(const edge of edges.filter(e=>e.centers.includes(next))){const to=edge.centers.find(c=>c!==next)!;if(!seen.has(to)){seen.add(to);queue.push(to);}}}components.push(ordered(part));}
  return {id:`bridge-graph:${contentHash([presence,datasetPin.files['app1_runtime.min.json'].sha256])}`,gates:presence,edges,definedCenters,components};
}
function scoped(b:BridgeBaseline,scope:BridgeRequest['scope']):BridgeBaseline{
  if(scope!=='pair'&&(!scope||typeof scope.personId!=='string'||!b.context.inputRefs.some(p=>p.personId===scope.personId)))throw Error('Baseline participant does not belong to this pinned pair.');
  const contributions=b.contributions.filter(c=>scope==='pair'||c.personId===scope.personId);
  return freeze({...b,scope,contributions,graph:graph(contributions.map(c=>c.gate))});
}
function natalBaseline(c:CompositeCalculationV1):BridgeBaseline{
  const context=compositeBridgeContext(c);
  if(c.facts.eligibility!=='exact-point'&&c.facts.eligibility!=='provisional-point')throw Error('Birth eligibility is unavailable; range/unknown inputs require CM-03.');
  if(context.catalogHash!==datasetPin.files['app1_runtime.min.json'].sha256)throw Error('Stale calculation catalog; explicitly recalculate first.');
  return freeze({basis:'validated-pinned-natal',eligibility:c.facts.eligibility,context,scope:'pair',graph:graph(c.facts.contributions.map(c=>c.gate)),contributions:c.facts.contributions.map(c=>({kind:'natal' as const,...c})),natalGraphs:c.facts.topology.natalGraphs});
}
function fixtureBaseline(f:BridgeFixture):BridgeBaseline{
  if(!f||!Array.isArray(f.people)||f.people.length!==2||f.people[0].personId===f.people[1].personId)throw Error('Two distinct structural fixture identities are required.');
  const people=[...f.people].sort((a,b)=>compareText(a.personId,b.personId));
  for(const p of people)if(typeof p.personId!=='string'||!p.personId.trim()||!Array.isArray(p.gates)||p.gates.some(g=>!Number.isInteger(g)||!gateNumbers.has(g)))throw Error('Invalid synthetic Gate/identity fixture.');
  const records:NonNullable<BridgeFixture['records']>=f.records||people.flatMap(p=>ordered(p.gates).map(g=>({id:`fixture:${p.personId}:gate:${g}`,personId:p.personId,gate:g})));
  if(records.length>256)throw Error('Structural reference record inventory exceeds its finite bound.');
  if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Fixture contribution identities must remain unique.');
  const contributions:BridgeContribution[]=records.map((r):BridgeContribution=>{if(typeof r.id!=='string'||!r.id.trim()||!people.some(p=>p.personId===r.personId&&p.gates.includes(r.gate))||(r.line!==undefined&&(!Number.isInteger(r.line)||r.line<1||r.line>6))||(r.side!==undefined&&!['personality','design'].includes(r.side))||(r.planet!==undefined&&typeof r.planet!=='string'))throw Error('Fixture provenance is incompatible with its Gate source.');return {kind:'synthetic-reference',id:r.id,activationId:r.id,personId:r.personId,gate:r.gate,line:r.line??null,planet:r.planet??null,side:r.side??null,chartVersionId:null,snapshotHash:null};}).sort((a,b)=>compareText(a.id,b.id));
  if(people.some(p=>p.gates.some(g=>!contributions.some(c=>c.personId===p.personId&&c.gate===g))))throw Error('Fixture contains a Gate with no source record.');
  const topology=analyzePairEndpoints(people[0],people[1]);const key=contentHash([people.map(p=>({...p,gates:ordered(p.gates)})),contributions]);
  return freeze({basis:'synthetic-gate-fixture',eligibility:'synthetic-reference',scope:'pair',context:{relationshipId:`fixture-pair:${contentHash(people.map(p=>p.personId))}`,calculationId:`fixture:${key}`,factsHash:key,catalogHash:datasetPin.files['app1_runtime.min.json'].sha256,inputRefs:people.map(p=>({personId:p.personId,chartVersionId:null,snapshotHash:null}))},contributions,graph:graph(contributions.map(c=>c.gate)),natalGraphs:topology.natalGraphs});
}
type Goal={connections:[CenterId,CenterId][];targetState:'applicable'|'not_applicable'|'single_island';channelId?:string;requiredCenters?:CenterId[]};
function goal(b:BridgeBaseline,t:BridgeTarget):Goal{
  if(!t||typeof t.kind!=='string')throw Error('Declare a supported structural target.');
  if(t.kind==='completeChannel'){const c=catalog.find(c=>c.id===t.channelId);if(!c)throw Error('Unknown canonical Channel.');return {connections:[c.centers.map(centerId) as [CenterId,CenterId]],channelId:c.id,targetState:'applicable'};}
  if(t.kind==='connectCenters'){if(!Array.isArray(t.centers)||t.centers.length!==2||t.centers.some(c=>!centerNames.includes(c))||t.centers[0]===t.centers[1])throw Error('Choose two distinct canonical Centers.');return {connections:[t.centers],targetState:'applicable'};}
  if(t.kind!=='joinSelectedIslands'&&t.kind!=='joinAllNatalIslands')throw Error('Unsupported target; no transit or interpretation calculation.');
  if(b.scope!=='pair'&&b.scope.personId!==t.personId)throw Error('Target natal islands belong to a different baseline participant.');
  const natal=b.natalGraphs.find(g=>g.scope.personIds[0]===t.personId);if(!natal)throw Error('Target person is outside the pinned pair.');
  let parts=natal.components;
  if(t.kind==='joinSelectedIslands'){if(!Array.isArray(t.islandIds)||!t.islandIds.length||new Set(t.islandIds).size!==t.islandIds.length||t.islandIds.some(id=>!parts.some(p=>p.id===id)))throw Error('Selected island IDs are stale or do not belong to this natal graph.');parts=parts.filter(p=>t.islandIds.includes(p.id));}
  parts=[...parts].sort((a,b)=>compareText(a.id,b.id));
  if(!parts.length)return {connections:[],targetState:'not_applicable'};
  if(parts.length===1)return {connections:[],targetState:'single_island',requiredCenters:parts[0].centerIds};
  // Stable representatives preserve full Center/Channel paths, including preexisting island segments.
  const start=parts[0].centerIds.at(-1)!;
  return {connections:parts.slice(1).map(p=>[start,p.centerIds[0]]),targetState:'applicable',requiredCenters:ordered(parts.flatMap(p=>p.centerIds))};
}
const satisfied=(g:BridgeGraph,goal:Goal)=>goal.channelId?g.edges.some(e=>e.channelId===goal.channelId):(!goal.requiredCenters?.length||g.components.some(p=>goal.requiredCenters!.every(c=>p.includes(c))))&&goal.connections.every(([a,b])=>g.components.some(p=>p.includes(a)&&p.includes(b)));
function path(g:BridgeGraph,from:CenterId,to:CenterId):BridgeGraph['edges']|null{
  const queue=[from],seen=new Set<CenterId>([from]),previous=new Map<CenterId,{from:CenterId;edge:BridgeGraph['edges'][number]}>();
  while(queue.length){const current=queue.shift()!;if(current===to)break;for(const edge of g.edges.filter(e=>e.centers.includes(current))){const next=edge.centers.find(c=>c!==current)!;if(!seen.has(next)){seen.add(next);previous.set(next,{from:current,edge});queue.push(next);}}}
  if(!seen.has(to))return null;const result:BridgeGraph['edges']=[];let current=to;while(current!==from){const step=previous.get(current)!;result.unshift(step.edge);current=step.from;}return result;
}
function witness(b:BridgeBaseline,g:BridgeGraph,added:number[],from:CenterId,to:CenterId,route:BridgeGraph['edges']):BridgeWitness{
  let current=from;const centers=[from],edges=route.map(edge=>{const next=edge.centers.find(c=>c!==current)!;const result={channelId:edge.channelId,gates:edge.gates,from:current,to:next,preexisting:b.graph.edges.some(e=>e.channelId===edge.channelId),endpoints:edge.gates.map(gate=>({gate,contributionIds:ordered(b.contributions.filter(c=>c.gate===gate).map(c=>c.id)),hypotheticalIds:added.includes(gate)?[`hypothetical:${contentHash([b.context,b.scope,gate])}`]:[]}))};centers.push(next);current=next;return result;});
  if(current!==to)throw Error('Incomplete witness route.');return {id:`bridge-witness:${contentHash([b.context,g.id,centers,edges.map(e=>e.channelId)])}`,from,to,centers,edges,claim:'sufficient-complete-path'};
}
function deltaFor(b:BridgeBaseline,after:BridgeGraph):BridgeAlternative['delta']{
  return {addedChannelIds:after.edges.filter(e=>!b.graph.edges.some(x=>x.channelId===e.channelId)).map(e=>e.channelId),unchangedChannelIds:b.graph.edges.map(e=>e.channelId),addedCenterIds:after.definedCenters.filter(c=>!b.graph.definedCenters.includes(c)),componentCountBefore:b.graph.components.length,componentCountAfter:after.components.length,islandMappings:b.natalGraphs.filter(g=>b.scope==='pair'||g.scope.personIds[0]===b.scope.personId).flatMap(g=>g.components.map(p=>({personId:g.scope.personIds[0],islandId:p.id,centers:p.centerIds,afterComponent:after.components.findIndex(x=>p.centerIds.every(c=>x.includes(c)))})))};
}
function* subsets(a:number[],size:number,start=0,prefix:number[]=[]):Generator<number[]>{if(prefix.length===size){yield prefix;return;}for(let i=start;i<=a.length-(size-prefix.length);i++)yield*subsets(a,size,i+1,[...prefix,a[i]]);}
function boundsFor(q:BridgeRequest,universe:number[]){
  const b=q.bounds;if(!b||!Number.isInteger(b.maxStates)||b.maxStates<1||b.maxStates>BRIDGE_LIMITS.maxStates||!Number.isFinite(b.maxElapsedMs)||b.maxElapsedMs<1||b.maxElapsedMs>BRIDGE_LIMITS.maxElapsedMs)throw Error('Finite state and elapsed-time budgets are required; uncapped requests are unsupported.');
  const result={...b,maxAddedGates:b.maxAddedGates??universe.length,maxAlternatives:b.maxAlternatives??128,maxPaths:b.maxPaths??32,maxPathSteps:b.maxPathSteps??10000};
  if(!Number.isInteger(result.maxAddedGates)||result.maxAddedGates<0||result.maxAddedGates>BRIDGE_LIMITS.candidateGates)throw Error('Invalid maximum Gate additions.');
  for(const [value,cap] of [[result.maxAlternatives,BRIDGE_LIMITS.maxAlternatives],[result.maxPaths,BRIDGE_LIMITS.maxPaths],[result.maxPathSteps,BRIDGE_LIMITS.maxPathSteps]])if(!Number.isInteger(value)||value<1||value>cap)throw Error('Path/result budgets exceed permitted bounds.');
  return result;
}
async function solve(b:BridgeBaseline,q:BridgeRequest,options:Options):Promise<BridgeAnalysisV1>{
  validateCatalog();if(q.expectedContext&&!equal(q.expectedContext,b.context))throw Error('Stale pinned calculation or snapshot context; results withheld.');
  b=scoped(b,q.scope);
  if(!Array.isArray(q.candidateGates)||q.candidateGates.length>64||q.candidateGates.some(g=>!Number.isInteger(g)||!gateNumbers.has(g)))throw Error('Candidate universe must contain canonical integer Gates.');
  const ignoredPresentGates=ordered(q.candidateGates.filter(g=>b.graph.gates.includes(g))),universe=ordered(q.candidateGates.filter(g=>!b.graph.gates.includes(g)));
  if(universe.length>BRIDGE_LIMITS.candidateGates)throw Error('Candidate universe exceeds 16 Gates; narrow the declared search.');
  const bounds=boundsFor(q,universe),target=goal(b,q.target),start=Date.now();let visitedSubsets=0,evaluatedGraphs=0,skippedSupersets=0,pathSteps=0,stopReason:string|null=null;
  let gateSetsComplete=true,pathsComplete=true;const alternatives:BridgeAlternative[]=[];
  const limit=()=>options.signal?.aborted?'Request cancelled; partial results are not an absence claim.':Date.now()-start>=bounds.maxElapsedMs?'Elapsed-time budget exhausted.':visitedSubsets>=bounds.maxStates?'Subset-state budget exhausted.':null;
  if(target.targetState!=='not_applicable')outer:for(let size=0;size<=Math.min(bounds.maxAddedGates,universe.length);size++)for(const additions of subsets(universe,size)){
    stopReason=limit();if(stopReason){gateSetsComplete=false;break outer;}visitedSubsets++;
    if(visitedSubsets%64===0){options.onProgress?.({visitedSubsets,evaluatedGraphs,alternatives:alternatives.length});await new Promise<void>(resolve=>setTimeout(resolve,0));if(options.signal?.aborted){gateSetsComplete=false;stopReason='Request cancelled; remaining alternatives were not searched.';break outer;}}
    if(alternatives.some(a=>a.gates.every(g=>additions.includes(g)))){skippedSupersets++;continue;}
    const after=graph([...b.graph.gates,...additions]);evaluatedGraphs++;
    if(satisfied(after,target)){
      const minimality=additions.map(removedGate=>{const without=graph([...b.graph.gates,...additions.filter(g=>g!==removedGate)]);if(satisfied(without,target))throw Error('A returned alternative has a redundant prerequisite.');return {removedGate,goalSatisfied:false as const,graphId:without.id};});
      const witnesses:BridgeWitness[]=[];let witnessComplete=true,witnessReason:string|null=null;
      for(const [from,to] of target.connections){
        const first=target.channelId?after.edges.filter(e=>e.channelId===target.channelId):path(after,from,to);
        if(!first)throw Error('Satisfied target has no sufficient complete witness.');
        const group=new Map<string,BridgeWitness>();const required=witness(b,after,additions,from,to,first);group.set(required.id,required);
        if(!target.channelId){
          const walk=(current:CenterId,seen:Set<CenterId>,route:BridgeGraph['edges']):boolean=>{
            if(pathSteps>=bounds.maxPathSteps||Date.now()-start>=bounds.maxElapsedMs||options.signal?.aborted){witnessComplete=false;witnessReason='Supplemental simple-path enumeration reached its budget or cancellation; sufficient full paths remain proved.';return false;}
            pathSteps++;
            if(current===to){const w=witness(b,after,additions,from,to,route);if(!group.has(w.id)&&group.size>=bounds.maxPaths){witnessComplete=false;witnessReason='Maximum retained paths per target connection reached.';return false;}group.set(w.id,w);return true;}
            for(const e of after.edges.filter(e=>e.centers.includes(current))){const next=e.centers.find(c=>c!==current)!;if(!seen.has(next)&&!walk(next,new Set([...seen,next]),[...route,e]))return false;}return true;
          };walk(from,new Set([from]),[]);
        }
        witnesses.push(...[...group.values()].sort((a,b)=>compareText(a.id,b.id)));
      }
      pathsComplete&&=witnessComplete;
      alternatives.push({id:`bridge-alternative:${contentHash([b.context,b.scope,q.target,additions])}`,gates:additions,hypothetical:additions.map(gate=>({kind:'hypothetical-gate',gate,id:`hypothetical:${contentHash([b.context,b.scope,gate])}`})),graph:after,witnesses,witnessCoverage:{complete:witnessComplete,reason:witnessReason},minimality,delta:deltaFor(b,after)});
      if(!additions.length)break outer;
      if(alternatives.length>=bounds.maxAlternatives){gateSetsComplete=false;stopReason='Alternative-result budget reached; additional minimal alternatives may exist.';break outer;}
    }
  }
  options.onProgress?.({visitedSubsets,evaluatedGraphs,alternatives:alternatives.length});
  const status=options.signal?.aborted?'stopped':gateSetsComplete&&pathsComplete?'exhaustive':'bounded_partial';
  const result:BridgeAnalysisV1={schema:'BridgeAnalysisV1',algorithm:'CM02-1.0.0',resultId:`bridge:${contentHash([b.context,b.scope,q.target,universe,bounds,status,alternatives.map(a=>[a.id,a.witnesses.map(w=>w.id)])])}`,status,targetState:target.targetState==='not_applicable'?'not_applicable':alternatives.some(a=>!a.gates.length)?'already_satisfied':alternatives.length?'solutions_found':status==='exhaustive'?'no_solution_within_scope':'unresolved',reason:stopReason||(!pathsComplete?'Gate-set search may be complete, but retained path coverage is bounded.':target.targetState==='not_applicable'?'This person has no defined natal islands to join.':null),baseline:b,request:{...q,candidateGates:universe,bounds},alternatives,coverage:{candidateGates:universe,excludedAbsentGates:ordered([...gateNumbers].filter(g=>!b.graph.gates.includes(g)&&!universe.includes(g))),ignoredPresentGates,maxAddedGates:Math.min(bounds.maxAddedGates,universe.length),visitedSubsets,evaluatedGraphs,skippedSupersets,pathSteps,gateSetsComplete,pathsComplete,elapsedMs:Date.now()-start,bounds},sharedAcrossExhaustiveAlternatives:status==='exhaustive'&&alternatives.length?alternatives[0].gates.filter(g=>alternatives.every(a=>a.gates.includes(g))):null,nonclaims:[...nonclaims]};
  for(const a of alternatives){const proof=replayBridgeAlternative(result,a);if(!proof.valid)throw Error('Internal witness replay failed: '+proof.failures.join('; '));}
  return freeze(result);
}
export async function solveCompositeBridges(c:CompositeCalculationV1,q:BridgeRequest,options:Options={}):Promise<BridgeAnalysisV1>{if(options.signal?.aborted)return refused('Request cancelled before calculation.','stopped');try{return await solve(natalBaseline(c),q,options);}catch(e){return refused((e as Error).message);}}
/** Formal sparse reference seam only. Never a natal import or an ephemeris calculation. */
export async function solveBridgeFixture(f:BridgeFixture,q:BridgeRequest,options:Options={}):Promise<BridgeAnalysisV1>{if(options.signal?.aborted)return refused('Request cancelled before reference search.','stopped');try{return await solve(fixtureBaseline(f),q,options);}catch(e){return refused((e as Error).message);}}
export function replayBridgeAlternative(r:BridgeAnalysisV1,a:BridgeAlternative):{valid:boolean;failures:string[]}{
  try{return replayProof(r,a);}catch(e){return {valid:false,failures:['Malformed proof: '+(e as Error).message]};}
}
function replayProof(r:BridgeAnalysisV1,a:BridgeAlternative):{valid:boolean;failures:string[]}{
  const failures:string[]=[];if(!r.baseline||!r.request)return {valid:false,failures:['Missing declared baseline/target.']};
  const b=r.baseline,t=goal(b,r.request.target),g=graph([...b.graph.gates,...a.gates]);
  if(!equal(g,a.graph)||!satisfied(g,t))failures.push('Candidate does not replay its complete graph/goal.');
  if(!equal(a.delta,deltaFor(b,g)))failures.push('Incorrect complete structural change metadata.');
  if(a.gates.some(x=>!r.coverage.candidateGates.includes(x))||new Set(a.gates).size!==a.gates.length)failures.push('Prerequisites are outside the declared universe.');
  for(const gate of a.gates)if(satisfied(graph([...b.graph.gates,...a.gates.filter(x=>x!==gate)]),t))failures.push('Redundant prerequisite.');
  if(!equal(a.minimality,a.gates.map(removedGate=>({removedGate,goalSatisfied:false,graphId:graph([...b.graph.gates,...a.gates.filter(x=>x!==removedGate)]).id}))))failures.push('Minimality proof is missing or incorrect.');
  if(!equal(a.hypothetical,a.gates.map(gate=>({kind:'hypothetical-gate',gate,id:`hypothetical:${contentHash([b.context,b.scope,gate])}`}))))failures.push('Hypothetical sources are missing or invented.');
  if(t.channelId&&a.witnesses.some(w=>w.edges.length!==1||w.edges[0].channelId!==t.channelId))failures.push('Witness does not prove the selected complete Channel.');
  if(new Set(a.witnesses.map(w=>w.id)).size!==a.witnesses.length)failures.push('Duplicate witness evidence.');
  if(a.witnesses.some(w=>!t.connections.some(([from,to])=>w.from===from&&w.to===to)))failures.push('Witness is outside the declared target connection.');
  for(const [from,to] of t.connections)if(!a.witnesses.some(w=>w.from===from&&w.to===to))failures.push('A required target connection has no witness.');
  for(const w of a.witnesses){if(w.centers.length!==w.edges.length+1||w.centers[0]!==w.from||w.centers.at(-1)!==w.to||new Set(w.centers).size!==w.centers.length)failures.push('Witness is incomplete or cyclic.');let current=w.from;for(let i=0;i<w.edges.length;i++){const e=w.edges[i],actual=g.edges.find(x=>x.channelId===e.channelId);if(!actual||!actual.centers.includes(e.from)||!actual.centers.includes(e.to)||e.from!==current||e.to!==w.centers[i+1]||!equal(e.gates,actual.gates))failures.push('Invalid ordered Channel edge.');for(const end of e.endpoints){const expected=ordered(b.contributions.filter(c=>c.gate===end.gate).map(c=>c.id));const hypot=a.gates.includes(end.gate)?[`hypothetical:${contentHash([b.context,b.scope,end.gate])}`]:[];if(!equal(expected,end.contributionIds)||!equal(hypot,end.hypotheticalIds)||!actual?.gates.includes(end.gate)||!expected.length&&!hypot.length)failures.push('Endpoint provenance lost or invented.');}if(e.endpoints.length!==2||new Set(e.endpoints.map(x=>x.gate)).size!==2)failures.push('Missing endpoint.');current=e.to;}}
  for(const w of a.witnesses){
    const route=w.edges.map(e=>g.edges.find(edge=>edge.channelId===e.channelId)!);
    if(!equal(w,witness(b,g,a.gates,w.from,w.to,route)))failures.push('Witness identity, claim or newness attribution is incorrect.');
  }
  return {valid:!failures.length,failures};
}
export function analyzeBridgeRemoval(c:CompositeCalculationV1,removal:{personId:string}|{contributionId:string},scope:BridgeRequest['scope']='pair',target?:BridgeTarget){
  const b=scoped(natalBaseline(c),scope),removed=b.contributions.filter(x=>'personId' in removal?x.personId===removal.personId:x.id===removal.contributionId);if(!removed.length)throw Error('Removal reference is outside this pinned baseline.');
  const ids=new Set(removed.map(c=>c.id)),remaining=b.contributions.filter(c=>!ids.has(c.id)),after=graph(remaining.map(c=>c.gate));
  const intended=target?goal(b,target):null,targetReached=intended&&intended.targetState!=='not_applicable'?satisfied(after,intended):null;
  const connections=intended?.requiredCenters?.length?intended.requiredCenters.slice(1).map(to=>[intended.requiredCenters![0],to] as [CenterId,CenterId]):intended?.connections||[];
  const counterBaseline={...b,contributions:remaining,context:{...b.context,factsHash:`counterfactual:${contentHash([b.context.factsHash,ordered([...ids])])}`}};
  const survivingWitnesses=connections.flatMap(([from,to])=>{const route=intended?.channelId?after.edges.filter(e=>e.channelId===intended.channelId):path(after,from,to);return route?.length?[witness(counterBaseline,after,[],from,to,route)]:[];});
  return freeze({kind:'read-only-removal-counterfactual',context:b.context,scope,removedContributionIds:ordered([...ids]),remainingContributions:remaining,graph:after,targetReached,survivingWitnesses,lostGateNumbers:b.graph.gates.filter(g=>!after.gates.includes(g)),lostChannelIds:b.graph.edges.filter(e=>!after.edges.some(x=>x.channelId===e.channelId)).map(e=>e.channelId),lostCenterIds:b.graph.definedCenters.filter(x=>!after.definedCenters.includes(x)),originalNatalIslandMappings:b.natalGraphs.flatMap(g=>g.components.map(p=>({personId:g.scope.personIds[0],islandId:p.id,remainingComponents:after.components.map((cs,i)=>p.centerIds.some(c=>cs.includes(c))?i:null).filter(x=>x!==null),lostCenters:p.centerIds.filter(x=>!after.definedCenters.includes(x))}))),permanentClassificationMutation:'none' as const,nonclaims:['Removing contributions here is a structural counterfactual, not a deletion, personal prediction or emotional necessity claim.']});
}
export function exportBridgeReceipt(r:BridgeAnalysisV1):string{
  const fingerprint=(id:string)=>contentHash(id);
  return JSON.stringify({schema:'BridgeReferenceReceiptV1',referenceOnly:true,importAsCalculatedFacts:false,algorithm:r.algorithm,resultId:r.resultId,status:r.status,targetState:r.targetState,eligibility:r.baseline?.eligibility||null,basis:r.baseline?.basis||null,reason:r.reason,contextFingerprint:r.baseline?contentHash(r.baseline.context):null,scope:r.baseline?.scope==='pair'?'pair':'selected-person',candidateGates:r.coverage.candidateGates,excludedAbsentGates:r.coverage.excludedAbsentGates,coverage:r.coverage,target:r.request?.target?{...r.request.target,...('personId' in r.request.target?{personIdFingerprint:fingerprint(r.request.target.personId),personId:undefined}:{})}:null,alternatives:r.alternatives.map(a=>({id:a.id,gates:a.gates,delta:{addedChannelIds:a.delta.addedChannelIds,addedCenterIds:a.delta.addedCenterIds,componentCountBefore:a.delta.componentCountBefore,componentCountAfter:a.delta.componentCountAfter},witnessCoverage:a.witnessCoverage,witnesses:a.witnesses.map(w=>({...w,edges:w.edges.map(e=>({...e,endpoints:e.endpoints.map(p=>({gate:p.gate,contributionFingerprints:p.contributionIds.map(fingerprint),hypotheticalIds:p.hypotheticalIds}))}))}))})),sharedAcrossExhaustiveAlternatives:r.sharedAcrossExhaustiveAlternatives,nonclaims:r.nonclaims,redactions:['Names, birth details, coordinates, longitudes, natal activation payloads and raw person/version/contribution identities omitted.']},null,2);
}
