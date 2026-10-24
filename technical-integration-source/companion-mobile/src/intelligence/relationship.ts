import { byId, gates, runtime, centerId } from "../content/records";
import { inferenceDisposition } from "../content/inference-policy";
import { CENTER_NAMES } from "../domain/contracts";
import { mechanicsTraceFor } from "../domain/composite";
import { contentHash, canonicalJson } from "../domain/composite-hash";
import type { CompositeCalculationV1, CompositeContributionV1, MechanicsFactV1, StructureGraphV1 } from "../domain/composite-contracts";
import type { CompositeSelection } from "../ui/composite-workspace-model";
import type { RelationshipClaimV1, RelationshipReportV1, ReportRequestV1, RelationshipContext, RelationshipIntent, RelationshipReadingEntryV1 } from "./relationship-contracts";
export type * from "./relationship-contracts";

export const RELATIONSHIP_RULE_VERSION="CM04a-1.0.0" as const;
const contexts=["general","friendship","romantic"];
const modes=["Combined","Person A","Person B","Difference"];
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const unique=<T>(x:T[])=>[...new Set(x)];
const references=(c:CompositeCalculationV1)=>c.inputs.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash}));
const gateLabel=(n:number)=>`Gate ${n} (${CENTER_NAMES[centerId(gates.get(n)!.center)]})`;
const channelLabel=(id:string)=>{const row=runtime.channels.find(c=>c.id===id)!;return `${row.gates.map(gateLabel).join(" – ")} · ${row.name}`;};
const role=(id:string,q:ReportRequestV1)=>id===q.roles[0]?"Person A":"Person B";
const contributionLabel=(c:CompositeContributionV1,q:ReportRequestV1)=>`${role(c.personId,q)} · ${c.planet} · ${c.gate}.${c.line} (${CENTER_NAMES[c.center]}) · ${c.side==="design"?"Design":"Personality"}`;
const boundary="Chart structure does not establish attraction, consent, compatibility, health or a relationship outcome.";
const inputKinds:Record<CompositeSelection["kind"],string[]>={overview:["kind"],activation:["kind","id"],gate:["kind","gate"],channel:["kind","id"],center:["kind","id"],component:["kind","id","graphId"],motor:["kind","graphId","motor"],witness:["kind","id","personId"]};

