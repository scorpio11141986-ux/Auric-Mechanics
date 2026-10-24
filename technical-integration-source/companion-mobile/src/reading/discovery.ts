import { excludedReadingField } from './source-policy';
import { centerId, gateId, runtime } from '../content/records';
import { deriveStructure } from '../domain/calculator';
import { classifyChannelOwnership } from '../domain/composite';
import { contentHash } from '../domain/composite-hash';
import type { CenterId } from '../domain/contracts';
import type { EndpointState, StructureGraphV1 } from '../domain/composite-contracts';
import { assertReadingChartIndex } from './chart-index';
import { getMeaningUnit } from './catalog';
import { freezeReadingValue } from './compiler';
import { resolveMeaningEligibility } from './eligibility';
import type { DesignPreviewCapability, IndexedActivation, JsonValue, MeaningVariant, ReadingChartIndex, ReadingUse, SourceFieldRef } from './contracts';

export const READING_PATTERN_FAMILIES = ['repeated-gate','shared-gate','completed-channel-line-contrast','cross-placements','missing-harmonic-topology','critical-network-bridge','activation-removal-ownership','unfinished-harmonic-branch','disputed-poles'] as const;
export type ReadingPatternFamily = typeof READING_PATTERN_FAMILIES[number];
export type PatternSourceRef = { recordId:string; variantId:MeaningVariant; fieldKey:string; ref:SourceFieldRef };
export type ReadingPatternCandidate = {
  patternId:string; family:ReadingPatternFamily;
  status:'supported-structure'|'supported-symbolic'|'supported-source-comparison'|'withheld';
  personIds:string[]; activationIds:string[]; factIds:string[]; sourceRefs:PatternSourceRef[];
  conditions:string[]; withheldReasonCodes:string[]; detail:JsonValue;
  publicationStatus:'design-only'; consumerEligible:false;
};
export type PatternDiscoveryOptions = {use?:ReadingUse;capability?:DesignPreviewCapability;variantId?:MeaningVariant};
const unique = <T>(v:T[]) => [...new Set(v)];
const sorted = <T extends string|number>(v:T[]) => [...v].sort((a,b)=>a<b?-1:a>b?1:0);
function summary(gates:number[]) {
  const s=deriveStructure(gates);
  return {gates:sorted(unique(gates)),channelIds:s.channels.map(c=>c.id).sort(),definedCenters:s.centers.filter(c=>c.defined).map(c=>c.id).sort(),components:s.definitionIslands.map(c=>[...c].sort()),componentCount:s.definitionIslands.length};
}
/** One actual alternate completed-edge route; absence establishes graph-edge criticality,
 * not psychological necessity or the necessity of any individual repeated occurrence. */
export function alternateCompletedRoute(graph:StructureGraphV1,from:CenterId,to:CenterId,excludedChannelId:string):string[]|null {
  const visited=new Set<CenterId>([from]),queue:{center:CenterId;channels:string[]}[]=[{center:from,channels:[]}];
  for(let i=0;i<queue.length;i++) {
    const at=queue[i];if(at.center===to)return at.channels;
    for(const edge of graph.edges.filter(e=>e.channelId!==excludedChannelId&&e.centers.includes(at.center)).sort((a,b)=>a.channelId.localeCompare(b.channelId))) {
      const next=edge.centers.find(c=>c!==at.center)!;
      if(!visited.has(next)){visited.add(next);queue.push({center:next,channels:[...at.channels,edge.channelId]});}
    }
  }
  return null;
}

/** Deterministic candidate discovery. It emits evidence and structural scenarios, never
 * fixture prose, birth recalculations, source approvals or psychological conclusions. */
