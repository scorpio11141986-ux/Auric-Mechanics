import { byId, centerId, gateId, gates } from "../content/records";
import { mechanicsTraceFor } from "../domain/composite";
import type { ChannelRelationV1, CompositeCalculationV1, CompositeContributionV1, PathWitnessV1, StructureGraphV1 } from "../domain/composite-contracts";
import { CENTER_NAMES, type CenterId } from "../domain/contracts";
import { channelRef, gateRef } from "./mechanics-references";

export type ContextInfoTarget = { kind: "activation" | "gate" | "channel" | "center" | "definition"; id: string; graphId?: string };
export type ContextActivationKey = {
  contributionId: string; personId: string; chartVersionId: string; snapshotHash: string; activationId: string;
  planetKey: string; planet: string; side: CompositeContributionV1["side"]; gate: number; line: number | null;
  center: CenterId; repeatedIndex: number; lineStatus: "exact-point" | "uncertain-withheld"; sourceRecordIds: string[];
};
export type ContextInfo = {
  id: string; explainerId: "context-info:structural-v1"; target: ContextInfoTarget; title: string;
  meaning: string; inThisChart: string; evidence: string[];
  calculationId: string; factIds: string[]; contributionIds: string[]; sourceRecordIds: string[]; witnessIds: string[];
  activationKey: ContextActivationKey | null;
  advanced: {
    status: "structural-only-symbolism-withheld"; notes: string[]; factsHash: string;
    context: string[]; evidence: string[];
    inputRefs: { personId: string; chartVersionId: string; snapshotHash: string }[];
    activationKeys: ContextActivationKey[];
    sources: { id: string; catalogVersion: string; available: boolean }[];
  };
};

const unique = <T,>(values: T[]): T[] => [...new Set(values)];
const uncertain = (c: CompositeContributionV1) => c.boundaryRisk || c.uncertaintyRef.eligibility !== "exact-point";
const sideName = (c: CompositeContributionV1) => c.side === "personality" ? "Personality" : "Design";
export function contextActivationLabel(c: CompositeContributionV1): string {
  return `${sideName(c)} ${c.planet} at ${gateRef(c.gate, uncertain(c) ? undefined : c.line)}${uncertain(c) ? " - exact Line uncertain (withheld)" : ""}`;
}

