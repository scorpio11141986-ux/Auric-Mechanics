import { assertReadingChartIndex } from './chart-index';
import type { ReadingChartIndex } from './contracts';

/** P1's predicates are concrete issued payloads, not the preparation packet's
 * fixture hashes. This adapter neither issues facts nor accepts arbitrary JSON. */
export type P1FactQuery =
  | { kind:'activation'; activationId:string }
  | { kind:'channel'; channelId:string; personId:string|null }
  | { kind:'components'; graphId?:string }
  | { kind:'unfinished'; pathId:string; personId:string }
  | { kind:'join'; personId:string };

export function selectP1FactIds(index:ReadingChartIndex, query:P1FactQuery):string[] {
  assertReadingChartIndex(index);
  return index.facts.filter(f=>{
    if(!f.value||typeof f.value!=='object'||Array.isArray(f.value))return false;
    const v=f.value;
    switch(query.kind){
      case 'activation': return f.predicate==='activation'&&v.activationId===query.activationId&&f.activationIds.includes(query.activationId);
      case 'channel': return f.predicate===(query.personId===null?'channel-ownership':'channel-completion')&&v.channelId===query.channelId&&v.personId===query.personId;
      case 'components': return f.predicate==='definition-component'&&(query.graphId===undefined||v.graphId===query.graphId);
      case 'unfinished': return f.predicate==='unfinished-harmonic-path'&&v.id===query.pathId&&v.personId===query.personId;
      case 'join': return f.predicate==='actual-island-join'&&v.personId===query.personId;
    }
  }).map(f=>f.id);
}
