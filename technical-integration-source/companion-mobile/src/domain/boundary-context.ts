import {mapLongitude} from './astronomy';
import {deriveStructure} from './calculator';
import type {Activation,HumanDesignFactsV1} from './contracts';
const near=1/60+1e-8;
/** Local angular counterfactuals, not time samples or revised natal facts. */
export function boundaryContext(chart:HumanDesignFactsV1,a:Activation){
 const variants=[-near,near].map(delta=>{
  const acts=chart.activations.map(v=>{
   const paired=v.side===a.side&&['Sun','Earth'].includes(a.planet)&&['Sun','Earth'].includes(v.planet);
   if(v.id!==a.id&&!paired)return v;
   return {...v,...mapLongitude(v.longitude+delta)};
  });
  const structure=deriveStructure([...new Set(acts.map(v=>v.gate))]);
  const sun=(side:Activation['side'])=>acts.find(v=>v.side===side&&v.planet==='Sun')?.line;
  const mapped=acts.find(v=>v.id===a.id)!;
  return {gate:mapped.gate,line:mapped.line,structure,profile:`${sun('personality')}/${sun('design')}`,cross:acts.filter(v=>['Sun','Earth'].includes(v.planet)).map(v=>({id:v.id,gate:v.gate}))};
 });
 const [before,after]=variants,channelIds=(x:typeof before)=>x.structure.channels.map(c=>c.id).sort();
 const changedChannels=[...new Set([...channelIds(before),...channelIds(after)])].filter(id=>channelIds(before).includes(id)!==channelIds(after).includes(id));
 const changedCenters=before.structure.centers.filter(c=>after.structure.centers.find(v=>v.id===c.id)?.defined!==c.defined).map(c=>c.id);
 const kind=before.gate!==after.gate?'Gate edge':'internal Line boundary';
 const changes=[...(changedChannels.length?[`Channels ${changedChannels.map(id=>id.replace('channel-','')).join(', ')}`]:[]),...(changedCenters.length?[`Centers ${changedCenters.join(', ')}`]:[]),...(before.structure.definition!==after.structure.definition?['Definition']:[]),...(before.structure.type!==after.structure.type?['Type']:[]),...(before.structure.authority!==after.structure.authority?['Authority']:[]),...(before.profile!==after.profile?['Profile']:[]),...(JSON.stringify(before.cross)!==JSON.stringify(after.cross)?['four Sun/Earth Cross Gates']:[])];
 return {activationId:a.id,kind,variants,changedChannels,changedCenters,changes,notice:`${a.side} ${a.planet} ${a.gate}.${a.line} is near an ${kind==='Gate edge'?'outer Gate edge':'internal Line boundary'}: ${before.gate}.${before.line} / ${after.gate}.${after.line}. ${changes.length?`In the local angular comparison, these differ: ${changes.join('; ')}.`:'The Gate, Channels, Centers, Definition, Type, Authority, Profile and four Cross Gates stay the same in this comparison.'} This hypothetical angular comparison is not a birth-time interval certificate; natal classifications remain unchanged.`};
}
/** Preserve serialized historical chart revisions/cache identities; replace their legacy
 * broad warning only at presentation boundaries, using freshly computed consequences. */
export function chartUncertaintyForDisplay(chart:HumanDesignFactsV1):string[]{
 return [...chart.uncertainty.filter(t=>!t.includes('within one arcminute of a Line boundary; affected chart structure may change.')),...chart.activations.filter(a=>a.boundaryRisk).map(a=>boundaryContext(chart,a).notice)];
}
