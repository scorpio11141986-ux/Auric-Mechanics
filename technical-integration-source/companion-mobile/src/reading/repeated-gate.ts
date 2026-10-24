import {contentHash} from '../domain/composite-hash';
import type {IndexedActivation,ReadingChartIndex} from './contracts';

/** Context inventory is exhaustive; a comparison is only a disclosed subset.
 * This pure projection also supports duplicate/uncertain-row diagnostic fixtures.
 * Issuance is still checked by the caller before these facts become claims. */
export function repeatedGateInventory(rows:readonly IndexedActivation[],gate:number){
 const all=[...new Map(rows.filter(a=>a.gate===gate).map(a=>[a.id,a])).values()].sort((a,b)=>a.id.localeCompare(b.id));
 const eligible=all.filter(a=>a.exactLineEligible&&a.line!==null);
 return {allContextActivationIds:all.map(a=>a.id),eligibleExactActivationIds:eligible.map(a=>a.id),occurrenceCount:all.length,
  distinctEligibleLines:[...new Set(eligible.map(a=>a.line!))].sort((a,b)=>a-b)};
}
export function repeatedGateWitness(index:ReadingChartIndex,gate:number,selected:string[]){
 const inventory=repeatedGateInventory(index.activations,gate);
 const scope={kind:index.context==='natal'?'natal' as const:'pair' as const,contextId:index.indexHash,
  participantSnapshots:index.participants.map(p=>({personId:p.personId,chartRevision:p.chartVersionId})),worldId:`point:${index.indexHash}`,gate};
 const body={scope,...inventory,selectedComparisonActivationIds:[...new Set(selected)].sort(),
  omittedEligibleActivationIds:inventory.eligibleExactActivationIds.filter(id=>!selected.includes(id)),assertionScope:'selected-comparison' as const};
 return {...body,witnessId:`repetition:${contentHash(body)}`};
}
