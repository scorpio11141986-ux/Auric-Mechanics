import type { CompositeCalculationV1, ChannelRelationV1 } from "../domain/composite-contracts";
import { CENTER_NAMES } from "../domain/contracts";
import { contentHash } from "../domain/composite-hash";
import { validateRelationshipReport, relationshipClaimTrace } from "./relationship";
import type { RelationshipReportV1 } from "./relationship";
import { structuralReading } from "./relationship-structural";
import { expertise, type ReaderPreferencesV1 } from "./reader-preferences";
import type { CompositeSelection } from "../ui/composite-workspace-model";
import { connectionInventory, queryConnections } from "./connection-inventory";
import { composeReaderChapters, type ChapterReading } from "./reader-chapters";
import { labelMechanics } from "./reader-names";

export type ReaderFinding = {id:string;title:string;summary:string;details:string[];selection:CompositeSelection;factIds:string[];contributionIds:string[];claimIds:string[];kind:"structural"};
export type ReaderNarrative = {headline:string;paragraphs:string[];featuredIds:string[];rankingReasons:string[];traceId:string;factIds:string[];contributionIds:string[];counterfactual:string;scope?:string};
export type AdaptiveReading = {version:"CM04b-reader-2.1.0";calculationId:string;factsHash:string;narrative:ReaderNarrative;semantic:ChapterReading|null;findings:ReaderFinding[];synthesis:{text:string;factIds:string[];opposingFactIds:string[];channelIds:string[]}|null;prompt:string;teaching:string;boundary:string;observation:string|null};
export function adaptiveRelationshipReading(c:CompositeCalculationV1,report:RelationshipReportV1,p:ReaderPreferencesV1,names:Record<string,string>):AdaptiveReading {
  validateRelationshipReport(c,report);
  const q=report.request,top=c.facts.topology,beginner=expertise(p)==="Beginner",precise=["Advanced","Practitioner"].includes(expertise(p));
  const name=(id:string)=>names[id]||`Person ${id===q.roles[0]?"A":"B"}`;
  const findings:ReaderFinding[]=[];
  const add=(key:string,title:string,summary:string,details:string[],selection:CompositeSelection,ids:string[],contributions:string[],claimIds:string[]=[])=>findings.push({id:`reader:${contentHash([c.calculationId,q.roles,q.mode,key])}`,title,summary,details,selection,factIds:ids,contributionIds:contributions,claimIds,kind:"structural"});
  const inventory=c.facts.mechanicsFacts.filter(f=>f.predicate==="activation-contribution");
  if(q.selection.kind!=="overview" || q.scope!=="A+B") {
    const s=structuralReading(c,report),visible=q.selection.kind!=="overview"?s.claims.filter(x=>x.ruleId==="selection"):s.claims;
    const selected=q.selection;
    const selectedTitle=selected.kind==="gate"?`Gate ${selected.gate}`:selected.kind==="center"?`${CENTER_NAMES[selected.id]} Center`:selected.kind==="channel"?`Channel ${selected.id.replace("channel-","")}`:selected.kind==="witness"?"Actual connection between natal networks":selected.kind==="component"?"Selected Definition island":null;
    for(const claim of visible) add(claim.id,selectedTitle||claim.title,claim.summary,claim.details,claim.selection,claim.provenance.structuralSupport.factIds,claim.provenance.structuralSupport.contributionIds,[claim.id,...report.claims.filter(x=>x.id.endsWith(":mechanics")).map(x=>x.id)]);
    if(q.selection.kind!=="overview") {
      const legacy=report.claims.find(x=>x.id.endsWith(":mechanics"))!;
      const trace=relationshipClaimTrace(c,report,legacy.id);
      const details=trace.supportingContributions.map(x=>`${name(x.personId)}: ${x.planet}, ${x.side==="design"?"Design":"Personality"}, Gate ${x.gate}${x.boundaryRisk||x.uncertaintyRef.eligibility!=="exact-point"?" (exact Line withheld: time or boundary uncertainty)":`.${x.line}`}.`);
      if(findings[0]) findings[0].details.push(...details);
      const graph=q.scope==="A+B"?top.combinedGraph:top.natalGraphs.find(g=>g.scope.personIds[0]===q.roles[q.scope==="A"?0:1])!;
      const selected=q.selection;
      if(selected.kind==="center") {
        const complete=graph.edges.filter(e=>e.centers.includes(selected.id));
        findings[0].details.unshift(complete.length?`Why it is defined here: complete Channel${complete.length===1?"":"s"} ${complete.map(e=>e.gates.join("–")).join(", ")} connect${complete.length===1?"s":""} this Center in the selected graph. Active Gates without a complete Channel would not define it.`:"No complete Channel reaches this Center in the selected graph. An active Gate by itself does not define it.");
      }
      if(selected.kind==="gate") {
        const edges=c.facts.channelRelations.filter(r=>r.gates.includes(selected.gate));
        findings[0].details.unshift(...edges.map(r=>`Gate ${selected.gate} pairs with Gate ${r.gates.find(g=>g!==selected.gate)} in ${r.gates.join("–")}: ${graph.edges.some(e=>e.channelId===r.channelId)?"the complete Channel is present in this view":"the complete Channel is absent in this view"}.`));
      }
    }
  } else {
    const combined=top.combinedGraph,created=top.deltas.combinedOnlyCenterIds;
    const joins=top.actualJoins;
    const joinedNames=[...new Set(joins.map(j=>name(j.personId)))];
    const title=created.length?`Together, a new ${created.map(id=>CENTER_NAMES[id]).join(" and ")} connection`:joins.length?top.islandEffects.some(e=>e.status==="some-joined")?"Some natal networks connect; others remain separate":"Separate natal networks become connected together":combined.componentCount>1?"Together is not the same as one connected whole":"What remains the same together";
    const summary=created.length?`${created.map(id=>CENTER_NAMES[id]).join(" and ")} is defined only in the pair, not in either natal chart. Yet the pair still has ${combined.componentCount} separate connected area${combined.componentCount===1?"":"s"}. More definition does not necessarily mean everything connects.`:
      joins.length?`${joinedNames.join(" and ")} ${joinedNames.length===1?"has":"have"} natal areas that become connected in the pair. ${beginner?"An area here means Centers linked by complete Channels, not a feeling of being complete.":"These are actual natal-island joins, not simply newly colored Centers."}`:
      `This pair has ${combined.componentCount} connected area${combined.componentCount===1?"":"s"}. ${top.deltas.combinedOnlyChannelIds.length?`${top.deltas.combinedOnlyChannelIds.length} Channels are complete only together; that does not establish a natal-island join.`:"There are no new jointly completed Channels. A relationship does not need a new chart connection to matter."}`;
    add("topology",title,summary,[...top.islandEffects.map(e=>`${name(e.personId)}: ${e.natalIslandCount} natal connected areas; ${e.status==="no-natal-split"?"no natal split to complete":e.status==="all-joined"?"all natal areas join in this pair":e.status==="some-joined"?"some natal areas join":"natal areas remain separate"}.`),
      `Apart, each keeps their own natal structure. ${c.inputs.map(i=>`${name(i.personId)}: ${i.facts.type}, ${i.facts.authority} Authority`).join("; ")}. No combined Authority or consent follows.`],joins[0]?{kind:"witness",id:joins[0].witness.id,personId:joins[0].personId}:created[0]?{kind:"center",id:created[0]}:{kind:"overview"},inventory.map(f=>f.id),c.facts.contributions.map(x=>x.id));
    const rows=queryConnections(connectionInventory(c,p)).map(x=>x.relation);
    for(const r of rows) {
      const holders=r.endpointStates.filter(x=>x.state===3).map(x=>name(x.personId));
      const partial=r.endpointStates.find(x=>x.role==="partial-holder");
      const endpoints=r.endpoints.map(e=>`${e.gate}: ${e.personIds.map(name).join(" + ")}`).join("; ");
      const ownership=r.classification==="compromise"?`${holders.join(" and ")} already ${holders.length===1?"has":"have"} both Gates of ${r.gates.join("–")}; ${name(partial!.personId)} has one end. This is an unequal contribution, not a verdict that someone must give way.`:
        r.classification==="electromagnetic"?`Neither person has the complete ${r.gates.join("–")} Channel alone. ${r.endpoints.map(e=>`${e.personIds.map(name).join(" + ")} supplies Gate ${e.gate}`).join("; ")}. It becomes complete only together.`:
        r.classification==="companionship"?`Both people already have the complete ${r.gates.join("–")} Channel. Together does not create this Channel; apart, each retains it. This does not prove shared tastes or ease.`:
        `${holders.join(" and ")} brings the complete ${r.gates.join("–")} Channel; the other person has neither end. “Dominance” names this ownership pattern, not power or control in the relationship.`;
      const fact=c.facts.mechanicsFacts.find(f=>f.predicate==="channel-relation"&&(f.value as {channelId?:string}).channelId===r.channelId)!;
      const supports=c.facts.contributions.filter(x=>r.gates.includes(x.gate));
      const repeated=r.endpoints.filter(e=>e.contributionIds.length>e.personIds.length);
      const onWitness=top.actualJoins.some(j=>j.witness.edges.some(e=>e.channelId===r.channelId));
      const exact=supports.find(x=>!x.boundaryRisk&&x.uncertaintyRef.eligibility==="exact-point");
      const pedagogy=ownership+(expertise(p)==="Beginner"?"":expertise(p)==="Some knowledge"?` Compare this contribution with each person's natal Type and Authority: ${c.inputs.map(i=>`${name(i.personId)} remains a ${i.facts.type} with ${i.facts.authority} Authority`).join("; ")}. Completing this link does not assign a new personal Type.`:expertise(p)==="Intermediate"?` The complete link defines ${r.centers.map(id=>CENTER_NAMES[id]).join(" and ")}; that is a local effect, not proof that every area connects.`:expertise(p)==="Advanced"?` ${onWitness?"A recorded sufficient natal-island route uses this Channel; that does not establish necessity.":"No recorded sufficient natal-island witness uses this Channel; other routes must be considered separately."}`:
        ` ${r.circuit}; ${supports.length} exact activation records${exact?`, including ${name(exact.personId)}'s ${exact.side} ${exact.planet} ${exact.gate}.${exact.line}`:" (exact Lines withheld)"}. ${repeated.length?"Repeated endpoint support means one deletion may not break the link.":"Both endpoint supports are required."}`);
      const resolution=precise?`${r.circuit}: ${supports.length} separate planetary activations support the two endpoints${repeated.length?`; Gate${repeated.length>1?"s":""} ${repeated.map(e=>e.gate).join(", ")} repeat${repeated.length===1?"s":""}, so deleting one record alone need not remove the Channel`:""}. Multiplicity changes the removal test, not the amount of definition.`:
        `The link runs between ${r.centers.map(id=>CENTER_NAMES[id]).join(" and ")}. ${r.combinedOnly?"It requires a matching contribution from each chart; an unrelated active Gate cannot replace an absent end.":"Its presence together should not be mistaken for something neither person has alone."}`;
      add(r.channelId,`${r.gates.join("–")} · ${r.classification}`,pedagogy,[`Together links ${r.centers.map(id=>CENTER_NAMES[id]).join(" and ")}; ${r.combinedOnly?"this link is absent from both individual graphs":"the natal full holder retains it apart"}.`,`${precise?`${r.circuit}. Endpoint ownership` : "Who brings each end"}: ${endpoints}.`,
        `If ${r.classification==="electromagnetic"?"either participant were absent, this joint Channel would be incomplete":"the other participant were absent, the full holder would still have this natal Channel"}. This compares charts, not the worth of the relationship.`,
        resolution,...(precise?supports.map(x=>`${name(x.personId)} · ${x.planet} · Gate ${x.gate}${x.boundaryRisk||x.uncertaintyRef.eligibility!=="exact-point"?" (exact Line withheld: time or boundary uncertainty)":`.${x.line}`} · ${x.side==="design"?"Design":"Personality"}`):[])],{kind:"channel",id:r.channelId},[fact.id],r.endpoints.flatMap(e=>e.contributionIds));
    }
  }
  const n=p.depth==="quick"?1:p.depth==="standard"?3:Infinity;
  const formed=c.facts.channelRelations.filter(r=>r.formed),joint=formed.filter(r=>r.combinedOnly),retained=formed.filter(r=>!r.combinedOnly);
  const synthesis=q.selection.kind==="overview"&&q.scope==="A+B"?{
   text:`There are two different kinds of togetherness in this chart: ${joint.length} Channels exist only with both sets of contributions, while ${retained.length} are already complete in at least one natal chart. ${top.actualJoins.length?`The pair also joins natal areas for ${[...new Set(top.actualJoins.map(j=>name(j.personId)))].join(" and ")}; that is a change in connectivity, not simply more colored Centers.`:`None of the issued actual-join witnesses joins two natal islands. Jointly completed Channels therefore must not be described as completing a personal split.`} ${top.combinedGraph.componentCount===0?"There is no defined network in the combined graph; neither person's natal structure or Authority is replaced.":top.combinedGraph.componentCount>1?`Even with ${top.combinedGraph.definedCenters.length} defined Centers, ${top.combinedGraph.componentCount} connected areas remain separate. More definition is not the same as one connected whole.`:"The combined graph is connected; neither person's natal structure or Authority is replaced by that combined graph."} ${p.depth==="deep"?`The catalog places these links in ${[...new Set(formed.map(r=>r.circuit))].join(", ")}. Those groupings do not establish attraction, a communication style or how either person feels. Compare local ownership with whole-route evidence before assigning meaning.`:""}`,
   factIds:c.facts.mechanicsFacts.filter(f=>["channel-relation","actual-island-join","definition-component","center-definition","island-effect","completed-natal-channel"].includes(f.predicate)).map(f=>f.id),
   opposingFactIds:c.facts.mechanicsFacts.filter(f=>f.predicate==="definition-component"||f.predicate==="completed-natal-channel").map(f=>f.id),channelIds:formed.map(r=>r.channelId)}:null;
  const overview=q.selection.kind==="overview"&&q.scope==="A+B";
  const primary=findings[0];
  // Rank a global consequence first, then distinct emergent and retained ownership patterns.
  // Ties keep the existing inventory order; there is no inferred compatibility score.
  const featured=[primary,...(overview?[findings.slice(1).find(f=>formed.find(r=>r.channelId===(f.selection.kind==="channel"?f.selection.id:""))?.combinedOnly),findings.slice(1).find(f=>formed.find(r=>r.channelId===(f.selection.kind==="channel"?f.selection.id:""))?.combinedOnly===false)]:[])].filter((f):f is ReaderFinding=>!!f);
  const unique=[...new Map(featured.map(f=>[f.id,f])).values()].slice(0,3);
  const paragraphs=overview?[
    primary?.summary.includes(name(q.roles[0]))?primary.summary:`${name(q.roles[0])} and ${name(q.roles[1])}: ${primary?.summary||"No supported structural conclusion is available."}`,
    `${joint.length} of the ${formed.length} complete Channels depend on both charts; ${retained.length} are already complete in at least one person. ${top.islandEffects.map(e=>`${name(e.personId)} ${e.status==="no-natal-split"?"has no natal split to bridge":e.status==="all-joined"?"has all natal islands joined in this pair":e.status==="some-joined"?"has only some natal islands joined":"keeps separate natal islands even together"}`).join("; ")}. These are different structural changes, not different measures of relationship value.`,
    p.depth==="quick"?`Apart, ${c.inputs.map(i=>`${name(i.personId)} retains ${i.facts.authority} Authority`).join(" and ")}. A new shared Center never assigns a new personal decision process.`:
    `The useful distinction is not simply more versus less activation. First compare what each person already brings, then what depends on both, then whether complete routes actually connect previously separate networks. ${c.inputs.map(i=>`${name(i.personId)} retains natal ${i.facts.authority} Authority`).join("; ")}. Neither a newly defined Center nor a bridge changes that natal fact.`
  ]:[primary?.summary||"No supported structural conclusion is available."];
  const narrative:ReaderNarrative={headline:primary?.title||"Reading unavailable",paragraphs,featuredIds:unique.map(f=>f.id),scope:q.scope,
    rankingReasons:overview?["Whole-chart connectivity precedes local endpoint ownership.","One jointly completed and one natal-retained connection show different kinds of contribution; neither is a compatibility ranking.",...unique.flatMap(f=>f.selection.kind==="channel"?connectionInventory(c,p).filter(row=>row.id===(f.selection.kind==="channel"?f.selection.id:"")).map(row=>`${row.relation.gates.join("–")}: ${row.reasons.join("; ")||"retained natal structure provides a contrast with jointly completed links"}.`):[]),"Equal structural priorities retain the deterministic inventory order; no psychological significance is inferred."]:["The selected chart object and actor scope determine this reading."],
    traceId:`narrative:${contentHash([c.calculationId,q.roles,q.scope,q.selection])}`,factIds:overview?synthesis!.factIds:primary?.factIds||[],contributionIds:overview?c.facts.contributions.map(x=>x.id):primary?.contributionIds||[],
    counterfactual:overview?"Recalculate after removing a participant or required endpoint: joint Channels disappear, natal-held Channels remain in their owner's chart, and actual island joins must be recomputed. A sufficient witness is not necessarily a unique or necessary path.":"Removing the selected structure's required contributions invalidates this explanation; another activation of the same Gate may still supply that endpoint."};
  const semantic=overview?composeReaderChapters(c,p,names,q.roles):null;
  if(semantic){narrative.headline=semantic.headline;narrative.paragraphs=semantic.opening;}
  const label=(text:string)=>labelMechanics(text,Object.values(names));
  narrative.headline=label(narrative.headline);
  narrative.paragraphs=narrative.paragraphs.map(label);
  for(const f of findings){f.title=label(f.title);f.summary=label(f.summary);f.details=f.details.map(label);}
  if(c.facts.eligibility==="provisional-point"){
    narrative.headline=`Provisional point: ${narrative.headline}`;
    narrative.paragraphs.unshift("This is one provisional birth-time point, not a stability finding across a time window. Channels, networks and natal Authority may change outside this point; no probability is claimed.");
  }
  return {version:"CM04b-reader-2.1.0",calculationId:c.calculationId,factsHash:c.factsHash,narrative,semantic,findings:findings.map(f=>({...f,details:f.details.slice(0,n)})),synthesis,
    teaching: p.teaching==="example"?formed[0]?`Take this pair's ${formed[0].gates.join("–")}: ${formed[0].endpoints.map(e=>`${e.personIds.map(name).join(" + ")} supplies Gate ${e.gate}`).join("; ")}. Together those matching ends connect ${formed[0].centers.map(id=>CENTER_NAMES[id]).join(" and ")}. Another active Gate nearby cannot substitute for either end. Whether that link joins a natal split still needs a complete route.`:"No complete Channel exists in this pair; isolated active Gates do not create one.":p.teaching==="questions"?"Which connection is already present alone? Which appears only together? Follow the evidence before assigning it a personal meaning.":beginner?"A Gate is one endpoint. A complete Channel links two Centers. Definition islands are separate networks of complete Channels; colored Centers alone do not show connectivity.":precise?"Separate natal completeness, pair classification and topology. One sufficient path is not proof of a unique or necessary bridge.":"Compare each natal chart with the combined graph: ownership and connectedness answer different questions.",
    prompt:`${p.style==="spiritual"?"As a personal contemplative practice, without treating the chart as a spiritual diagnosis":p.style==="integrated"?"In reflection and in everyday choices":p.style==="technical"?"As a check against the structural comparison":"In a specific everyday situation"}, ${p.interests.some(i=>/friend/i.test(i))?"what do you each notice in shared activities compared with time apart?":p.interests.some(i=>/romance|sexual/i.test(i))?"what closeness and pacing have both people actually chosen? The chart cannot establish attraction or consent.":p.interests.some(i=>/cohabit|long-term/i.test(i))?"which routines do you each choose, and which expectations need a separate conversation?":"what is different together versus apart, according to each person's own account?"}`,
    boundary:"Calculated relationship structure, not a personal prediction. Intimacy, attraction, sustainability and psychological meanings are not yet source-approved. Reading preferences change exposition, not chart facts.",
    observation:q.observation?`You reported: “${q.observation.text}” This is your account, not a finding inferred from the chart.`:null};
}