export function relationshipRequest(c:CompositeCalculationV1, options:Pick<ReportRequestV1,"roles"|"mode"|"scope"|"context"|"selection"> & Partial<Pick<ReportRequestV1,"question"|"observation"|"requestedAt">>):ReportRequestV1 {
  const question=options.question||"";
  const intent:RelationshipIntent=/differ|each person|revers|asymmetr/i.test(question)?"differences":/observ|test|disconfirm/i.test(question)?"observe":"explain";
  return {schema:"ReportRequestV1",relationshipId:c.relationshipId,calculationId:c.calculationId,factsHash:c.factsHash,inputRefs:references(c),catalogSHA256:c.pins.catalogSHA256,canonicalSHA256:c.pins.canonicalSHA256,ruleVersion:RELATIONSHIP_RULE_VERSION,
    roles:[...options.roles],mode:options.mode,scope:options.scope,context:options.context,selection:copy(options.selection),question,intent,observation:options.observation?copy(options.observation):null,requestedAt:options.requestedAt||null};
}
function validateRequest(c:CompositeCalculationV1,q:ReportRequestV1) {
  mechanicsTraceFor(c,c.facts.mechanicsFacts[0]?.id); // issued calculation guard; JSON/hash resemblance is insufficient
  if(!q||q.schema!=="ReportRequestV1"||q.calculationId!==c.calculationId||q.relationshipId!==c.relationshipId||q.factsHash!==c.factsHash||canonicalJson(q.inputRefs)!==canonicalJson(references(c))||q.catalogSHA256!==c.pins.catalogSHA256||q.canonicalSHA256!==c.pins.canonicalSHA256||q.ruleVersion!==RELATIONSHIP_RULE_VERSION)throw Error("Reading context or calculation/source/rule revision no longer matches.");
  if(!Array.isArray(q.roles)||q.roles.length!==2||q.roles[0]===q.roles[1]||canonicalJson([...q.roles].sort())!==canonicalJson([...c.facts.participantIds].sort()))throw Error("Reading participants do not match this relationship.");
  if(!modes.includes(q.mode)||!contexts.includes(q.context))throw Error("Unsupported reading context.");
  if(q.scope.includes("Transit"))throw Error("Transit readings are unavailable; no temporary result is fabricated.");
  if(q.scope!==(q.mode==="Person A"?"A":q.mode==="Person B"?"B":"A+B"))throw Error("Reading scope does not match the displayed graph.");
  if(typeof q.question!=="string"||q.question.length>600)throw Error("Ask a local question of at most 600 characters.");
  if(q.observation&&(q.observation.consented!==true||typeof q.observation.text!=="string"||!q.observation.text.trim()||q.observation.text.length>600||Object.keys(q.observation).length!==2))throw Error("An observation requires explicit consent and 1–600 characters.");
  if(q.requestedAt!==null&&(typeof q.requestedAt!=="string"||!Number.isFinite(Date.parse(q.requestedAt))))throw Error("Invalid request timestamp.");
  const keys=inputKinds[q.selection?.kind];
  if(!keys||canonicalJson(Object.keys(q.selection).sort())!==canonicalJson([...keys].sort()))throw Error("Unsupported selected mechanic.");
  if(canonicalJson(q)!==canonicalJson(relationshipRequest(c,q)))throw Error("Request contains unsupported fields or intent.");
  if(q.question.trim()&&(/percent|score|soulmate|will we|predict|destin|guarantee|\bsex\b|sexual|sludge|transit|penta|diagnos|heal|trauma|birth.*(?:range|unknown)/i.test(q.question)))throw Error("That request needs unsupported prediction, advanced interpretation, uncertainty or transit work. CM-04a provides scoped mechanics and reflection questions only.");
  if(q.question.trim()&&!/explain|differ|each person|observ|why|friendship|romantic|relationship|gate|channel|center|definition/i.test(q.question))throw Error("Local Ask supports explanations, person-specific differences and observation questions. Broader free-form interpretation is unavailable.");
}
function evidenceFor(c:CompositeCalculationV1,q:ReportRequestV1) {
  validateRequest(c,q);
  const ids=q.scope==="A+B"?q.roles:[q.roles[q.scope==="A"?0:1]],individual=ids.length===1;
  const graph=individual?c.facts.topology.natalGraphs.find(g=>g.scope.personIds[0]===ids[0])!:c.facts.topology.combinedGraph;
  const visible=c.facts.contributions.filter(x=>ids.includes(x.personId));
  const activationFacts=(records:CompositeContributionV1[])=>c.facts.mechanicsFacts.filter(f=>f.predicate==="activation-contribution"&&records.some(x=>f.supportingContributionIds.includes(x.id)));
  let support=visible, facts:MechanicsFactV1[]=activationFacts(visible), description="";
  const s=q.selection;
  if(s.kind==="activation") {
    support=visible.filter(x=>x.id===s.id);if(support.length!==1)throw Error("Exact activation is outside this person or pinned revision.");facts=activationFacts(support);
    description=`${contributionLabel(support[0],q)} is one exact activation. Repeated Gate.Line records remain separate.`;
  } else if(s.kind==="gate") {
    if(!Number.isInteger(s.gate)||!gates.has(s.gate))throw Error("Unknown Gate reference.");
    support=visible.filter(x=>x.gate===s.gate);facts=support.length?activationFacts(support):facts;
    description=`${gateLabel(s.gate)} is ${graph.gates.includes(s.gate)?"active":"reference-only"} in this scoped graph. ${support.length} exact planetary contribution(s) supply it.`;
  } else if(s.kind==="channel") {
    const row=c.facts.channelRelations.find(x=>x.channelId===s.id);if(!row)throw Error("Unknown Channel reference.");
    support=visible.filter(x=>row.gates.includes(x.gate));
    const found=c.facts.mechanicsFacts.filter(f=>individual?f.predicate==="completed-natal-channel"&&(f.value as {graphId?:string;channelId?:string}).graphId===graph.id&&(f.value as {channelId?:string}).channelId===s.id:f.predicate==="channel-relation"&&(f.value as {channelId?:string}).channelId===s.id);
    facts=found.length?found:activationFacts(visible);
    const complete=graph.edges.some(x=>x.channelId===s.id);
    description=`${channelLabel(s.id)} is ${complete?"complete":"incomplete"} in ${individual?role(ids[0],q)+"'s natal":"the A+B"} graph.${!individual&&row.formed?` Its permanent relationship classification is ${row.classification}; ${row.endpointStates.map(x=>`${role(x.personId,q)} ${x.role}`).join(" / ")}.`:""}`;
  } else if(s.kind==="center") {
    if(!Object.prototype.hasOwnProperty.call(CENTER_NAMES,s.id))throw Error("Unknown Center reference.");
    support=visible.filter(x=>x.center===s.id);
    description=`${CENTER_NAMES[s.id]} is ${graph.definedCenters.includes(s.id)?"defined through complete Channels":support.length?"undefined with active Gates":"completely open: undefined with no active Gates"} in this graph. Gate activity and Center definition are different facts.`;
  } else if(s.kind==="component") {
    const island=graph.components.find(x=>x.id===s.id);if(s.graphId!==graph.id||!island)throw Error("Definition island is outside the selected graph/revision.");
    support=visible.filter(x=>graph.edges.some(e=>e.centers.every(n=>island.centerIds.includes(n))&&e.gates.includes(x.gate)));
    facts=c.facts.mechanicsFacts.filter(f=>f.predicate==="definition-component"&&(f.value as {id?:string}).id===island.id);
    description=`This definition island connects ${island.centerIds.map(x=>CENTER_NAMES[x]).join(" + ")} through actual complete Channels. It does not prove psychological integration or needing another person.`;
  } else if(s.kind==="witness"||s.kind==="motor") {
    const join=s.kind==="witness"?c.facts.topology.actualJoins.find(x=>x.witness.id===s.id&&x.personId===s.personId):null;
    const motor=s.kind==="motor"?c.facts.topology.motorRoutes.find(x=>x.graphId===graph.id&&x.motor===s.motor):null;
    if(s.kind==="witness"&&(individual||!join))throw Error("Actual relationship joins require the A+B context.");
    if(s.kind==="motor"&&(s.graphId!==graph.id||!motor))throw Error("Motor route is outside this graph/revision.");
    const witness=join?.witness||motor?.witness;
    const contributing=new Set(witness?.edges.flatMap(e=>e.endpoints.flatMap(x=>x.contributionIds))||[]);support=visible.filter(x=>contributing.has(x.id));
    facts=c.facts.mechanicsFacts.filter(f=>join?f.predicate==="actual-island-join"&&(f.value as {witness?:{id:string}}).witness?.id===join.witness.id:f.predicate==="motor-to-throat"&&(f.value as {graphId?:string;motor?:string}).graphId===graph.id&&(f.value as {motor?:string}).motor===(s.kind==="motor"?s.motor:""));
    description=witness?`${join?role(join.personId,q)+"'s natal islands join":"A motor reaches Throat"} through ${witness.edges.map(e=>channelLabel(e.channelId)).join(" → ")}. This is one sufficient complete path, not a unique or necessary route.`:"This motor has no complete path to Throat in the scoped graph. No speech or Authority prediction follows.";
  } else {
    const first=!individual?c.facts.topology.actualJoins[0]:null;
    description=first?`${role(first.personId,q)} has an actual natal-island join in this pair: ${first.witness.centers.map(x=>CENTER_NAMES[x]).join(" → ")}. A join can use already complete partner Channels and need not be a new electromagnetic connection.`:`${individual?role(ids[0],q)+"'s pinned natal graph":"The pinned A+B graph"} has ${graph.edges.length} complete Channels, ${graph.definedCenters.length} defined Centers and ${graph.componentCount} definition islands. Defined Center count is not connectivity.`;
  }
  // Negative structural findings depend on the full validated scoped inventory;
  // actual selected suppliers stay separate from those calculation dependencies.
  if(!facts.length)facts=activationFacts(visible);
  for(const fact of facts) {
    const trace=mechanicsTraceFor(c,fact.id,{calculationId:q.calculationId});
    if(individual&&trace.contributions.some(x=>x.personId!==ids[0]))throw Error("A foreign participant cannot supply an individual reading.");
  }
  for(const match of q.question.matchAll(/\bgate\s+(\d{1,2})(?:\.(\d))?/gi)) {
    if(!support.some(x=>x.gate===+match[1]&&(!match[2]||x.line===+match[2])))throw Error("Requested Gate/Line is not an actual contribution in the selected reading. Choose that exact mechanic first.");
  }
  for(const match of q.question.matchAll(/\bchannel\s+(\d{1,2})\s*[–-]\s*(\d{1,2})/gi)) {
    if(s.kind!=="channel"||!runtime.channels.some(x=>x.id===s.id&&x.gates.includes(+match[1])&&x.gates.includes(+match[2])&&match[1]!==match[2]))throw Error("Requested Channel does not match the selected reference.");
  }
  const sourceIds=unique([...(s.kind==="channel"?[s.id]:[]),...support.map(x=>`gate-${String(x.gate).padStart(2,"0")}-line-${x.line}`)]);
  return {ids,individual,graph,support,facts,description,sourceIds};
}

