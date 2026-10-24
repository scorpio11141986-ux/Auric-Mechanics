import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateChart,PLANETS } from '../src/domain/calculator';
import { calculateComposite,createParticipantSnapshot } from '../src/domain/composite';
import { compositeBridgeContext,solveCompositeBridges } from '../src/domain/bridges';
import { contentHash } from '../src/domain/composite-hash';
import type { BirthRecordV1 } from '../src/domain/contracts';
import { initialBridgeExplorer,bridgeExplorerReducer } from '../src/ui/bridge-explorer-state';
import { initialCompositeWorkspace,compositeReducer } from '../src/ui/composite-workspace-state';
import { unavailableTemporalAdapter,type ActivationSource,type WorkspaceContext } from '../src/ui/composite-temporal-contract';
import { emptyCompositeState,saveRelationship,rebuildComposite,readCompositeState,writeCompositeState,removePersonAndDependents,type CompositeAppStateV2,type StoragePort } from '../src/persistence/composite-state';
import { replacePerson } from '../src/persistence/state';
import { snapshotFromPerson } from '../src/domain/composite';

function participant(id:string,date:string){const birth:BirthRecordV1={schema:'BirthRecordV1',id,name:'Synthetic same label',date,localTime:'00:00',timezone:'UTC',latitude:0,longitude:0,place:'Synthetic public test',confidence:'exact',source:'user-entered',updatedAt:'2026-10-13T00:00:00.000Z'};return createParticipantSnapshot({origin:'application-calculated',personId:id,chartVersionId:`${id}:${birth.updatedAt}`,birth,facts:calculateChart(birth)});}
const C=calculateComposite(participant('explorer-A','2024-01-01'),participant('explorer-B','2024-06-01'));
const context=compositeBridgeContext(C),key=contentHash(context);
const query={scope:'pair' as const,target:{kind:'connectCenters' as const,centers:['Head','G'] as ['Head','G']},candidateGates:[4,11,17,23,43,47,56,61,62],bounds:{maxStates:30000,maxElapsedMs:10000,maxPaths:128,maxPathSteps:100000}};

test('Explorer rejects stale generations, wrong pinned contexts and structural fixtures at the production UI boundary',async()=>{
  const result=await solveCompositeBridges(C,query);let s=bridgeExplorerReducer(initialBridgeExplorer(key),{type:'start'});
  assert.equal(bridgeExplorerReducer(s,{type:'result',generation:0,result}).result,null);
  const wrong=structuredClone(result);wrong.baseline!.context.factsHash='another-version';
  assert.equal(bridgeExplorerReducer(s,{type:'result',generation:s.generation,result:wrong}).result,null);
  const fake=structuredClone(result);fake.baseline!.basis='synthetic-gate-fixture';
  assert.equal(bridgeExplorerReducer(s,{type:'result',generation:s.generation,result:fake}).result,null);
  s=bridgeExplorerReducer(s,{type:'cancel'});assert.equal(s.running,false);assert.equal(bridgeExplorerReducer(s,{type:'result',generation:s.generation-1,result}).result,null);
});

test('Explorer options, local Back and Full entry preserve exact reader/selection and share the unchanged natal chart return contract',async()=>{
  const result=await solveCompositeBridges(C,query);assert.ok(result.alternatives.length>1);
  let s=bridgeExplorerReducer(initialBridgeExplorer(key),{type:'start'});s=bridgeExplorerReducer(s,{type:'result',generation:s.generation,result});
  s=bridgeExplorerReducer(s,{type:'level',level:'expanded'});s=bridgeExplorerReducer(s,{type:'scroll',id:s.selectedId!,scrollY:117});const entry=structuredClone(s);
  s=bridgeExplorerReducer(s,{type:'full'});s=bridgeExplorerReducer(s,{type:'select',id:result.alternatives[1].id});s=bridgeExplorerReducer(s,{type:'back'});assert.equal(s.selectedId,entry.selectedId);
  s=bridgeExplorerReducer(s,{type:'return'});assert.equal(s.level,'expanded');assert.equal(s.readers[s.selectedId!].scrollY,117);
  let parent=initialCompositeWorkspace(C);parent=compositeReducer(parent,{type:'chart',patch:{zoom:2,center:{x:.72,y:.41},layer:'Channels',pageScrollY:212,canvasScrollY:49}});
  parent=compositeReducer(parent,{type:'select',selection:{kind:'activation',id:C.facts.contributions[0].id}});const chart=structuredClone(parent);
  parent=compositeReducer(parent,{type:'full',opener:'composite-bridge-full-opener'});parent=compositeReducer(parent,{type:'swap'});parent=compositeReducer(parent,{type:'return'});
  assert.deepEqual(parent.chartView,chart.chartView);assert.deepEqual(parent.selection,chart.selection);assert.deepEqual(parent.roles,chart.roles);
});

test('context/target/scope reset withholds old Full and cached results rather than retaining an old actor hypothesis',async()=>{
  const result=await solveCompositeBridges(C,query);let s=bridgeExplorerReducer(initialBridgeExplorer(key),{type:'start'});s=bridgeExplorerReducer(s,{type:'result',generation:s.generation,result});s=bridgeExplorerReducer(s,{type:'full'});
  const generation=s.generation;s=bridgeExplorerReducer(s,{type:'reset',contextKey:'new-scope-or-version'});assert.equal(s.result,null);assert.equal(s.fullEntry,null);assert.equal(s.level,'compact');assert.equal(bridgeExplorerReducer(s,{type:'result',generation,result}).result,null);
});

