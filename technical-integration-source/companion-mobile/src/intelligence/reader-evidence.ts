import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { CENTER_NAMES } from "../domain/contracts";
import type { ReaderFinding, ReaderNarrative } from "./relationship-reader";
import { gateRef, channelRef } from "./mechanics-references";

export function evidenceSummary(c:CompositeCalculationV1,value:ReaderFinding|ReaderNarrative,names:Record<string,string>):string[] {
  const name=(id:string)=>names[id]||"Participant",top=c.facts.topology,rows:string[]=[];
  if("headline" in value&&value.scope&&value.scope!=="A+B"){
    rows.push(value.paragraphs[0],value.counterfactual);
  }else if("headline" in value){
    for(const input of c.inputs){const graph=top.natalGraphs.find(g=>g.scope.personIds[0]===input.personId)!;rows.push(`${name(input.personId)} alone: ${graph.componentCount} connected ${graph.componentCount===1?"network":"networks"}; ${input.facts.authority} natal Authority.`);}
    rows.push(`Together: ${top.combinedGraph.componentCount} connected networks. ${top.deltas.combinedOnlyChannelIds.length} Channels need contributions from both charts.`);
    for(const join of top.actualJoins.slice(0,2))rows.push(`${name(join.personId)}: one sufficient route joins natal networks through ${join.witness.edges.map(e=>e.channelId.replace("channel-","")).join(" → ")}. This is not proof the route is unique or necessary.`);
    if(!top.actualJoins.length)rows.push("No actual join between two natal islands is recorded; jointly completing a Channel is a different finding.");
  }else{
    const supports=c.facts.contributions.filter(x=>value.contributionIds.includes(x.id));
    const gates=[...new Set(supports.map(x=>x.gate))];
    for(const gate of gates.slice(0,3))rows.push(`${gateRef(gate)}: ${[...new Set(supports.filter(x=>x.gate===gate).map(x=>name(x.personId)))].join(" + ")}. ${supports.filter(x=>x.gate===gate).length} activation record(s) supply this endpoint.`);
    const selection=value.selection;
    if(selection.kind==="channel"){
      const r=c.facts.channelRelations.find(r=>r.channelId===selection.id)!;
      rows.push(`${channelRef(r.channelId)}; ${r.classification} is its ownership category, not a relationship verdict.`);
    }else if(selection.kind==="center"){
      rows.push(value.details[0]||value.summary);
    }else if(selection.kind==="witness"){
      const j=top.actualJoins.find(j=>j.witness.id===selection.id);
      if(j)rows.push(`${name(j.personId)}: recorded sufficient path ${j.witness.centers.map(id=>CENTER_NAMES[id]).join(" → ")}; not a uniqueness or necessity claim.`);
    }
    if(!rows.length)rows.push(value.summary);
  }
  rows.push(c.facts.eligibility==="provisional-point"?"Birth time is provisional: this is a point calculation, not stability across a time window.":"Point-chart evidence only. Near-boundary Lines are withheld; no relationship behavior is established.");
  return rows.slice(0,7);
}