export function discoverReadingPatterns(index:ReadingChartIndex,options:PatternDiscoveryOptions={}):ReadingPatternCandidate[] {
  assertReadingChartIndex(index);
  const output:ReadingPatternCandidate[]=[],variant=options.variantId||'r4';
  const factIds=(predicate:string,ids:string[]=[])=>index.facts.filter(f=>f.predicate===predicate&&(!ids.length||ids.some(id=>f.activationIds.includes(id)))).map(f=>f.id);
  const sources=(a:IndexedActivation):{refs:PatternSourceRef[];reasons:string[]}=>{
    if(!a.exactLineEligible||a.line===null)return {refs:[],reasons:['EXACT_LINE_WITHHELD']};
    const u=getMeaningUnit(`${gateId(a.gate)}-line-${a.line}`,variant);
    if(!u)return {refs:[],reasons:['SOURCE_RECORD_NOT_IN_AVAILABLE_COHORT']};
    const e=resolveMeaningEligibility(u,{use:options.use||'isolated-design-preview',capability:options.capability});
    if(e.result!=='design-only')return {refs:[],reasons:e.reasonCodes};
    const f=u.fields.find(f=>!excludedReadingField(u,f.fieldKey)&&f.purpose==='meaning'&&typeof f.value==='string'&&!f.shared&&f.ref.granularity==='exact-line'&&/^(mechanical_kernel|exact_mechanical_kernel)$/.test(f.fieldKey));
    return f?{refs:[{recordId:u.recordId,variantId:u.variantId,fieldKey:f.fieldKey,ref:f.ref}],reasons:[]}:{refs:[],reasons:['EXACT_LINE_PROPOSITION_NOT_AVAILABLE']};
  };
  function emit(family:ReadingPatternFamily,persons:string[],acts:IndexedActivation[],detail:unknown,settings:{symbolic?:boolean;comparison?:boolean;reasons?:string[];refs?:PatternSourceRef[];facts?:string[];conditions?:string[]}={}) {
    const support=acts.map(sources),refs=settings.refs||support.flatMap(s=>s.refs);
    const reasons=unique([...(settings.reasons||[]),...(settings.symbolic?support.flatMap(s=>s.reasons):[])]);
    const status:ReadingPatternCandidate['status']=settings.symbolic?(reasons.length?'withheld':settings.comparison?'supported-source-comparison':'supported-symbolic'):'supported-structure';
    const body={family,status,personIds:sorted(unique(persons)),activationIds:sorted(unique(acts.map(a=>a.id))),factIds:sorted(unique(settings.facts||factIds('activation',acts.map(a=>a.id)))),sourceRefs:refs,conditions:['PINNED_POINT_SCOPE','NO_OBSERVED_BEHAVIOR_INFERENCE',...(settings.conditions||[])],withheldReasonCodes:reasons,detail:detail as JsonValue,publicationStatus:'design-only' as const,consumerEligible:false as const};
    output.push({...body,patternId:`pattern:${contentHash(body)}`});
  }
  for(const p of index.participants) {
    const acts=index.activations.filter(a=>a.personId===p.personId);
    for(const gate of sorted(unique(acts.map(a=>a.gate)))) {
      const repeated=acts.filter(a=>a.gate===gate);
      if(repeated.length>1)emit('repeated-gate',[p.personId],repeated,{gate,occurrenceCount:repeated.length,distinctCalculatedLines:sorted(unique(repeated.map(a=>a.calculatedLine))),eligibleInterpretiveLines:sorted(unique(repeated.flatMap(a=>a.line===null?[]:[a.line]))),definitionMultiplicity:1},{conditions:['REPETITION_CHANGES_SALIENCE_AND_REMOVAL_DEPENDENCIES_NOT_GATE_DEFINITION']});
    }
    const cross=acts.filter(a=>a.planetKey==='sun'||a.planetKey==='earth').sort((a,b)=>`${a.side}:${a.planetKey}`.localeCompare(`${b.side}:${b.planetKey}`));
    emit('cross-placements',[p.personId],cross,{placements:cross.map(a=>({activationId:a.id,side:a.side,planetKey:a.planetKey,gate:a.gate,line:a.line,center:a.center})),namedCrossId:null,namedCrossMeaning:'withheld',profile:p.facts.profile},{conditions:['FOUR_PLACEMENT_GEOMETRY_ONLY','NAMED_CROSS_CATALOGUE_AND_MATCHING_MEANING_NOT_SUPPLIED'],reasons:cross.length===4?[]:['FOUR_CROSS_PLACEMENTS_MISSING']});
  }
  if(index.context==='composite')for(const gate of sorted(unique(index.activations.map(a=>a.gate)))) {
    const acts=index.activations.filter(a=>a.gate===gate),people=unique(acts.map(a=>a.personId));
    if(people.length===2)emit('shared-gate',people,acts,{gate,perPerson:people.map(personId=>({personId,activationIds:acts.filter(a=>a.personId===personId).map(a=>a.id),eligibleLines:sorted(unique(acts.filter(a=>a.personId===personId).flatMap(a=>a.line===null?[]:[a.line])))})),sharedGateDoesNotByItselfCompleteChannel:true});
  }
  for(const channel of index.channels.filter(c=>c.complete&&(index.context==='natal'||c.personId===null))) {
    const ends=channel.endpointActivationIds.map(ids=>ids.map(id=>index.activations.find(a=>a.id===id)!).filter(Boolean));
    const choose=(acts:IndexedActivation[])=>acts.find(a=>a.exactLineEligible&&sources(a).refs.length)||acts[0];
    const a=choose(ends[0]),b=choose(ends[1]);if(!a||!b)continue;
    emit('completed-channel-line-contrast',unique([a.personId,b.personId]),[a,b],{channelId:channel.channelId,gates:channel.gates,centers:channel.centers,endpointOccurrenceIds:ends.map(xs=>xs.map(a=>a.id)),selectedEndpointIds:[a.id,b.id],ownership:channel.relation?.classification||'natal-complete'},{symbolic:true,conditions:['BOTH_DISTINCT_ENDPOINT_MEANINGS_REQUIRED','PLANET_AND_SIDE_IDENTITIES_DO_NOT_CREATE_MODIFIER_MEANINGS'],facts:factIds(channel.personId?'channel-completion':'channel-ownership',channel.endpointActivationIds.flat())});
  }
  for(const path of index.unfinishedPaths) {
    const p=index.participants.find(p=>p.personId===path.personId)!,before=summary(p.facts.gates),after=summary([...p.facts.gates,path.absentGate]);
    const acts=path.activationIds.map(id=>index.activations.find(a=>a.id===id)!).filter(Boolean);
    const detail={channelId:path.channelId,presentGate:path.presentGate,absentGate:path.absentGate,centers:path.centers,before,after,addedChannelIds:after.channelIds.filter(id=>!before.channelIds.includes(id)),newlyDefinedCenters:after.definedCenters.filter(id=>!before.definedCenters.includes(id)),joinsNatalIslands:before.components.some((island,i)=>before.components.slice(i+1).some(other=>after.components.some(combined=>combined.includes(island[0])&&combined.includes(other[0])))),hypothetical:true,originalSnapshotUnchanged:true};
    emit('missing-harmonic-topology',[path.personId],acts,detail,{facts:factIds('unfinished-harmonic-path',path.activationIds),conditions:['HYPOTHETICAL_GATE_ADDITION_IS_NOT_A_PRESENT_ACTIVATION','NO_PERSON_IS_REQUIRED_TO_SUPPLY_AN_ENDPOINT']});
    emit('unfinished-harmonic-branch',[path.personId],acts,{...detail,otherCompletedChannelIds:path.otherCompletedChannelIds,integrationBranchToward20:path.absentGate===20&&[10,34,57].includes(path.presentGate)},{facts:factIds('unfinished-harmonic-path',path.activationIds),conditions:['PER_CHANNEL_INCOMPLETENESS_SURVIVES_OTHER_CHANNEL_COMPLETION']});
  }
  for(const graph of index.graphs)for(const edge of graph.edges) {
    const alternate=alternateCompletedRoute(graph,edge.centers[0],edge.centers[1],edge.channelId);
    const acts=index.activations.filter(a=>graph.scope.personIds.includes(a.personId)&&edge.gates.includes(a.gate));
    const joinChecks=(index.composite?.facts.topology.actualJoins||[]).filter(join=>join.witness.graphId===graph.id&&join.witness.edges.some(e=>e.channelId===edge.channelId)).map(join=>({receivingPersonId:join.personId,natalIslandIds:join.targetNatalIslandIds,oneSufficientWitnessChannelIds:join.witness.edges.map(e=>e.channelId),alternateWitnessAfterEdgeRemoval:alternateCompletedRoute(graph,join.witness.centers[0],join.witness.centers.at(-1)!,edge.channelId)}));
    emit('critical-network-bridge',graph.scope.personIds,acts,{graphId:graph.id,channelId:edge.channelId,centers:edge.centers,isCriticalToEndpointConnectivity:alternate===null,oneSufficientWitnessChannelIds:[edge.channelId],alternateWitnessChannelIds:alternate,natalIslandJoinChecks:joinChecks,isCriticalToNatalIslandJoin:joinChecks.some(join=>join.alternateWitnessAfterEdgeRemoval===null),necessityScope:'only-removal-of-this-completed-edge-in-this-pinned-graph',individualOccurrenceNecessity:'not-established-by-edge-removal'},{conditions:['ALTERNATE_COMPLETED_ROUTES_RECHECKED','WITNESS_NOT_AUTOMATICALLY_UNIQUE_OR_NECESSARY']});
  }
  // Removing one occurrence preserves all other repeats. A separate all-repeats scenario
  // is required to remove a Gate supplied repeatedly by one participant.
  for(const p of index.participants) {
    const acts=index.activations.filter(a=>a.personId===p.personId),sets=acts.map(a=>[a]);
    for(const gate of unique(acts.map(a=>a.gate))){const group=acts.filter(a=>a.gate===gate);if(group.length>1)sets.push(group);}
    for(const removed of sets) {
      const removedIds=new Set(removed.map(a=>a.id)),remainingGates=unique(acts.filter(a=>!removedIds.has(a.id)).map(a=>a.gate));
      const before=summary(p.facts.gates),after=summary(remainingGates);
      const ownership=runtime.channels.flatMap(c=>{
        const state=(gates:number[])=>((gates.includes(c.gates[0])?1:0)|(gates.includes(c.gates[1])?2:0)) as EndpointState;
        const beforeStates=index.participants.map(q=>state(q.facts.gates)),afterStates=index.participants.map(q=>state(q.personId===p.personId?remainingGates:q.facts.gates));
        const beforeClass=index.context==='composite'?classifyChannelOwnership(beforeStates[0],beforeStates[1]).classification:null,afterClass=index.context==='composite'?classifyChannelOwnership(afterStates[0],afterStates[1]).classification:null;
        return beforeStates.some((s,i)=>s!==afterStates[i])?[{channelId:c.id,beforeEndpointStates:beforeStates,afterEndpointStates:afterStates,beforeClassification:beforeClass,afterClassification:afterClass}]:[];
      });
      if(ownership.length)emit('activation-removal-ownership',[p.personId],removed,{removedActivationIds:[...removedIds],removalMode:removed.length===1?'one-occurrence':'all-this-person-gate-occurrences',gateStillPresent:removed.every(a=>remainingGates.includes(a.gate)),before,after,ownershipChanges:ownership,hypothetical:true,originalSnapshotUnchanged:true},{conditions:['COUNTERFACTUAL_STRUCTURE_ONLY_NOT_A_REVISED_BIRTH_CHART','REPEATED_OCCURRENCES_REMOVED_EXPLICITLY']});
    }
  }
  for(const a of index.activations.filter(a=>a.exactLineEligible&&a.line!==null)) {
    const u=getMeaningUnit(`${gateId(a.gate)}-line-${a.line}`,variant);if(!u)continue;
    const labels=u.fields.filter(f=>/humdes_fixing_labels|polarity_absence_markers|source2_anomaly_note|polarity_labels_raw/.test(f.fieldKey));
    const hasUnusual=labels.some(f=>typeof f.value==='string'&&/no conventional|no.*detriment|both.*exalt|nonstandard|anomal|absen/i.test(f.value))||labels.some(f=>/polarity_absence_markers\./.test(f.fieldKey)&&f.value===true);
    if(!hasUnusual)continue;
    const raw=labels.filter(f=>/^f2\.(polarity_labels_raw|polarity_absence_markers)\./.test(f.fieldKey));
    const eligibility=resolveMeaningEligibility(u,{use:options.use||'isolated-design-preview',capability:options.capability});
    const reasons=[...(eligibility.result==='design-only'?[]:['CONTENT_WITHHELD']),...(!raw.length?['RAW_POLE_CARRIER_NOT_IN_ELIGIBLE_VARIANT']:[]),...(u.issueFlags.length?['EDITORIAL_ADJUDICATION_UNRESOLVED']:[])];
    const refs=reasons.length?[]:raw.map(f=>({recordId:u.recordId,variantId:u.variantId,fieldKey:f.fieldKey,ref:f.ref}));
    emit('disputed-poles',[a.personId],[a],{recordId:u.recordId,rawSourcePolarityComparison:reasons.length?null:raw.map(f=>({fieldKey:f.fieldKey,value:f.value})),psychologicalMeaning:'withheld',coherentDistortedAreNotExaltationDetriment:true},{symbolic:true,comparison:true,refs,reasons,conditions:['SOURCE_POLARITY_STRUCTURE_ONLY','FALSE_ABSENCE_MARKERS_ARE_NOT_ASSERTIONS','NO_PLANETARY_PSYCHOLOGICAL_MODIFIER']});
  }
  return freezeReadingValue(output.sort((a,b)=>a.family.localeCompare(b.family)||a.patternId.localeCompare(b.patternId)));
}
