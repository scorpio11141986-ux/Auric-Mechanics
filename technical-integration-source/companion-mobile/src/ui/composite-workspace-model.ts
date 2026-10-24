import type { CenterId } from "../domain/contracts";
import type { CompositeCalculationV1, CompositeContributionV1, MechanicsFactV1, StructureGraphV1 } from "../domain/composite-contracts";
import { mechanicsTraceFor } from "../domain/composite";

export type CompositeMode = "Combined" | "Person A" | "Person B" | "Difference";
export type CompositeScope = "A" | "B" | "A+B" | "A+Transit" | "B+Transit" | "A+B+Transit";
export type TemporalLayer = "baseline" | "overlay" | "temporary-only";
export type CompositeSelection =
  | { kind: "overview" }
  | { kind: "gate"; gate: number }
  | { kind: "activation"; id: string }
  | { kind: "channel"; id: string }
  | { kind: "center"; id: CenterId }
  | { kind: "component"; id: string; graphId: string }
  | { kind: "motor"; graphId: string; motor: CenterId }
  | { kind: "witness"; id: string; personId: string };
export const COMPOSITE_COLORS = { A: "#32bd7a", B: "#4fa7ef", Transit: "#ef6464" } as const;
export const FUTURE_SCOPES: CompositeScope[] = ["A+Transit", "B+Transit", "A+B+Transit"];
export const scopeForMode = (mode: CompositeMode): CompositeScope => mode === "Person A" ? "A" : mode === "Person B" ? "B" : "A+B";
export type SelectionEligibility = { eligible:true } | { eligible:false; reason:string };
/** One presentation boundary shared by state transitions, Reading and Trace. No calculation changes. */
export function selectionEligibility(calculation:CompositeCalculationV1,selection:CompositeSelection,mode:CompositeMode,roles:readonly [string,string],scope:CompositeScope=scopeForMode(mode)):SelectionEligibility {
  const refuse=(reason:string):SelectionEligibility=>({eligible:false,reason});
  if(roles[0]===roles[1]||roles.some(id=>!calculation.facts.participantIds.includes(id)))return refuse("Display participants do not match this pinned relationship.");
  if(scope.includes("Transit"))return selection.kind==="overview"?{eligible:true}:refuse("Temporary results are unavailable; no natal activation is displayed as a transit result.");
  if(scope!==scopeForMode(mode))return refuse("The analytical scope does not match this graph view.");
  const graph=graphFor(calculation,mode,roles);
  if(!graph)return refuse("The selected participant graph is unavailable.");
  switch(selection.kind){
    case "overview":return {eligible:true};
    case "gate":return Number.isInteger(selection.gate)&&selection.gate>=1&&selection.gate<=64?{eligible:true}:refuse("This Gate reference is unavailable.");
    case "channel":return calculation.facts.channelRelations.some(r=>r.channelId===selection.id)?{eligible:true}:refuse("This Channel reference is unavailable.");
    case "center":return calculation.facts.topology.centers.some(c=>c.centerId===selection.id)?{eligible:true}:refuse("This Center reference is unavailable.");
    case "activation":return visibleContributions(calculation,mode,roles).some(c=>c.id===selection.id)?{eligible:true}:refuse("The exact activation is outside the selected person or pinned revision. Select a contribution in this view or use Combined.");
    case "component":return selection.graphId===graph.id&&graph.components.some(c=>c.id===selection.id)?{eligible:true}:refuse("The definition island belongs to another graph or revision.");
    case "motor":return selection.graphId===graph.id&&calculation.facts.topology.motorRoutes.some(r=>r.graphId===graph.id&&r.motor===selection.motor)?{eligible:true}:refuse("The motor route belongs to another graph or revision.");
    case "witness":return scope==="A+B"&&calculation.facts.topology.actualJoins.some(j=>j.personId===selection.personId&&j.witness.id===selection.id&&j.witness.graphId===graph.id)?{eligible:true}:refuse("Actual pair joins use the A+B graph. Inspect them in Combined or Difference.");
    default:return refuse("This selection is unavailable in the pinned context.");
  }
}
export function eligibleSelection(calculation:CompositeCalculationV1,selection:CompositeSelection,mode:CompositeMode,roles:readonly [string,string],scope:CompositeScope=scopeForMode(mode)):CompositeSelection {
  return selectionEligibility(calculation,selection,mode,roles,scope).eligible?selection:{kind:"overview"};
}
export function graphFor(calculation: CompositeCalculationV1, mode: CompositeMode, roles: readonly [string, string]): StructureGraphV1 {
  const personId = mode === "Person A" ? roles[0] : mode === "Person B" ? roles[1] : null;
  return personId ? calculation.facts.topology.natalGraphs.find(g => g.scope.personIds[0] === personId)! : calculation.facts.topology.combinedGraph;
}
export function visibleContributions(calculation: CompositeCalculationV1, mode: CompositeMode, roles: readonly [string, string]): CompositeContributionV1[] {
  const id = mode === "Person A" ? roles[0] : mode === "Person B" ? roles[1] : null;
  return calculation.facts.contributions.filter(c => !id || c.personId === id);
}
export function actorFor(personId: string, roles: readonly [string, string]): "A" | "B" {
  if (personId === roles[0]) return "A";
  if (personId === roles[1]) return "B";
  throw Error("Contributor is outside the pinned relationship.");
}
export function ownershipInk(contributions: readonly CompositeContributionV1[], gate: number, roles: readonly [string, string]): "none" | "A" | "B" | "both" {
  const owners = new Set(contributions.filter(c => c.gate === gate).map(c => c.personId));
  return owners.has(roles[0]) && owners.has(roles[1]) ? "both" : owners.has(roles[0]) ? "A" : owners.has(roles[1]) ? "B" : "none";
}
export function contributionText(c: CompositeContributionV1, roles: readonly [string, string], names: Record<string, string>) {
  return `${actorFor(c.personId, roles)} ${names[c.personId] || c.personId} · ${c.planet} ${c.gate}.${c.line} · ${c.side === "design" ? "Design" : "Personality"}${c.boundaryRisk ? " · near Line boundary" : ""}`;
}
export function actualCompletions(calculation: CompositeCalculationV1, selfId: string) {
  if (!calculation.facts.participantIds.includes(selfId)) throw Error("Chosen self is outside this relationship.");
  const partnerId = calculation.facts.participantIds.find(id => id !== selfId)!;
  return calculation.facts.channelRelations.filter(r => r.formed && [1, 2].includes(r.endpointStates.find(s => s.personId === selfId)?.state ?? -1)).map(r => {
    const ownGate = r.endpoints.find(e => e.personIds.includes(selfId))!.gate;
    const missing = r.endpoints.find(e => e.gate !== ownGate)!;
    return { channelId: r.channelId, ownGate, missingGate: missing.gate,
      partnerContributions: calculation.facts.contributions.filter(c => c.personId === partnerId && c.gate === missing.gate),
      classification: r.classification };
  });
}
export function factForSelection(calculation: CompositeCalculationV1, selection: CompositeSelection,mode:CompositeMode="Combined",roles:[string,string]=calculation.displayParticipantIds,scope:CompositeScope=scopeForMode(mode)): MechanicsFactV1 | null {
  if(!selectionEligibility(calculation,selection,mode,roles,scope).eligible)return null;
  const facts = calculation.facts.mechanicsFacts;
  switch (selection.kind) {
    case "activation": return facts.find(f => f.predicate === "activation-contribution" && f.supportingContributionIds.includes(selection.id)) || null;
    case "channel": return facts.find(f => f.predicate === "channel-relation" && (f.value as {channelId?: string}).channelId === selection.id) || null;
    case "center": return facts.find(f => f.predicate === "center-definition" && (f.value as {centerId?: string}).centerId === selection.id) || null;
    case "component": return facts.find(f => f.predicate === "definition-component" && (f.value as {id?: string}).id === selection.id) || null;
    case "witness": return facts.find(f => f.predicate === "actual-island-join" && (f.value as {witness?: {id?: string}}).witness?.id === selection.id && f.subjectPersonIds.includes(selection.personId)) || null;
    case "motor": return facts.find(f => f.predicate === "motor-to-throat" && (f.value as {graphId?:string;motor?:string}).graphId === selection.graphId && (f.value as {motor?:string}).motor === selection.motor) || null;
    default: return null;
  }
}
export function tracePresentation(calculation: CompositeCalculationV1, selection: CompositeSelection, mode: CompositeMode = "Combined", roles: [string,string] = calculation.displayParticipantIds,scope:CompositeScope=scopeForMode(mode)) {
  if(!selectionEligibility(calculation,selection,mode,roles,scope).eligible)return null;
  const graph = graphFor(calculation, mode, roles);
  if (graph.scope.kind === "participant" && (selection.kind === "center" || selection.kind === "channel")) {
    const edges = graph.edges.filter(e => selection.kind === "center" ? e.centers.includes(selection.id) : e.channelId === selection.id);
    const selectedFacts = calculation.facts.mechanicsFacts.filter(f => f.predicate === "completed-natal-channel" && (f.value as {graphId?:string}).graphId === graph.id && edges.some(e => e.channelId === (f.value as {channelId?:string}).channelId));
    if (selection.kind === "channel" && !edges.length) selectedFacts.push(...calculation.facts.mechanicsFacts.filter(f => f.predicate === "activation-contribution" && f.subjectPersonIds.includes(graph.scope.personIds[0]) && calculation.facts.channelRelations.find(r => r.channelId === selection.id)?.gates.includes((f.value as {gate:number}).gate)));
    const traces = selectedFacts.map(f => mechanicsTraceFor(calculation,f.id,{calculationId:calculation.calculationId,personId:graph.scope.personIds[0]}));
    const supports = new Set(traces.flatMap(t => t.contributions.map(c=>c.id)));
    return { fact:null, projection:"selected-person natal support", subjectPersonIds:graph.scope.personIds,
      supportingContributors:calculation.facts.contributions.filter(c=>supports.has(c.id)),
      calculationInputs:calculation.inputs.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash})),
      canonicalRecordIds:[...new Set(traces.flatMap(t=>t.sourceRecordIds))], sourceContext:calculation.facts.sourceContext,
      dependencyFactIds:selectedFacts.map(f=>f.id), nonclaims:["Individual support is derived from the selected pinned natal graph; pair classifications remain A+B facts."] };
  }
  const fact = factForSelection(calculation, selection,mode,roles,scope);
  if (!fact) return null;
  const trace = mechanicsTraceFor(calculation, fact.id, { calculationId: calculation.calculationId,
    ...(selection.kind === "witness" ? { personId: selection.personId } : {}) });
  return { fact, subjectPersonIds: fact.subjectPersonIds, supportingContributors: trace.contributions,
    calculationInputs: trace.inputRefs, canonicalRecordIds: trace.sourceRecordIds,
    sourceContext: trace.sourceContext, dependencyFactIds: trace.dependencies.map(d => d.id), nonclaims: fact.nonclaims };
}