export function resolveContextInfo(calculation: CompositeCalculationV1, target: ContextInfoTarget, names: Record<string, string>): ContextInfo {
  // The trace API checks issuance, not merely structural similarity or a copied hash.
  mechanicsTraceFor(calculation, calculation?.facts?.mechanicsFacts?.[0]?.id || "");
  if (!target || !["activation", "gate", "channel", "center", "definition"].includes(target.kind) || typeof target.id !== "string") throw Error("Unsupported contextual target.");
  const { contributions, channelRelations, topology, mechanicsFacts } = calculation.facts;
  const person = (id: string) => names[id] || `Participant ${calculation.inputs.findIndex(p => p.personId === id) + 1}`;
  const graphs = [...topology.natalGraphs, topology.combinedGraph];
  const focusedGraph=target.graphId?graphs.find(g=>g.id===target.graphId):topology.combinedGraph;
  if(!focusedGraph)throw Error("Context graph does not belong to this calculation.");
  const natalScope=focusedGraph.scope.kind==="participant";
  const graphName = (g: StructureGraphV1) => g.scope.kind === "pair" ? "Together (permanent A+B)" : `${person(g.scope.personIds[0])} alone`;
  const contributionText = (c: CompositeContributionV1) => `${person(c.personId)}: ${contextActivationLabel(c)}`;
  let title: string, meaning: string, context: string[] = [], mainContext: string[] = [], selected: CompositeContributionV1[] = [];
  let relations: ChannelRelationV1[] = [], witnesses: PathWitnessV1[] = [], selectedGraphs: StructureGraphV1[] = [];
  let factIds: string[] = [], extraSources: string[] = [];
  let activation: CompositeContributionV1 | undefined;

  if (target.kind === "activation" || target.kind === "gate") {
    activation = target.kind === "activation" ? contributions.find(c => c.id === target.id) : undefined;
    if (target.kind === "activation" && !activation) throw Error("Activation does not belong to this issued calculation; use its contribution ID.");
    if(activation&&natalScope&&!focusedGraph.scope.personIds.includes(activation.personId))throw Error("Activation is outside the selected natal scope.");
    const gateMatch = /^(?:gate-)?(\d{1,2})$/.exec(target.id);
    const gate = activation?.gate ?? (gateMatch ? Number(gateMatch[1]) : NaN);
    const record = gates.get(gate);
    if (!record) throw Error("Unknown canonical Gate target.");
    selected = activation ? [activation] : contributions.filter(c => c.gate === gate&&(!natalScope||focusedGraph.scope.personIds.includes(c.personId)));
    title = activation ? contextActivationLabel(activation) : gateRef(gate);
    meaning = activation
      ? `A planetary activation is one calculated position assigned to a Gate and a six-part Line subdivision. ${sideName(activation)} identifies the ${activation.side === "personality" ? "birth-time" : "earlier Design-time"} calculation, not an additional participant. ${gateRef(gate)} identifies its Center and endpoint.`
      : `${gateRef(gate)} is a numbered endpoint in the ${CENTER_NAMES[centerId(record.center)]} Center. An active endpoint alone does not complete a Channel or define a Center.`;
    context.push(selected.length ? selected.map(contributionText).join("; ") + "." : `${gateRef(gate)} has no activation in this pinned pair; it is reference structure, not a personal contribution.`);
    mainContext.push(activation ? `${contributionText(activation)}. This is one exact contribution record, not every activation at this Gate.`
      : selected.length ? `${gateRef(gate)} is supplied by ${unique(selected.map(c => person(c.personId))).join(" and ")} through ${selected.length} separate activation ${selected.length === 1 ? "record" : "records"}.`
      : `${gateRef(gate)} has no activation in this pinned pair; it is reference structure, not a personal contribution.`);
    relations = channelRelations.filter(r => r.gates.includes(gate));
    extraSources.push(gateId(gate));
  } else if (target.kind === "channel") {
    channelRef(target.id);
    relations = channelRelations.filter(r => r.channelId === target.id);
    if (!relations.length) throw Error("Channel is unavailable in this calculation.");
    title = channelRef(target.id);
    meaning = `${title} links two Centers only when both endpoint Gates are present. Its pair classification describes endpoint ownership, not attraction, communication style or a relationship outcome.`;
  } else if (target.kind === "center") {
    if (!Object.hasOwn(CENTER_NAMES, target.id)) throw Error("Unknown canonical Center target.");
    const center = target.id as CenterId;
    title = `${CENTER_NAMES[center]} Center`;
    meaning = `${title} is a node in the BodyGraph. A Center is defined by at least one completed incident Channel; an isolated active Gate does not define it. Undefined does not necessarily mean no active Gates (fully open).`;
    selectedGraphs = natalScope?[focusedGraph]:graphs;
    selected = contributions.filter(c => c.center === center&&(!natalScope||focusedGraph.scope.personIds.includes(c.personId)));
    relations = channelRelations.filter(r => r.centers.includes(center));
    context.push(...selectedGraphs.map(g => `${graphName(g)}: ${title} is ${g.definedCenters.includes(center) ? "defined" : "undefined"}.`));
    mainContext.push(context.join(" "));
    factIds.push(...mechanicsFacts.filter(f => f.predicate === "center-definition" && (f.value as { centerId: string }).centerId === center).map(f => f.id));
    extraSources.push(...[...gates.values()].filter(g => centerId(g.center) === center).map(g => g.id));
  } else {
    const join = topology.actualJoins.find(j => j.witness.id === target.id);
    const route = topology.motorRoutes.find(r => r.witness?.id === target.id)?.witness;
    const graph = target.id === "combined" ? topology.combinedGraph : graphs.find(g => g.id === target.id || g.components.some(c => c.id === target.id));
    if (!join && !route && !graph) throw Error("Definition target is not a graph, component or actual witness in this calculation.");
    selectedGraphs = graph ? [graph] : graphs.filter(g => g.id === (join?.witness || route)!.graphId);
    witnesses = join ? [join.witness] : route ? [route] : topology.actualJoins.filter(j => graph!.scope.kind === "pair" || graph!.scope.personIds.includes(j.personId)).map(j => j.witness);
    const component = graph?.components.find(c => c.id === target.id);
    title = join ? `Actual Definition join for ${person(join.personId)}` : route ? "Actual motor-to-Throat route" : `${graphName(graph!)}: ${component ? component.centerIds.map(c => `${CENTER_NAMES[c]} Center`).join(" + ") : graph!.definition} Definition`;
    meaning = "Definition describes connected groups of defined Centers, not whether an individual Center is defined or open. A natal-island join connects previously separate natal groups in the permanent pair graph; it does not change natal Type, Authority or Profile.";
    for (const g of selectedGraphs) context.push(`${graphName(g)}: ${g.componentCount} connected ${g.componentCount === 1 ? "group" : "groups"} of defined Centers${g.components.length ? ` (${g.components.map(c => c.centerIds.map(id => `${CENTER_NAMES[id]} Center`).join(" + ")).join(" / ")})` : ""}.`);
    mainContext.push(...selectedGraphs.map(g => `${graphName(g)}: ${g.componentCount} connected ${g.componentCount === 1 ? "group" : "groups"} of defined Centers${component ? `; this group contains ${component.centerIds.map(id => `${CENTER_NAMES[id]} Center`).join(" + ")}` : ""}.`));
    if (graph?.scope.kind === "pair") mainContext.push(topology.natalGraphs.map(g => `${graphName(g)}: ${g.componentCount} natal ${g.componentCount === 1 ? "group" : "groups"}`).join("; ") + ". Comparing these networks shows what the pair joins without replacing either natal chart.");
    if (join) context.push(`This route joins ${person(join.personId)}'s separate natal groups in the pair, not necessarily every group in the combined graph.`);
    const edgeIds = unique([...selectedGraphs.flatMap(g => g.edges.filter(e => !component || e.centers.every(c => component.centerIds.includes(c))).map(e => e.channelId)), ...witnesses.flatMap(w => w.edges.map(e => e.channelId))]);
    relations = channelRelations.filter(r => edgeIds.includes(r.channelId));
    factIds.push(...mechanicsFacts.filter(f => f.predicate === "definition-component" && selectedGraphs.some(g => (f.value as { graphId: string }).graphId === g.id) && (!component || (f.value as { id: string }).id === component.id)).map(f => f.id));
  }

  const mainRelation = relations.find(r => r.formed) || relations[0];
  if(activation){
    const complete=mainRelation&&(natalScope?focusedGraph.edges.some(e=>e.channelId===mainRelation.channelId):mainRelation.formed);
    meaning=`${person(activation.personId)}'s ${sideName(activation)} ${activation.planet} is recorded at ${gateRef(activation.gate,uncertain(activation)?undefined:activation.line)}. `+
      `${sideName(activation)} marks the ${activation.side==="personality"?"birth-time":"earlier Design-time"} calculation. `+
      (mainRelation?`${channelRef(mainRelation.channelId)} is ${complete?"complete":"not complete"} in ${natalScope?"this natal view":"the pair"}. `:"")+
      "This identifies the exact contribution and its connection, not a personal trait. Other activations at the same endpoint remain separate records.";
  }

  for (const relation of relations) {
    const label = channelRef(relation.channelId);
    const endpoints = relation.endpoints.map(e => `${gateRef(e.gate)}: ${e.personIds.map(person).join(" + ") || "not supplied"}`).join("; ");
    const relationship = `${label} is ${relation.formed ? `complete in A+B (${relation.classification}${relation.combinedOnly ? "; pair-created, neither person holds the full Channel alone" : "; already complete in at least one natal chart"})` : "incomplete in A+B"}. ${endpoints}.`;
    context.push(relationship);
    if (relation === mainRelation && target.kind !== "definition") mainContext.push(natalScope?`${graphName(focusedGraph)}: ${label} is ${focusedGraph.edges.some(e=>e.channelId===relation.channelId)?"complete":"absent as a complete natal Channel"}. Permanent A+B ownership is a different comparison and is retained in technical records.`:relationship);
    if (relation.formed) {
      const ownership = relation.endpointStates.map(s => `${person(s.personId)}: ${s.role}`).join("; ") + ".";
      context.push(ownership);
      if (target.kind === "channel"&&!natalScope) mainContext.push(ownership);
    }
    factIds.push(...mechanicsFacts.filter(f => f.predicate === "channel-relation" && (f.value as { channelId: string }).channelId === relation.channelId).map(f => f.id));
  }
  if(mainRelation?.formed&&!natalScope&&target.kind!=="definition"){
    for(const natal of topology.natalGraphs){
      const groups=mainRelation.centers.map(center=>natal.components.find(group=>group.centerIds.includes(center)));
      if(groups[0]&&groups[1]&&groups[0].id!==groups[1].id){
        const direct=`${channelRef(mainRelation.channelId)} directly links two of ${person(natal.scope.personIds[0])}'s otherwise separate natal Center groups in A+B. Other complete routes may also join those groups; this does not change natal Definition.`;
        mainContext.push(direct);context.push(direct);
        factIds.push(...mechanicsFacts.filter(f=>f.predicate==="actual-island-join"&&(f.value as {personId:string;targetNatalIslandIds:string[]}).personId===natal.scope.personIds[0]&&groups.every(group=>(f.value as {targetNatalIslandIds:string[]}).targetNatalIslandIds.includes(group!.id))).map(f=>f.id));
      }
    }
  }
  if (target.kind !== "definition") witnesses = topology.actualJoins.filter(j => j.witness.edges.some(e => relations.some(r => r.channelId === e.channelId))).map(j => j.witness);
  for (const witness of witnesses) {
    context.push(`${witness.sufficientFor.kind === "natal-island-join" ? `For ${person(witness.sufficientFor.personId!)}, an actual natal-island join` : "An actual motor-to-Throat connection"} uses ${witness.edges.map(e => channelRef(e.channelId)).join(" then ")}. This is one sufficient route, not a unique, sole or necessary bridge; alternative routes may exist and are not enumerated here.`);
    factIds.push(...mechanicsFacts.filter(f => f.predicate === "actual-island-join" && (f.value as { witness: PathWitnessV1 }).witness.id === witness.id || f.predicate === "motor-to-throat" && (f.value as { witness: PathWitnessV1 | null }).witness?.id === witness.id).map(f => f.id));
  }
  if (witnesses.length&&!natalScope) {
    const witness = witnesses[0];
    mainContext.push(`${witness.sufficientFor.kind === "natal-island-join" ? `For ${person(witness.sufficientFor.personId!)}, this actual route joins separate natal Center groups` : "This actual route connects a motor to the Throat Center"} through ${witness.edges.length} completed ${witness.edges.length === 1 ? "Channel" : "Channels"}. It is one sufficient route, not a unique, sole or necessary bridge; alternative routes may exist. Exact steps are in technical records.`);
  }
  const endpointSupports = unique(relations.flatMap(r => r.endpoints.flatMap(e => e.contributionIds)));
  const supporting = contributions.filter(c => (selected.some(s => s.id === c.id) || endpointSupports.includes(c.id))&&(!natalScope||focusedGraph.scope.personIds.includes(c.personId)));
  factIds.push(...mechanicsFacts.filter(f => f.predicate === "activation-contribution" && f.supportingContributionIds.some(id => supporting.some(c => c.id === id))).map(f => f.id));
  const traces = unique(factIds).map(id => mechanicsTraceFor(calculation, id));
  const sourceRecordIds = unique([...extraSources, ...traces.flatMap(t => t.sourceRecordIds)]);
  const keys = supporting.map(c => ({ contributionId: c.id, personId: c.personId, chartVersionId: c.chartVersionId, snapshotHash: c.snapshotHash,
    activationId: c.activationId, planetKey: c.planetKey, planet: c.planet, side: c.side, gate: c.gate, line: uncertain(c) ? null : c.line, center: c.center,
    repeatedIndex: contributions.filter(n => n.personId === c.personId && n.gate === c.gate && n.line === c.line).findIndex(n => n.id === c.id) + 1,
    lineStatus: uncertain(c) ? "uncertain-withheld" as const : "exact-point" as const,
    sourceRecordIds: mechanicsFacts.filter(f => f.predicate === "activation-contribution" && f.supportingContributionIds.includes(c.id)).flatMap(f => f.sourceRecordIds) }));
  const fullEvidence = supporting.map(contributionText);
  const repeated = unique(supporting.map(c => `${c.personId}:${c.gate}`)).flatMap(key => {
    const records = supporting.filter(c => `${c.personId}:${c.gate}` === key);
    return records.length > 1 ? [`${person(records[0].personId)} supplies ${gateRef(records[0].gate)} through ${records.length} separate activations. Removing one record does not remove this endpoint while another valid record remains; repetition is not stronger definition or relationship intensity.`] : [];
  });
  context.push(...repeated);
  if (repeated.length && mainContext.length < 4) mainContext.push(repeated[0]);
  const uncertainty = "Exact Line uncertain (withheld) for flagged activations. Birth-time or boundary uncertainty makes these provisional point positions, not a tested interval or a probability. Gates and topology can change outside this point.";
  const priorityIds = unique([...(activation ? [activation.id] : []), ...(mainRelation?.endpoints.flatMap(e => e.contributionIds.slice(0, 1)) || []), ...selected.map(c => c.id), ...supporting.map(c => c.id)]);
  const orderedSupport = priorityIds.map(id => supporting.find(c => c.id === id)!).filter(Boolean);
  const topologyProof = target.kind === "definition" ? selectedGraphs.map(g => `${graphName(g)}: ${g.componentCount} connected ${g.componentCount === 1 ? "group" : "groups"}; ${g.edges.length} completed Channels.`) : [];
  const evidence = ["Calculated point-chart structure from the issued calculation and its pinned natal revisions.", ...topologyProof,
    ...orderedSupport.slice(0, 4 - topologyProof.length).map(contributionText)];
  if (!orderedSupport.length) evidence.push("No planetary contribution supplies this selected reference object in the pinned pair.");
  if (supporting.some(uncertain)) { evidence.push(uncertainty); fullEvidence.push(uncertainty); }
  else if (orderedSupport.length > 4 - topologyProof.length) evidence.push(`${orderedSupport.length - (4 - topologyProof.length)} additional contribution records are preserved in technical records.`);
  return { id: `context:${calculation.calculationId}:${focusedGraph.id}:${target.kind}:${target.id}`, explainerId: "context-info:structural-v1", target: { ...target }, title, meaning,
    inThisChart: mainContext.slice(0, 4).join("\n\n"), evidence, calculationId: calculation.calculationId,
    factIds: unique(traces.flatMap(t => [t.fact.id, ...t.dependencies.map(f => f.id)])), contributionIds: supporting.map(c => c.id), sourceRecordIds,
    witnessIds: witnesses.map(w => w.id), activationKey: activation ? keys.find(k => k.contributionId === activation.id)! : null,
    advanced: { status: "structural-only-symbolism-withheld", factsHash: calculation.factsHash, context, evidence: [...fullEvidence, ...repeated],
      inputRefs: calculation.inputs.map(p => ({ personId: p.personId, chartVersionId: p.chartVersionId, snapshotHash: p.snapshotHash })), activationKeys: keys,
      sources: sourceRecordIds.map(id => ({ id, catalogVersion: calculation.pins.catalogVersion, available: byId.has(id) })),
      notes: ["Derivation: issued CM01a calculation; src/domain/composite.ts. Canonical maps: src/content/records.ts. Context resolver: structural-v1.",
        "No cleared symbolic planet meaning, Line psychology or planet-by-Gate teaching is available. The initial panel explains calculated configuration only, not personal psychology.",
        "Catalog references and recorded point-Line IDs are calculation metadata, not cleared symbolic teaching or evidence of an exact Line when uncertain.",
        "Source authenticity, rights, clause review and owner approval remain open. Disabled interpretive candidates remain disabled. No consent, attraction, behavior, health or outcome claim follows.",
        "Actual witnesses show one sufficient route; alternatives and endpoint-removal counterfactuals are not computed in this panel. No necessity claim is made."] } };
}