test('queued form reset/start use explicit monotone request epochs and cannot strand a new search behind an old generation',async()=>{
  const result=await solveCompositeBridges(C,query);let s=initialBridgeExplorer(key);
  s=bridgeExplorerReducer(s,{type:'reset',contextKey:key,generation:1});s=bridgeExplorerReducer(s,{type:'start',generation:2});
  assert.equal(bridgeExplorerReducer(s,{type:'result',generation:1,result}).result,null);
  s=bridgeExplorerReducer(s,{type:'result',generation:2,result});assert.equal(s.running,false);assert.equal(s.result?.resultId,result.resultId);
});

test('planned 26+13 and26+26+13 source contracts retain actor provenance without a live transit result or baseline mutation',async()=>{
  const before=JSON.stringify(C.facts);
  const natal:ActivationSource[]=C.facts.contributions.map(c=>({contributionId:c.id,actor:{actorKind:'natalPerson',actorKey:c.personId,personId:c.personId,chartVersionId:c.chartVersionId,snapshotHash:c.snapshotHash},natalSide:c.side,activationId:c.activationId,gate:c.gate,line:c.line,planetKey:c.planetKey}));
  const temp:ActivationSource[]=Object.keys(PLANETS).map((bodyKey,i)=>({contributionId:`synthetic-future-T:${i}`,actor:{actorKind:'transitSnapshot',actorKey:'synthetic-future-T',snapshotId:'synthetic-contract-only'},natalSide:null,bodyKey,gate:i+1,line:1}));
  const personal=[...natal.filter(a=>a.actor.actorKind==='natalPerson'&&a.actor.personId==='explorer-A'),...temp],pair=[...natal,...temp];
  assert.equal(personal.length,39);assert.equal(pair.length,65);assert.equal(temp.filter(t=>t.natalSide===null).length,13);assert.equal(new Set(pair.map(t=>t.contributionId)).size,65);assert.equal(new Set(temp.map(t=>'bodyKey' in t?t.bodyKey:null)).size,13);
  const workspace:WorkspaceContext={contextKind:'pairTransit',temporalLayer:'overlay',relationshipId:C.relationshipId,baselineCalculationId:C.calculationId,baselineFactsHash:C.factsHash,personVersionHashes:context.inputRefs.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId!,snapshotHash:p.snapshotHash!})),worldId:null,temporal:{status:'notCalculated',snapshotId:null,requestedUTC:null,computedAt:null,freshness:'unavailable'},schemaVersion:'planned-synthetic-contract-only',algorithmVersion:C.pins.algorithm,catalogHash:context.catalogHash};
  for(const scope of ['A+Transit','B+Transit','A+B+Transit'] as const){const result=await unavailableTemporalAdapter.resolve(workspace,scope,new AbortController().signal);assert.equal(result.status,'notCalculated');}
  assert.equal(JSON.stringify(C.facts),before);
});

test('derived bridge identity survives actual saved-pair reopen, while revision change and deletion invalidate the workspace',async()=>{
  let state:CompositeAppStateV2=emptyCompositeState();
  for(const input of C.inputs)state={...replacePerson(state,input.birth),schema:'AppStateV2',relationships:state.relationships};
  const storedCalculation=calculateComposite(snapshotFromPerson(state.people.find(p=>p.birth.id==='explorer-A')!),snapshotFromPerson(state.people.find(p=>p.birth.id==='explorer-B')!));
  const storedContext=compositeBridgeContext(storedCalculation);
  assert.throws(()=>saveRelationship(state,C,['explorer-B','explorer-A']),/pinned natal revision changed/,'raw snapshots cannot silently replace normalized app-owned birth pins');
  state=saveRelationship(state,storedCalculation,['explorer-B','explorer-A']);
  class Store implements StoragePort{data=new Map<string,string>();fail=false;async getItem(k:string){return this.data.get(k)??null;}async setItem(k:string,v:string){if(this.fail)throw Error('synthetic interrupted bridge pair write');this.data.set(k,v);}async removeItem(k:string){this.data.delete(k);}}
  const store=new Store();await writeCompositeState(store,state);const reopened=await readCompositeState(store),rebuilt=rebuildComposite(reopened,reopened.relationships[0]);
  const before=await solveCompositeBridges(storedCalculation,query),after=await solveCompositeBridges(rebuilt,query);assert.equal(after.resultId,before.resultId);
  assert.deepEqual(reopened.relationships[0].displayParticipantIds,['explorer-B','explorer-A']);
  const old=state.people.find(p=>p.birth.id==='explorer-A')!;
  state={...replacePerson(state,{...old.birth,date:'2024-02-01',updatedAt:'2026-10-13T00:01:00.000Z'}),schema:'AppStateV2',relationships:state.relationships};
  const revised=calculateComposite(snapshotFromPerson(state.people.find(p=>p.birth.id==='explorer-A')!),snapshotFromPerson(state.people.find(p=>p.birth.id==='explorer-B')!));
  const stale=await solveCompositeBridges(revised,{...query,expectedContext:storedContext});assert.equal(stale.status,'unsupported');
  store.fail=true;await assert.rejects(writeCompositeState(store,state),/synthetic interrupted/);store.fail=false;assert.equal((await readCompositeState(store)).people.find(p=>p.birth.id==='explorer-A')!.birth.date,'2024-01-01');
  const deleted=removePersonAndDependents(state,'explorer-B');await writeCompositeState(store,deleted);assert.equal((await readCompositeState(store)).relationships.length,0);
  assert.equal([...store.data.values()].some(v=>v.includes('explorer-B')),false);
  let explorer=initialBridgeExplorer(contentHash(storedContext));explorer=bridgeExplorerReducer(explorer,{type:'start'});explorer=bridgeExplorerReducer(explorer,{type:'result',generation:explorer.generation,result:before});
  explorer=bridgeExplorerReducer(explorer,{type:'reset',contextKey:'deleted-pair'});assert.equal(explorer.result,null);assert.equal(explorer.fullEntry,null);
});