export function relationshipReport(c:CompositeCalculationV1,q:ReportRequestV1):RelationshipReportV1 {
  const id=`relationship-report:${contentHash(q)}`;
  const base={schema:"RelationshipReportV1" as const,id,revisionId:id,parentRevisionId:null,request:copy(q),nonclaims:[boundary,"Local authored rules and questions, not a live AI or validated behavioral prediction.","CM-04b's 13-lens/four-pathway/nine-part synthesis is not implemented."],sourceInterpretation:"withheld-no-vetted-pair-rule" as const,advancedReport:"not-implemented" as const};
  try {
    const e=evidenceFor(c,q),claims:RelationshipClaimV1[]=[];
    const add=(key:string,kind:RelationshipClaimV1["kind"],text:string,subjects=e.ids,facts=e.facts,contributions=e.support)=>claims.push({id:`${id}:${key}`,kind,status:kind==="canonicalInterpretation"?"insufficientEvidence":"supported",text,subjectPersonIds:[...subjects],scope:q.scope,factIds:facts.map(x=>x.id),supportingContributionIds:contributions.map(x=>x.id),sourceRecordIds:kind==="canonicalInterpretation"?e.sourceIds:[],ruleVersion:RELATIONSHIP_RULE_VERSION,alternatives:kind==="derivedHypothesis"?["The same pattern may occur alone or with other people; circumstances and agreed preferences may explain it."]:[],nonclaims:[boundary,kind==="derivedHypothesis"?"A reflection question, not an inferred feeling or chart-caused behavior.":"Natal Authority, Type and Profile remain individual; no combined identity is created."]});
    add("mechanics","deterministicFact",e.description);
    for(const personId of e.ids) {
      const input=c.inputs.find(x=>x.personId===personId)!,natal=c.facts.topology.natalGraphs.find(x=>x.scope.personIds[0]===personId)!;
      const rows=c.facts.mechanicsFacts.filter(f=>f.predicate==="activation-contribution"&&f.subjectPersonIds.includes(personId));
      const delta=c.facts.topology.deltas.perPerson.find(x=>x.personId===personId)!,islands=c.facts.topology.islandEffects.find(x=>x.personId===personId)!;
      const own=c.facts.contributions.filter(x=>x.personId===personId);
      add(`natal:${personId}`,"deterministicFact",`${role(personId,q)} retains natal ${input.facts.type}, ${input.facts.authority} Authority and Profile ${input.facts.profile}; ${natal.componentCount} natal island(s). This identity comes from this person's pinned chart, not the partner.`,[personId],rows,own);
      if(!e.individual)add(`direction:${personId}`,"deterministicFact",`For ${role(personId,q)}, relative to the natal graph, A+B adds ${delta.addedChannelIds.length} Channel(s) and ${delta.addedCenterIds.map(x=>CENTER_NAMES[x]).join(", ")||"no Centers"}; natal-island effect: ${islands.status}. This is pair-context topology, not this person's natal identity or an inferred experience.`,[personId],c.facts.mechanicsFacts.filter(f=>f.predicate==="activation-contribution"),c.facts.contributions);
    }
    const exact=e.support.slice(0,3).map(x=>contributionLabel(x,q)).join("; ");
    const focus=q.context==="friendship"?"In everyday friendship, which shared activities feel welcome and which need space?":q.context==="romantic"?"In a romantic relationship, what expectations, pacing and independent choices have both people actually agreed to?":"In this relationship, what do both people notice when together compared with apart?";
    add("reflection","derivedHypothesis",e.support.length?`${focus} Use the actual contribution${e.support.length===1?"":"s"} (${exact}${e.support.length>3?"; remaining records in evidence below":""}) as discussion context, not as a predicted trait. Compare each person's account separately.`:"This reference has no actual supplier in the selected scope. Choose active mechanics before drawing a person-specific reflection.");
    add("disconfirmation","derivedHypothesis","Disconfirmation: if the proposed experience is absent, differs between the two accounts, or occurs just as often apart, that weakens a pair-specific interpretation. Do not explain disagreement away with the chart.");
    add("canonical","canonicalInterpretation","Sourced relationship interpretation is withheld: this corpus supplies reference context but no vetted pair-specific rule for this reading. Exact Line/planet labels do not validate a personal or behavioral interpretation.");
    if(q.observation)add("observation","userReportedExperience",q.observation.text,e.ids,[],[]);
    const allSupports=new Set(claims.flatMap(x=>x.supportingContributionIds));
    const evidence={schema:"ReportEvidencePacketV1" as const,id:`relationship-evidence:${contentHash({request:q,factIds:e.facts.map(x=>x.id)})}`,calculationId:c.calculationId,factsHash:c.factsHash,pins:copy(c.pins),scope:q.scope,graphIds:unique([e.graph.id,...c.facts.topology.natalGraphs.filter(g=>e.ids.includes(g.scope.personIds[0])).map(g=>g.id)]),inputRefs:references(c),factIds:unique(claims.flatMap(x=>x.factIds)),contributions:copy(c.facts.contributions.filter(x=>allSupports.has(x.id))),sources:e.sourceIds.map(id=>{const d=inferenceDisposition(id);return {id,title:byId.get(id)?.title||"Unavailable reference",status:d.allowed?"reference-only" as const:"quarantined" as const,reason:d.allowed?"Existing reference only; source authenticity/commercial rights unresolved and no vetted pair rule supplied.":d.reason};}),rights:"private-internal-evaluation-only" as const,ruleVersion:RELATIONSHIP_RULE_VERSION};
    return {...base,status:"ready",reason:null,eligibility:c.facts.eligibility,evidence,claims};
  } catch(error) {return {...base,status:"unsupported",reason:(error as Error).message,eligibility:null,evidence:null,claims:[]};}
}
export function validateRelationshipReport(c:CompositeCalculationV1,report:RelationshipReportV1):RelationshipReportV1 {
  const expected=relationshipReport(c,report.request);
  if(expected.status!=="ready"||canonicalJson(expected)!==canonicalJson(report))throw Error("Relationship claims are unsupported, altered or outside their pinned evidence.");
  return expected;
}
export function relationshipClaimTrace(c:CompositeCalculationV1,report:RelationshipReportV1,claimId:string) {
  validateRelationshipReport(c,report);const claim=report.claims.find(x=>x.id===claimId);if(!claim)throw Error("Claim is outside this reading.");
  return {claim,calculationInputs:references(c),facts:claim.factIds.map(id=>mechanicsTraceFor(c,id,{calculationId:c.calculationId}).fact),supportingContributions:c.facts.contributions.filter(x=>claim.supportingContributionIds.includes(x.id)),sources:report.evidence!.sources.filter(x=>claim.sourceRecordIds.includes(x.id))};
}
export function readingEntry(c:CompositeCalculationV1,request:ReportRequestV1):RelationshipReadingEntryV1 {
  validateRelationshipReport(c,relationshipReport(c,request));if(!request.requestedAt)throw Error("Stored requests require an actual request timestamp.");
  return {schema:"RelationshipReadingEntryV1",id:`relationship-request:${contentHash(request)}`,request:copy(request)};
}
export function validateStoredReadingEntry(entry:RelationshipReadingEntryV1) {
  const q=entry?.request;
  if(!entry||entry.schema!=="RelationshipReadingEntryV1"||Object.keys(entry).length!==3||!q||q.schema!=="ReportRequestV1"||!q.requestedAt||!Number.isFinite(Date.parse(q.requestedAt))||entry.id!==`relationship-request:${contentHash(q)}`)throw Error("Invalid stored relationship request.");
  const fields=["schema","relationshipId","calculationId","factsHash","inputRefs","catalogSHA256","canonicalSHA256","ruleVersion","roles","mode","scope","context","selection","question","intent","observation","requestedAt"];
  if(canonicalJson(Object.keys(q).sort())!==canonicalJson(fields.sort())||!modes.includes(q.mode)||!contexts.includes(q.context)||!Array.isArray(q.roles)||q.roles.length!==2||q.roles[0]===q.roles[1]||!q.roles.every(x=>typeof x==="string")||!Array.isArray(q.inputRefs)||q.inputRefs.length!==2||q.inputRefs.some(x=>!x||Object.keys(x).length!==3||[x.personId,x.chartVersionId,x.snapshotHash].some(y=>typeof y!=="string"||!y))||!["A","B","A+B"].includes(q.scope)||typeof q.ruleVersion!=="string"||q.ruleVersion.length>40||typeof q.question!=="string"||q.question.length>600||!["explain","differences","observe"].includes(q.intent))throw Error("Invalid stored reading envelope.");
  const keys=inputKinds[q.selection?.kind];if(!keys||canonicalJson(Object.keys(q.selection).sort())!==canonicalJson([...keys].sort()))throw Error("Invalid stored selection.");
  if(q.observation&&(q.observation.consented!==true||Object.keys(q.observation).length!==2||typeof q.observation.text!=="string"||!q.observation.text.trim()||q.observation.text.length>600))throw Error("Invalid stored observation consent.");
}
