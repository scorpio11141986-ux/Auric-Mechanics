import type { CompositeCalculationV1, ChannelRelationV1 } from "../domain/composite-contracts";
import { runtime } from "../content/records";
import { contentHash } from "../domain/composite-hash";
import type { ReaderPreferencesV1 } from "./reader-preferences";

export type ConnectionRow={id:string;relation:ChannelRelationV1;salience:number;reasons:string[];factIds:string[];contributionIds:string[];source:{recordId:string;field:string;fieldHash:string}[];substream:string;effects:string[];evidence:"boundary"|"stable-point"};
export type ConnectionQuery={search?:string;classification?:string;center?:string;personId?:string;circuit?:string;evidence?:"all"|"boundary"|"stable-point";sort?:"salience"|"classification"|"center"|"circuit"|"person"|"evidence";includeIncomplete?:boolean};
export function connectionInventory(c:CompositeCalculationV1,p:ReaderPreferencesV1):ConnectionRow[]{
 return c.facts.channelRelations.map(r=>{
  const source=runtime.channels.find(s=>s.id===r.channelId)!;
  const facts=c.facts.mechanicsFacts.filter(f=>f.predicate==="channel-relation"&&(f.value as {channelId?:string}).channelId===r.channelId);
  const reasons:string[]=[];
  if(c.facts.topology.deltas.combinedOnlyCenterIds.some(id=>r.formed&&r.centers.includes(id)))reasons.push("reaches a newly defined Center");
  if(c.facts.topology.actualJoins.some(j=>j.witness.edges.some(e=>e.channelId===r.channelId)))reasons.push("appears in an actual natal-island join witness");
  if(r.combinedOnly)reasons.push("complete only in the pair");
  if(r.classification==="compromise")reasons.push("unequal full/partial ownership");
  if(p.interests.some(i=>/intellect|communicat|team/i.test(i))&&r.centers.includes("Throat"))reasons.push("Throat connection relevant to chosen exploration focus, not proof of communication quality");
  const effects=r.formed?c.facts.topology.combinedGraph.components.filter(i=>r.centers.every(id=>i.centerIds.includes(id))).map(i=>`Within combined island: ${i.centerIds.join(" / ")}.`):["Incomplete: active endpoints alone do not define a Channel or Center."];
  return {id:r.channelId,relation:r,salience:reasons.length,reasons,factIds:facts.map(f=>f.id),contributionIds:r.endpoints.flatMap(e=>e.contributionIds),substream:source.substream,evidence:c.facts.contributions.some(x=>r.gates.includes(x.gate)&&x.boundaryRisk)?"boundary":"stable-point",
   source:["circuit","substream"].map(field=>({recordId:source.id,field,fieldHash:contentHash(source[field as "circuit"|"substream"])})),effects};
 });
}
export function queryConnections(rows:ConnectionRow[],q:ConnectionQuery={}):ConnectionRow[]{
 const result=rows.filter(x=>{
  const r=x.relation;
  return (q.includeIncomplete||r.formed)&&(!q.classification||r.classification===q.classification)&&(!q.center||r.centers.some(id=>id.toLowerCase().replace(/[^a-z]/g,"")===q.center!.toLowerCase().replace(/[^a-z]/g,"")))&&
   (!q.personId||r.endpointStates.some(e=>e.personId===q.personId&&e.state!==0))&&(!q.circuit||r.circuit===q.circuit)&&
   (!q.evidence||q.evidence==="all"||x.evidence===q.evidence)&&
   (!q.search||`${r.gates.join("-")} ${r.centers.join(" ")} ${r.circuit} ${x.substream} ${r.classification}`.toLowerCase().includes(q.search.toLowerCase().replace(/–/g,"-")));
 });
 const key=(x:ConnectionRow)=>q.sort==="classification"?x.relation.classification||"unformed":q.sort==="center"?[...x.relation.centers].sort().join():q.sort==="circuit"?x.relation.circuit:q.sort==="person"?x.relation.fullOwnerIds.join():q.sort==="evidence"?x.evidence:"";
 return result.sort((a,b)=>q.sort&&q.sort!=="salience"?key(a).localeCompare(key(b))||a.id.localeCompare(b.id):b.salience-a.salience||a.id.localeCompare(b.id));
}
