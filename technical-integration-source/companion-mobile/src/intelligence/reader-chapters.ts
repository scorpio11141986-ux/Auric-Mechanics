import type { CompositeCalculationV1, ChannelRelationV1 } from "../domain/composite-contracts";
import { CENTER_NAMES } from "../domain/contracts";
import { mechanicsTraceFor } from "../domain/composite";
import { contentHash } from "../domain/composite-hash";
import { conceptGloss, type ReaderPreferencesV1 } from "./reader-preferences";
import { gateRef, channelRef } from "./mechanics-references";

export type SemanticFinding = {
  id: string;
  kind: "calculated-explanation";
  publication: "structural-only";
  topic: "orientation" | "connection" | "contribution" | "autonomy" | "routes" | "activation";
  title: string;
  paragraphs: string[];
  factIds: string[];
  contributionIds: string[];
  channelIds: string[];
  countercondition: string;
};
export type ReaderChapter = SemanticFinding & { depth: "standard" | "deep" };
export type ChapterReading = {
  version: "R3-1.0.0";
  headline: string;
  takeaway: string;
  opening: string[];
  chapters: ReaderChapter[];
  findingIds: string[];
  explanationStage: number;
  contextActivationIds: string[];
  unavailable: { topic: string; reason: string }[];
};

// Five easy presets are a UI convenience. The original seven pedagogical states remain distinct.
export function explanationStage(p: ReaderPreferencesV1): number {
  const stages = ["new", "type", "profile-authority", "centers", "gates-channels", "advanced", "practitioner"];
  const legacy = stages.indexOf(p.familiarity);
  const match = ["beginner", "some", "intermediate", "intermediate", "advanced", "advanced", "practitioner"][legacy];
  if (!p.preset || p.preset === match) return legacy;
  return { beginner: 0, some: 1, intermediate: 3, advanced: 5, practitioner: 6 }[p.preset];
}

export function graphComponentsWithout(c: CompositeCalculationV1, removed: string[]): string[][] {
  const edges = c.facts.topology.combinedGraph.edges.filter(e => !removed.includes(e.channelId));
  const remaining = new Set<string>(edges.flatMap(e => e.centers));
  const result: string[][] = [];
  while (remaining.size) {
    const group = [remaining.values().next().value!];
    remaining.delete(group[0]);
    for (let i = 0; i < group.length; i++) {
      for (const edge of edges.filter(e => e.centers.includes(group[i] as never))) {
        for (const center of edge.centers) if (remaining.delete(center)) group.push(center);
      }
    }
    result.push(group.sort());
  }
  return result;
}

