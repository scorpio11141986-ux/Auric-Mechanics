import assert from "node:assert/strict";
import test from "node:test";
import { calculateComposite, createParticipantSnapshot } from "../src/domain/composite";
import { calculateChart } from "../src/domain/calculator";
import type { BirthRecordV1 } from "../src/domain/contracts";
import { actorFor, actualCompletions, graphFor, ownershipInk, tracePresentation } from "../src/ui/composite-workspace-model";
import { compositeContextKey, compositeReducer, initialCompositeWorkspace, scopeAvailable } from "../src/ui/composite-workspace-state";
import { unavailableTemporalAdapter, type WorkspaceContext } from "../src/ui/composite-temporal-contract";
const birth = (id: string, date: string): BirthRecordV1 => ({ schema: "BirthRecordV1", id, name: "Synthetic", date, localTime: "00:00", timezone: "UTC", latitude: 0, longitude: 0, place: "Synthetic", confidence: "exact", source: "user-entered", updatedAt: "2026-10-12T00:00:00.000Z" });
const snap = (b: BirthRecordV1) => createParticipantSnapshot({ origin: "application-calculated", personId: b.id, chartVersionId: `${b.id}:${b.updatedAt}`, birth: b, facts: calculateChart(b) });
const C = calculateComposite(snap(birth("synthetic-A", "2024-01-01")), snap(birth("synthetic-B", "2024-06-01")));
test("all four modes preserve baseline facts and actor ownership", () => {
  const roles: [string,string] = ["synthetic-A", "synthetic-B"];
  assert.equal(graphFor(C,"Person A",roles).scope.personIds[0],roles[0]);
  assert.equal(graphFor(C,"Person B",roles).scope.personIds[0],roles[1]);
  assert.equal(graphFor(C,"Combined",roles).id,graphFor(C,"Difference",roles).id);
  assert.equal(actorFor(roles[0],roles),"A");
  const shared = C.facts.contributions.find(c => C.facts.contributions.some(d => d.personId!==c.personId && d.gate===c.gate))!;
  assert.equal(ownershipInk(C.facts.contributions,shared.gate,roles),"both");
});
test("F14 actual completions exclude partner-only fully owned channels", () => {
  for (const self of C.displayParticipantIds) for (const row of actualCompletions(C,self)) {
    const relation=C.facts.channelRelations.find(r=>r.channelId===row.channelId)!;
    assert.ok([1,2].includes(relation.endpointStates.find(s=>s.personId===self)!.state));
    assert.ok(row.partnerContributions.every(c=>c.personId!==self && c.gate===row.missingGate));
  }
});
test("Trace names actual single-person support separately from two pinned calculation inputs", () => {
  const contribution=C.facts.contributions[0];
  const p=tracePresentation(C,{kind:"activation",id:contribution.id})!;
  assert.equal(p.calculationInputs.length,2);
  assert.equal(p.supportingContributors.length,1);
  assert.equal(p.supportingContributors[0].personId,contribution.personId);
  for(const join of C.facts.topology.actualJoins){
    const t=tracePresentation(C,{kind:"witness",id:join.witness.id,personId:join.personId})!;
    assert.ok(t.supportingContributors.length);
    assert.ok(t.supportingContributors.some(c=>c.personId!==join.personId));
  }
});
test("exact Full return preserves roles, mode, scope, zoom, pan, layer, selection and reader state", () => {
  let s=initialCompositeWorkspace(C);
  s=compositeReducer(s,{type:"mode",mode:"Person A"});
  const originalOwner=s.roles[0],c=C.facts.contributions.find(c=>c.personId===originalOwner)!;
  s=compositeReducer(s,{type:"select",selection:{kind:"activation",id:c.id}});
  s=compositeReducer(s,{type:"chart",patch:{zoom:2,center:{x:.7,y:.4},layer:"Gates",canvasScrollY:50,pageScrollY:20}});
  const before=structuredClone(s);
  s=compositeReducer(s,{type:"full",opener:"compact"});
  s=compositeReducer(s,{type:"swap"});
  assert.equal(s.mode,"Person B");assert.equal(s.roles[1],originalOwner);assert.equal(s.fullReturn?.roles[0],originalOwner);
  s=compositeReducer(s,{type:"select",selection:{kind:"gate",gate:44}});
  s=compositeReducer(s,{type:"back"});
  s=compositeReducer(s,{type:"return"});
  for(const key of ["roles","mode","scope","selection","chartView","readingLevel"] as const)assert.deepEqual(s[key],before[key]);
});
test("future scopes are typed, unavailable and do not mutate permanent classifications", () => {
  const before=JSON.stringify(C.facts.channelRelations);
  for(const scope of ["A+Transit","B+Transit","A+B+Transit"] as const){
    let s=compositeReducer(initialCompositeWorkspace(C),{type:"scope",scope});
    assert.equal(scopeAvailable(s),false);assert.equal(s.temporal.snapshotId,null);
    s=compositeReducer(s,{type:"full",opener:"compact"});s=compositeReducer(s,{type:"return"});
    assert.equal(s.scope,scope);assert.equal(s.temporal.requestedUTC,null);
  }
  assert.equal(JSON.stringify(C.facts.channelRelations),before);
});
test("context replacement invalidates stale selection and Full return",()=>{
  let s=initialCompositeWorkspace(C);s=compositeReducer(s,{type:"full",opener:"compact"});
  const next={...C,calculationId:"synthetic-new-version"};
  s=compositeReducer(s,{type:"context",calculation:next});
  assert.equal(s.fullReturn,null);assert.equal(s.selection.kind,"overview");assert.notEqual(s.contextKey,compositeContextKey(C));
});
test("natal scope controls synchronize the graph mode and selecting the same exact activation is idempotent",()=>{
  let s=compositeReducer(initialCompositeWorkspace(C),{type:"scope",scope:"A"});
  assert.equal(s.mode,"Person A");assert.equal(graphFor(C,s.mode,s.roles).scope.personIds[0],s.roles[0]);
  s=compositeReducer(s,{type:"scope",scope:"B"});assert.equal(s.mode,"Person B");
  const contribution=C.facts.contributions.find(c=>c.personId===s.roles[1])!;
  const selection={kind:"activation" as const,id:contribution.id};
  s=compositeReducer(s,{type:"select",selection});s=compositeReducer(s,{type:"full",opener:"compact"});
  s=compositeReducer(s,{type:"select",selection});assert.equal(s.fullHistory.length,0);
});
test("individual Channel and Center Trace projections expose only actual natal supports; motor Trace retains its person",()=>{
  for(const mode of ["Person A","Person B"] as const){
    const graph=graphFor(C,mode,C.displayParticipantIds),id=graph.scope.personIds[0];
    for(const edge of graph.edges){const trace=tracePresentation(C,{kind:"channel",id:edge.channelId},mode)!;
      assert.ok(trace.supportingContributors.length);assert.ok(trace.supportingContributors.every(c=>c.personId===id));assert.equal(trace.calculationInputs.length,2);}
    for(const center of graph.definedCenters){const trace=tracePresentation(C,{kind:"center",id:center},mode)!;
      assert.ok(trace.supportingContributors.length);assert.ok(trace.supportingContributors.every(c=>c.personId===id));}
    for(const route of C.facts.topology.motorRoutes.filter(r=>r.graphId===graph.id&&r.connected)){
      const trace=tracePresentation(C,{kind:"motor",graphId:graph.id,motor:route.motor},mode)!;
      assert.ok(trace.supportingContributors.length);assert.ok(trace.supportingContributors.every(c=>c.personId===id));}
  }
});
test("future transit port handles six scopes and cancellation without numerical or classification fabrication",async()=>{
  const s=initialCompositeWorkspace(C);
  const context:WorkspaceContext={contextKind:"natalPair",temporalLayer:"baseline",relationshipId:C.relationshipId,baselineCalculationId:C.calculationId,baselineFactsHash:C.factsHash,
    personVersionHashes:C.inputs.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash})),worldId:null,temporal:s.temporal,schemaVersion:"CompositeCalculationV1",algorithmVersion:C.pins.algorithm,catalogHash:C.pins.catalogSHA256};
  const before=JSON.stringify(C.facts);
  for(const scope of ["A","B","A+B","A+Transit","B+Transit","A+B+Transit"] as const){
    const controller=new AbortController();const result=await unavailableTemporalAdapter.resolve(context,scope,controller.signal);
    assert.equal(result.status,"notCalculated");assert.ok(!("facts" in result));controller.abort();
    assert.equal((await unavailableTemporalAdapter.resolve(context,scope,controller.signal)).status,"cancelled");}
  assert.equal(JSON.stringify(C.facts),before);
});