export function composeReaderChapters(c: CompositeCalculationV1, p: ReaderPreferencesV1, names: Record<string,string>, roles = c.displayParticipantIds): ChapterReading {
  mechanicsTraceFor(c, c.facts.mechanicsFacts[0].id);
  const stage = explanationStage(p), top = c.facts.topology;
  const name = (id: string) => names[id] || "Participant";
  const inputs = roles.map(id => c.inputs.find(i => i.personId === id)!);
  if (inputs.some(i => !i) || new Set(roles).size !== 2) throw Error("Reading requires the issued pair's two distinct participants.");
  const formed = c.facts.channelRelations.filter(r => r.formed);
  const joint = formed.filter(r => r.combinedOnly);
  const retained = formed.filter(r => !r.combinedOnly);
  const shared = retained.filter(r => r.classification === "companionship");
  const asymmetry = retained.filter(r => r.classification === "compromise");
  const effect = (id: string) => top.islandEffects.find(e => e.personId === id)!;
  const state = (id: string) => {
    const e = effect(id);
    return e.status === "no-natal-split" ? e.natalIslandCount===0?"has no defined natal network, so there is no natal split to bridge":"already has one connected natal network, so there is no personal split to bridge" :
      e.status === "all-joined" ? `has all natal islands joined here (${e.natalIslandCount} original networks)` :
      e.status === "some-joined" ? `has some of ${e.natalIslandCount} natal networks joined here, while others remain separate` :
      `keeps separate natal islands (${e.natalIslandCount} networks) in this pair`;
  };
  const some = top.islandEffects.some(e => e.status === "some-joined");
  const all = top.islandEffects.some(e => e.status === "all-joined");
  const headline = some ? "A real connection, without every part becoming one" : all ?
    shared.length ? "New connections alongside something you each already carry" : "What was separate becomes connected together" :
    joint.length ? "What you create together and what belongs to each of you" : "A connection built on what each of you already brings";
  const topologySentence = `${name(roles[0])} ${state(roles[0])}; ${name(roles[1])} ${state(roles[1])}.`;
  const sameAuthority = inputs[0].facts.authority === inputs[1].facts.authority;
  const authoritySentence = `${inputs.map(i=>`${name(i.personId)} retains natal ${i.facts.authority} Authority`).join("; ")}. ` + (sameAuthority ? "A shared label is not a shared response or a joint decision." :
    "A connection between charts does not give either person the other's decision process.");
  const joinedPerson=roles.find(id=>effect(id).status==="some-joined")||roles.find(id=>effect(id).status==="all-joined");
  const joinedEffect=joinedPerson?effect(joinedPerson):null;
  const largestJoin=joinedEffect?Math.max(0,...Object.values(joinedEffect.mappings.reduce<Record<string,number>>((counts,m)=>{counts[m.combinedComponentId]=(counts[m.combinedComponentId]||0)+1;return counts;},{}))):0;
  const takeaway=(joinedEffect?joinedEffect.status==="all-joined"?
    `All ${joinedEffect.natalIslandCount} of ${name(joinedPerson!)}'s natal networks connect together here.`:
    `${largestJoin} of ${name(joinedPerson!)}'s ${joinedEffect.natalIslandCount} natal networks connect here; others remain separate.`:
    joint.length?`${joint.length} pathways exist only together; neither chart becomes the other person's chart.`:"This pair brings together pathways already present alone, rather than creating a new Channel.")+" "+
    (sameAuthority?"Similar natal Authority, but still two separate decisions.":"Different natal Authorities remain individual, not a shared decision process.");
  const lessons = [
    [...(p.concepts?.centers===true?[]:["Your BodyGraph is a map of nine Centers."]),...(p.concepts?.gates===true?[]:["A Gate is one endpoint."]),...(p.concepts?.channels===true?[]:["A complete Channel connects two Centers."]),...(p.concepts?.definition===true?[]:["Separate groups of those connections are called Definition islands."]),"Read together and alone as different maps, not as a test of whether you belong together."].join(" "),
    `Knowing Type is a starting point, not the conclusion: ${inputs.map(i=>`${name(i.personId)} is a ${i.facts.type}`).join("; ")}. The important change here is which pathways connect together, not a new relationship Type.`,
    `Your Profiles (${inputs.map(i=>`${name(i.personId)} ${i.facts.profile}`).join("; ")}) and natal Authorities remain individual. Definition adds another question: do the groups of complete connections in each chart actually join when the charts are combined?`,
    "A defined Center and a connected network are different things. A complete Channel defines both endpoint Centers; Definition asks whether all those defined Centers connect through complete paths. More colored Centers can still leave separate islands.",
    "Read endpoint ownership and network consequence together: electromagnetic means each chart supplies a missing end, companionship means both already have the complete Channel. Neither category alone tells you whether a split is bridged; the full path decides that.",
    "Compare local classification with the global graph. A combined-only edge can join natal components, while another edge adds a route without changing component count. Keep sufficient witnesses distinct from necessary edges and retain counterexamples to a simple completion story.",
    "Track natal components through their composite mappings, then inspect exact endpoint support. Deduplicate repeated activations for Gate presence, but retain each contribution for provenance and retraction. A witness proves sufficiency; alternate routes and boundary eligibility constrain any further claim.",
  ];
  const vocabulary=p.terminology==="modern"?"Read networks as connected areas: this is about which complete pathways actually meet.":p.terminology==="traditional"?"Definition islands and Channel classification answer different questions: connectivity and ownership.":"Connected areas / Definition islands are two names for the same structure; neither is a measure of relationship quality.";
  const framing=p.style==="technical"?"Keep the local edge predicate separate from the global connected-component result.":p.style==="spiritual"?"As an optional contemplative practice, notice the distinction between connection and becoming the same; this is a reflection, not something measured by the chart.":p.style==="integrated"?"Use the chart comparison as a concrete starting point for reflection, keeping each person's own account separate from what the diagram shows.":"Start with what changes together, then check what each person still carries alone.";
  const opening = [topologySentence, `${joint.length} complete Channels need both charts; ${retained.length} already belong to at least one person. ${authoritySentence}`, lessons[stage]];
  const findings: ReaderChapter[] = [];
  const add = (topic: SemanticFinding["topic"], title: string, paragraphs: string[], predicates: string[], channelIds: string[], depth: "standard"|"deep" = "standard") => {
    const localSupports=[...new Set(formed.filter(r=>channelIds.includes(r.channelId)).flatMap(r=>r.endpoints.flatMap(e=>e.contributionIds)))];
    const facts = c.facts.mechanicsFacts.filter(f => predicates.includes(f.predicate) &&
      (f.predicate !== "channel-relation" || !channelIds.length || channelIds.includes((f.value as {channelId:string}).channelId)) &&
      (topic!=="activation"||f.predicate!=="activation-contribution"||f.supportingContributionIds.some(id=>localSupports.includes(id))));
    findings.push({ id: `r3:${contentHash([c.calculationId,topic])}`, kind:"calculated-explanation", publication:"structural-only", topic, title, paragraphs,
      factIds:facts.map(f=>f.id), contributionIds:topic==="activation"||topic==="routes"?localSupports:[...new Set(facts.flatMap(f=>f.supportingContributionIds))], channelIds, depth,
      countercondition:"Recalculate after a changed participant or endpoint. Withdraw any conclusion whose required fact is no longer present; a different valid route may preserve connectivity." });
  };
  const help = (keys: Parameters<typeof conceptGloss>[1][]) => keys.flatMap(key => { const t=conceptGloss(p,key);return t?[t.replace("compatibility score","relationship rating")]:[]; });
  const orientation = inputs.map(i => {
    const g=top.natalGraphs.find(g=>g.scope.personIds[0]===i.personId)!;
    const relevant=i.facts.channels.find(ch=>ch.centers.includes("Throat"))||i.facts.channels[0];
    return `${name(i.personId)} brings a ${i.facts.profile} ${i.facts.type} chart with ${i.facts.authority} Authority. Its Strategy is ${i.facts.strategy}. `+
      `${g.definedCenters.length} Centers are defined across ${g.componentCount} ${g.componentCount===1?"network":"separate networks"}${relevant?`, including natal ${channelRef(relevant.id)}`:"; there are no complete natal Channels"}. `+
      `${i.facts.hangingGates.length?`There are also ${i.facts.hangingGates.length} hanging Gates: active endpoints whose matching ends are absent in this natal chart.`:"There are no hanging Gates in this natal chart."}`;
  });
  add("orientation", "What each of you brings", [...orientation,...help(["typeStrategy","profile","centers"])], ["completed-natal-channel","definition-component","center-definition"], retained.map(r=>r.channelId));

  // Prefer a local link that participates in an issued join, without claiming that witness is unique.
  const expressionLink = joint.find(r=>r.centers.includes("Spleen")&&r.centers.includes("Throat"));
  const pivotal = expressionLink || joint.find(r=>top.actualJoins.some(j=>j.witness.edges.some(e=>e.channelId===r.channelId))) || joint[0];
  const jointText = pivotal ? `${channelRef(pivotal.channelId)} is one change that exists only with both charts. ${pivotal.endpoints.map(e=>`${e.personIds.map(name).join(" and ")} supplies ${gateRef(e.gate)}`).join("; ")}. Neither person carries this complete connection alone.` : "No complete Channel is created only by combining these charts. This reading therefore has no pair-created pathway to explain; it compares retained natal structures instead.";
  add("connection", "What changes when you come together", [jointText,topologySentence,
    top.combinedGraph.componentCount===0?"Neither chart nor the combined graph has a complete Channel or a defined network. There is no connected whole to claim, and no personal split to bridge.":top.combinedGraph.componentCount>1?`Even together, ${top.combinedGraph.componentCount} connected networks remain. A useful distinction is partial connection versus no connection: joining some areas is real, but describing the whole chart as unified would lose the remaining separation.`:
      "The combined graph is connected. That is a meaningful structural contrast with a pair that leaves separate networks, not evidence that every conversation or choice will feel easy.",...help(["definition","gates","channels"])],
    ["channel-relation","actual-island-join","island-effect","definition-component"], pivotal?[pivotal.channelId]:[]);
  const connectionChapter=findings.find(f=>f.topic==="connection")!;
  const example=pivotal?`For a concrete chart example, remove every activation of ${gateRef(pivotal.gates[0])} from the comparison: ${channelRef(pivotal.channelId)} then lacks an endpoint. Removing just one repeated activation may leave it complete. Neither change tells you the final network count until the remaining routes are checked.`:
    "For a concrete chart example, compare the charts separately with their union: if no matching pair of missing endpoints becomes complete, no new Channel is created. A relationship can matter without a new Channel appearing.";
  connectionChapter.paragraphs.push(p.teaching==="example"?example:p.teaching==="questions"?"Which connection depends on both contributions, and which was already present alone? Which named natal groups actually join? Use the chart-specific explanation above to distinguish a completed pathway from complete integration.":"Read the causal steps in order: activations supply Gate endpoints; both matching endpoints complete a Channel; complete Channels define their endpoint Centers; only a continuous path joins separate natal groups.",vocabulary,framing);

  const ownership = (r:ChannelRelationV1) => {
    const full=r.endpointStates.filter(e=>e.state===3).map(e=>name(e.personId));
    const partial=r.endpointStates.find(e=>e.role==="partial-holder");
    return r.classification==="companionship"?`You each already have ${channelRef(r.channelId)}. This is companionship: removing either person from the comparison leaves the other's complete natal pathway intact. It is a shared structure, not something one person supplies to the other.`:
      r.classification==="compromise"?`${full.join(" and ")} already carries complete ${channelRef(r.channelId)}, while ${name(partial!.personId)} brings only one endpoint. In Human Design this ownership pattern is called compromise. The full holder does not need the partial contribution for this Channel to exist; the partial holder does not acquire it permanently.`:
      `${full.join(" and ")} brings complete ${channelRef(r.channelId)}; the other chart has neither endpoint. Dominance is the classification of that contribution, not evidence of interpersonal control.`;
  };
  const contrastingHolders=roles.flatMap(id=>{const r=asymmetry.find(r=>r.fullOwnerIds.includes(id));return r?[r]:[];});
  const chosen = [...shared.slice(0,1),...[...new Map(contrastingHolders.map(r=>[r.channelId,r])).values()]];
  if(!chosen.length&&retained[0])chosen.push(retained[0]);
  add("contribution", "Shared does not always mean equal contribution", chosen.length?[
    ...chosen.map(ownership),
    asymmetry.length>1?`The complete-holder role ${new Set(asymmetry.flatMap(r=>r.fullOwnerIds)).size>1?"runs in both directions across different Channels":"is held by the same participant across the compromise Channels"}. Keep the direction of each contribution visible rather than turning the whole pair into one giver and one receiver.`:
      shared.length?"What is independently present in both people belongs in a different category from what appears only together. Similar chart structure does not establish identical preferences.":"Contribution describes this particular pathway, not the overall balance of effort between two people."
  ]:["All complete Channels in this pair require both charts. There is no natal-retained Channel to use as an example of full versus partial ownership; adding one would misrepresent these charts."], ["channel-relation","completed-natal-channel"],chosen.map(r=>r.channelId));

  add("autonomy", sameAuthority?"Similar decision labels, separate people":"Connection and decision-making are different questions", [authoritySentence,
    `${top.deltas.combinedOnlyCenterIds.length?`${top.deltas.combinedOnlyCenterIds.map(id=>CENTER_NAMES[id]+" Center").join(" and ")} becomes defined only in the pair. That temporary combined definition is not a new natal Authority.`:"No Center becomes defined only in this pair. New links between already-defined Centers can still change connectivity, as the network comparison shows."}`,
    "Use the combined chart to understand the structure being compared, and each natal chart to keep the person's own process in view. Whether either of you recognizes an emotional, communicative or intimate effect needs your accounts; the chart does not supply those experiences.",...help(["authority"])], ["center-definition","island-effect","completed-natal-channel"],[]);

  const witnessed=top.actualJoins[0];
  if(witnessed){
    const route=witnessed.witness.edges.map(e=>e.channelId);
    const alternatives=route.map(id=>{
      const groups=graphComponentsWithout(c,[id]);
      const targets=top.natalGraphs.find(g=>g.scope.personIds[0]===witnessed.personId)!.components.filter(g=>witnessed.targetNatalIslandIds.includes(g.id));
      const remains=groups.some(group=>targets.every(g=>g.centerIds.every(center=>group.includes(center))));
      return `${channelRef(id)} removed from the combined graph: ${remains?"the witnessed natal groups still connect through another complete route":"this witnessed join no longer survives that single-edge removal"}`;
    });
    add("routes", "A connection can have more than one route", [
      `One sufficient path for ${name(witnessed.personId)} runs through ${route.map(channelRef).join(" then ")}. It connects the specific natal groups in that witness, not automatically every separate group.`,
      ...alternatives,
      "These are edge-removal comparisons of the calculated graph, not hypothetical new birth charts. They explain why a striking local Channel must be considered alongside the rest of the configuration: losing a route and losing a connection are not always the same event."
    ],["actual-island-join","definition-component","island-effect","channel-relation"],route,"deep");
  }
  const activationLink=expressionLink||joint.find(r=>r.endpoints.some(e=>e.contributionIds.length>1))||joint[0];
  const activationIds=activationLink?activationLink.endpoints.flatMap(e=>e.contributionIds):[];
  if(activationLink){
    const contributions=c.facts.contributions.filter(a=>activationIds.includes(a.id));
    const repeated=activationLink.endpoints.filter(e=>e.contributionIds.length>1);
    add("activation", "One pathway, several exact contributions", [
      `${channelRef(activationLink.channelId)} links these exact activations: ${contributions.map(a=>`${name(a.personId)}'s ${a.side==="design"?"Design":"Personality"} ${a.planet}, ${gateRef(a.gate,!a.boundaryRisk&&a.uncertaintyRef.eligibility==="exact-point"?a.line:undefined)}${a.boundaryRisk||a.uncertaintyRef.eligibility!=="exact-point"?" (exact Line uncertain)":""}`).join("; ")}.`,
      repeated.length?`${repeated.map(e=>gateRef(e.gate)).join(" and ")} has repeated support. Removing one activation does not erase an endpoint while another valid activation of that Gate remains. Remove the last necessary endpoint and the Channel retracts; connectivity must then be checked again.`:
        "Each endpoint needs at least one valid activation. The exact activation tells you where the contribution comes from; it does not establish a stronger connection merely because a named planet supplies it.",
      `Compare this local dependency with the whole-chart conclusion: ${topologySentence} An activation-level change can remove a Channel without undoing a network join when an alternate path survives.`
    ],["activation-contribution","channel-relation","actual-island-join"],[activationLink.channelId],"deep");
  }
  const primaryInterest=p.interests[0]||"";
  const order=/communicat/i.test(primaryInterest)?["connection","autonomy","orientation","contribution"]:
    /long.term|cohabit|mutual care/i.test(primaryInterest)?["contribution","autonomy","orientation","connection"]:
    /friend|teamwork|ordinary/i.test(primaryInterest)?["orientation","contribution","connection","autonomy"]:["orientation","connection","contribution","autonomy"];
  const chapters=findings.filter(f=>f.depth==="standard").sort((a,b)=>order.indexOf(a.topic)-order.indexOf(b.topic));
  if(p.depth==="deep")chapters.push(...findings.filter(f=>f.depth==="deep"));
  return {version:"R3-1.0.0",headline,takeaway,opening,chapters:p.depth==="quick"?[]:chapters,
    findingIds:findings.filter(f=>p.depth==="deep"||f.depth==="standard").map(f=>f.id),explanationStage:stage,
    contextActivationIds:activationIds,unavailable:["Friendship","Intimacy","Long-term","Communication","Emotional timing","Reciprocity and resentment"].map(topic=>({topic,reason:"No publication-approved pair-specific interpretation is available for this lens. The structural reading is available; personal experience is not inferred."}))};
}
