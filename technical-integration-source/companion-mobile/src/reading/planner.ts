import {meaningUtilization} from './meaning-utilization';
import {selectRelationalThemes,type DiscoverySelectionDecision} from './meaning-relations';
import {composeArgumentInsights} from './argument-composer';
import {discoverRelationalInsights,type RelationalDiscoveryTrace} from './relational-discovery';
import {repeatedGateWitness} from './repeated-gate';
import { servedEvidence } from './served-evidence';
import { contentHash } from "../domain/composite-hash";
import { deriveStructure } from "../domain/calculator";
import { CENTER_NAMES, type CenterId } from "../domain/contracts";
import type { ParticipantSnapshotV1, CompositeCalculationV1 } from "../domain/composite-contracts";
import { gates, centerId, gateId } from "../content/records";
import { validateReaderPreferences, type ReaderPreferencesV1 } from "../intelligence/reader-preferences";
import type { MeaningUnit, MeaningVariant, SourceField, ReadingChartIndex, IndexedActivation, IndexedChannel, ReadingUse, DesignPreviewCapability } from "./contracts";
import { readingCatalogueHash, getMeaningUnit } from "./catalog";
import { buildNatalChartIndex, buildCompositeChartIndex, assertReadingChartIndex } from "./chart-index";
import { resolveMeaningEligibility, isDesignPreviewScope } from "./eligibility";
import { freezeReadingValue } from "./compiler";
import { discoverReadingPatterns, type ReadingPatternCandidate } from "./discovery";
import { makeClaim, makeInsight, makeRule, readingFail, unique, sourceIdentity, novelRelationshipKeys, selectNovelDeepInsights, validateClaimDependencies, type ReadingClaim, type ReadingInsight, type ReadingSelection, type ReadingDepth, type ClaimSource, type ClaimScope, type ReadingRule, type SupportRoute } from "./insights";
import { insightChapterTitle, realizeReading, validateRealizedParagraphs, sanitizeReadingProse, normalizeReadingPunctuation, READING_NOTICE_TEXT, type ReadingParagraph, type ReadingChapter } from "./realization";

export type { ReadingSelection } from "./insights";
export type ReadingInput={composition?:'argument-proof-v1'|'relational-discovery-v1';index?:ReadingChartIndex;issuedSnapshot?:ParticipantSnapshotV1;composite?:CompositeCalculationV1;preferences:ReaderPreferencesV1;depth?:ReadingDepth;disclosure?:"compact"|"expanded"|"full";view?:"natal"|"combined"|"person-a"|"person-b"|"difference";selection?:ReadingSelection;question?:string;use:ReadingUse;capability?:DesignPreviewCapability;variantId?:MeaningVariant;inputAssurance?:"recorded-exact-minute-not-independently-verified"};
export type SectionCoverage={sectionId:string;title:string;semanticStatus:"supported"|"partial"|"insufficientEvidence"|"notRequested"|"notApplicable";extent:"partial-section"|"selected-object-only";disposition:"in-primary"|"reference-only"|"unavailable"|"not-applicable";insightIds:string[];reasonCodes:string[];authority:"confirmed-contract"|"preserved-proposal"};
export type ReadingPlan={discoverySelection?:DiscoverySelectionDecision[];schema:"AuricReadingPlanV1";planId:string;requestDigest:string;context:"natal"|"composite";view:string;indexHash:string;contentReleaseHash:string;policyHash:string;audience:"design-demonstration";requestedDepth:ReadingDepth;servedDepth:ReadingDepth;depthStatus:"satisfied"|"insufficient-supported-depth"|"withheld";insights:ReadingInsight[];chapters:ReadingChapter[];coverage:SectionCoverage[];depthDelta:{againstPlanId:string|null;newInsightIds:string[];omittedInsightIds:string[];repeatedInsightIds:string[];repetitionReasons:Record<string,string>};claimIds:string[];semanticApproval:"design-only";semanticNoveltyStatus:"requires-human-review"};
export type SafeEvidence={recordId:string;variantId:string;fieldKey:string;sourceIds:string[];granularity:string;status:"design-only";limitations:string[]};
export type ContextInfo={target:ReadingSelection;requestDigest:string;meaning:{text:string;claimIds:string[]}[];inThisChart:{text:string;claimIds:string[]}[];evidence:SafeEvidence[];unavailableReasonCodes:string[]};
export type ReadingEngineResult={schema:"AuricReadingEngineResultV1";status:"design-only"|"withheld";proseEvidencePacket:ReturnType<typeof servedEvidence>;plan:ReadingPlan;claims:ReadingClaim[];paragraphs:ReadingParagraph[];contextualInfo:ContextInfo[];evidence:SafeEvidence[];index:ReadingChartIndex;notices:{code:string;text:string}[];trace:{repeatedGateWitnesses:ReturnType<typeof repeatedGateWitness>[];factIds:string[];activationIds:string[];sourceToClaims:{sourceIdentity:string;recordId:string;fieldKey:string;claimIds:string[]}[];claimToParagraphs:{claimId:string;paragraphIds:string[]}[];rules:ReadingRule[];sourceDisagreements:{recordId:string;variantId:string;fieldKeys:string[]}[];candidateInsights:ReadingInsight[];meaningPackets:{recordId:string;variantId:string;rawRecordHash:string;selectionLedger:{fieldKey:string;ref:unknown;disposition:"required"|"included-context"|"deferred";reason:string}[]}[];uncertainty:{activationId:string;lineStatus:string}[]};integrityHash:string};
const POLICY_HASH=contentHash({schema:"ReadingDesignPolicyV1",use:"isolated-design-preview",consumerEligible:false,modifierCorpora:[],approval:"not-issued",rules:"reading-design-rules-1"});
import { excludedReadingField as excludedField } from './source-policy';
import { selectP1FactIds } from './p1-adapter';
const INDIVIDUAL=["Your Chart in One View","How You Are Designed to Engage with Life","Your Decision-Making Authority","Your Profile","Defined Centers: Stable Functions","Undefined vs Completely Open Centers","Definition Islands & Internal Topology","Defined Channel Portraits","Gate & Harmonic Architecture","Hanging Gates / Dormant Completion Paths","Planetary/Personality/Design Architecture","Incarnation Cross & Life Theme","Main Themes & Contradictions","Coherent / Distorted Expression and Integration"];
const COMPOSITE=["Verified natal foundations","Each person's original auric architecture","Exact composite construction","Bidirectional lived-mechanics hypotheses","Completion, bridges, integration and persistence","Conscious versus unconscious contributions","Intimate/embodied mechanics","Four feedback/friction pathways","Thirteen distinct evaluation dimensions","Optional ITE/energetic healing lens","Nine-part integrated synthesis and behavioral tests"];
const LENSES=["Friendship compatibility","Sexual attraction and chemistry","Sexual sustainability","Romantic bonding","Long-term partnership","Intellectual resonance","Communication reliability","Emotional compatibility","Energetic pacing","Autonomy","Mutual support and reciprocity","Possible resentment/friction pathways","Calm, ordinary coexistence"];
const PATHWAYS=["Mental-expression backlog","Emotional-contract backlog","Caretaking/responsibility backlog","Sacral/autonomy backlog"];
const PATH_FIELDS=["Potential initiating conditions","Relevant verified Gates, Channels and Centers","Possible observable manifestations","Hypothesized maintaining loop","Possible interruption or repair behaviors","Disconfirming observations or alternative explanations"];
const SYNTHESIS=["Non-obvious dominant structural finding","Possible attraction mechanisms","Long-term mechanics and prerequisites","Emotion/thought friction hypotheses","Most consequential candidate feedback loop","What each person uniquely contributes","What changes when they are apart","Friendship/romance/intimacy/practical contexts","Observations and ordinary alternatives"];
const participantLabel=(index:ReadingChartIndex,id:string)=>index.participants.find(p=>p.personId===id)!.birth.name;
const gateCenter=(g:number)=>centerId(gates.get(g)!.center);
export const readingGateLabel=(g:number,line?:number|null)=>`Gate ${g}${line?`.${line}`:""} (${CENTER_NAMES[gateCenter(g)]} Center)`;
const channelLabel=(c:IndexedChannel)=>`Channel ${c.gates.join("–")} (${c.centers.map(x=>CENTER_NAMES[x]).join(" ↔ ")})`;
const cleanSentence=(s:string)=>s.trim().replace(/\s+$/u,"");
function sourceWords(text:string):string{
  return sanitizeReadingProse(cleanSentence(text)).replace(/\bGate\s+(\d{1,2})(?:\.(\d))?(?!\d|\s*\()/g,(_all,g,l)=>readingGateLabel(Number(g),l?Number(l):null));
}
function field(unit:MeaningUnit,pattern:RegExp):SourceField|undefined{return unit.fields.find(f=>f.purpose==="meaning"&&typeof f.value==="string"&&f.value.trim()&&pattern.test(f.fieldKey)&&!excludedField(unit,f.fieldKey)&&!(unit.kind==="exact-line"&&(f.shared||f.ref.granularity!=="exact-line")));}
function kernel(unit:MeaningUnit):SourceField|undefined{return field(unit,/(^|\.)(mechanical_kernel|mechanical_core|kernel|gate_synthesis)$/i)||field(unit,/(mechanic|kernel|gate_synthesis)/i);}
function safeEvidence(source:ClaimSource):SafeEvidence{const ref=source.ref as {sourceIds?:string[];granularity?:string};return {recordId:source.recordId,variantId:source.variantId,fieldKey:source.fieldKey,sourceIds:ref.sourceIds||[],granularity:ref.granularity||"unresolved",status:"design-only",limitations:["Symbolic source meaning; not evidence of observed behavior.","Source authenticity, owner selection, reuse rights and inference review remain open."]};}
function indexFor(input:ReadingInput):ReadingChartIndex{
  if([input.index,input.issuedSnapshot,input.composite].filter(Boolean).length!==1)readingFail("REQUEST_CONTEXT_MISMATCH","Select exactly one pinned chart or pair context.");
  let index=input.index||(input.issuedSnapshot?buildNatalChartIndex(input.issuedSnapshot):buildCompositeChartIndex(input.composite!));
  assertReadingChartIndex(index);
  if(input.view==="person-a"||input.view==="person-b"){
    if(index.context!=="composite")readingFail("REQUEST_CONTEXT_MISMATCH","A participant view requires a two-person context.");
    const id=index.composite!.displayParticipantIds[input.view==="person-a"?0:1];
    index=buildNatalChartIndex(index.participants.find(p=>p.personId===id)!);
  }
  if(input.view==="difference"&&index.context!=="composite")readingFail("REQUEST_CONTEXT_MISMATCH","A contribution comparison requires two people.");
  return index;
}
function addFoundations(graph:ReturnType<typeof buildGraph>,index:ReadingChartIndex,input:ReadingInput):void{
  const scope:ClaimScope={context:index.context,personIds:index.participants.map(p=>p.personId),chartRevisionIds:index.participants.map(p=>p.chartVersionId),worldIds:[`point:${index.indexHash}`]};
  const foundationFacts=index.facts.filter(f=>f.predicate==="natal-classification"||f.predicate==="center-state"||f.predicate==="definition-component").map(f=>f.id);
  const text=index.participants.map(p=>{const label=index.context==="natal"?"Your":`${participantLabel(index,p.personId)}'s`,defined=p.facts.centers.filter(c=>c.defined).map(c=>`${CENTER_NAMES[c.id]} Center`),open=index.centers.filter(c=>c.personId===p.personId&&c.state==="completely-open").map(c=>`${CENTER_NAMES[c.centerId]} Center`),activeUndefined=index.centers.filter(c=>c.personId===p.personId&&c.state==="undefined-with-activation").map(c=>`${CENTER_NAMES[c.centerId]} Center`);return `${label} calculated natal foundation is ${p.facts.type}, with ${p.facts.strategy} Strategy, ${p.facts.authority} Authority and ${p.facts.profile} Profile. There ${p.facts.definitionIslands.length===1?"is 1 connected network":`are ${p.facts.definitionIslands.length} connected networks`}. ${defined.length?`Defined Centers: ${defined.join(", ")}.`:"No Center is defined."}${activeUndefined.length?` Undefined Centers with an active Gate: ${activeUndefined.join(", ")}.`:""}${open.length?` Completely open Centers without an activation: ${open.join(", ")}.`:""}`;}).join(" ");
  const claim=makeClaim({kind:"computed-fact",scope,propositionKey:`natal-foundations:${index.indexHash}`,text,factIds:foundationFacts,activationIds:[],sources:[],meaningPropositionIds:[],requiredPremiseIds:[],supportRoutes:[{factIds:foundationFacts,activationIds:[],claimIds:[]}],rule:null,alternatives:[],qualifications:["These are calculated classifications, not a supplied foundational interpretation corpus."],disconfirmation:[],forbiddenInferences:[]});graph.claims.push(claim);
  if(!graph.insights.length)graph.insights.push(makeInsight({propositionKey:claim.propositionKey,mechanism:"calculated-foundations",claimIds:[claim.claimId],requiredPremiseIds:[],sectionIds:index.context==="natal"?["I01","I02","I03","I04","I05","I06","I07"]:["C01","C03"],relationKind:"baseline",discoveryDepth:"quick",salienceReason:"Only calculated foundations are available.",priority:1}));
  const glosses=[...(input.preferences.concepts?.definition===true?[]:["A connected network is a set of defined Centers joined by complete Channels; separate networks are different components of the chart graph."]),...(input.preferences.concepts?.centers===true?[]:["A Center is defined when a completed Channel reaches it. An undefined Center with an active Gate and a completely open Center are distinct states."])];
  if(glosses.length){const teaching=makeClaim({kind:"teaching",scope,propositionKey:`structural-teaching:${contentHash(glosses)}`,text:glosses.join(" "),factIds:foundationFacts,activationIds:[],sources:[],meaningPropositionIds:[],requiredPremiseIds:[claim.claimId],supportRoutes:[{factIds:[],activationIds:[],claimIds:[claim.claimId]}],rule:null,alternatives:[],qualifications:["Mechanical definitions only; no missing symbolic foundation teaching is inferred."],disconfirmation:[],forbiddenInferences:[]});graph.claims.push(teaching);}
}
function validateSelection(index:ReadingChartIndex,s:ReadingSelection):void{
  const ok=s.kind==="whole"||s.kind==="activation"&&index.activations.some(a=>a.id===s.activationId)||s.kind==="gate"&&index.activations.some(a=>a.gate===s.gate)||s.kind==="exact-line"&&s.activationIds.length>0&&s.activationIds.every(id=>index.activations.some(a=>a.id===id&&a.gate===s.gate&&a.line===s.line&&a.exactLineEligible))||s.kind==="channel"&&index.channels.some(c=>c.channelId===s.channelId)||s.kind==="center"&&index.centers.some(c=>c.centerId===s.centerId)||s.kind==="component"&&index.components.some(c=>c.id===s.componentId);
  if(!ok)readingFail(s.kind==="exact-line"?"EXACT_LINE_WITHHELD":"SELECTION_NOT_IN_CONTEXT","The selected object cannot be interpreted in this pinned chart context.");
}
function relevantClaim(c:ReadingClaim,s:ReadingSelection,index:ReadingChartIndex):boolean{
  if(s.kind==="whole")return true;
  const ids=new Set(s.kind==="activation"?[s.activationId]:s.kind==="exact-line"?s.activationIds:index.activations.filter(a=>s.kind==="gate"?a.gate===s.gate:s.kind==="center"?a.center===s.centerId:s.kind==="channel"?index.channels.find(c=>c.channelId===s.channelId)?.gates.includes(a.gate):s.kind==="component"?index.components.find(c=>c.id===s.componentId)?.centerIds.includes(a.center):false).map(a=>a.id));
  return c.activationIds.some(id=>ids.has(id));
}
function questionActivationIds(index:ReadingChartIndex,input:ReadingInput):string[]{
  const q=input.question||"",planetKeys=[...new Set(index.activations.map(a=>a.planetKey))].filter(key=>{const a=index.activations.find(a=>a.planetKey===key)!;return new RegExp(`\\b${a.planet.replace(/ /g,"\\s*")}\\b`,"i").test(q)||new RegExp(`\\b${key}\\b`,"i").test(q);});
  if(!planetKeys.length)return [];
  const personality=/\bpersonality\b/i.test(q),design=/\bdesign\b/i.test(q);
  const ids=index.activations.filter(a=>planetKeys.includes(a.planetKey)&&(!(personality!==design)||a.side===(personality?"personality":"design"))).map(a=>a.id);
  const selection=input.selection||{kind:"whole"};
  if(selection.kind!=="whole"&&!ids.some(id=>relevantClaim({activationIds:[id]} as ReadingClaim,selection,index)))readingFail("REQUEST_CONTEXT_MISMATCH","The question names planetary occurrences outside the selected object. Select the intended occurrence before continuing.");
  return ids;
}
function readingRequestDigest(index:ReadingChartIndex,input:ReadingInput,depth:ReadingDepth=input.depth||input.preferences.depth):string{
  return contentHash({index:index.indexHash,preferences:input.preferences,depth,disclosure:input.disclosure||"compact",view:input.view||(index.context==="natal"?"natal":"combined"),selection:input.selection||{kind:"whole"},question:input.question||"",use:input.use,variantId:input.variantId||"r4",inputAssurance:input.inputAssurance||null,composition:input.composition||null,policy:POLICY_HASH,content:readingCatalogueHash});
}

function buildGraph(index:ReadingChartIndex,input:ReadingInput):{claims:ReadingClaim[];insights:ReadingInsight[];sourceDisagreements:ReadingEngineResult["trace"]["sourceDisagreements"];units:MeaningUnit[]}{
  const claims:ReadingClaim[]=[],insights:ReadingInsight[]=[],units=new Map<string,MeaningUnit>(),sourceDisagreements:ReadingEngineResult["trace"]["sourceDisagreements"]=[];
  const scope:ClaimScope={context:index.context,personIds:index.participants.map(p=>p.personId),chartRevisionIds:index.participants.map(p=>p.chartVersionId),worldIds:[`point:${index.indexHash}`]};
  const variant=input.variantId||"r4";
  const activationMap=new Map(index.activations.map(a=>[a.id,a]));
  function unit(id:string){if(units.has(id))return units.get(id);const u=getMeaningUnit(id,variant);if(!u||!resolveMeaningEligibility(u,{use:input.use,capability:input.capability}).allowed)return undefined;units.set(id,u);const disagreements=u.fields.filter(f=>/source_disagreement|source_comparison|source_resolution/i.test(f.fieldKey)&&typeof f.value==="string"&&f.value.trim());if(disagreements.length)sourceDisagreements.push({recordId:id,variantId:variant,fieldKeys:disagreements.map(f=>f.fieldKey)});return u;}
  function basic(text:string,activationIds:string[],facts:string[]=[],key=text,support?:{routes:SupportRoute[];required:string[]}):ReadingClaim{
    const claim=makeClaim({kind:"computed-fact",scope,propositionKey:`fact:${contentHash({key,activationIds,facts,scope})}`,text,factIds:facts,activationIds,sources:[],meaningPropositionIds:[],requiredPremiseIds:support?.required||[],supportRoutes:support?.routes||[{factIds:facts,activationIds,claimIds:[]}],rule:null,alternatives:[],qualifications:["Pinned point calculation; not interval stability or independent astronomy certification."],disconfirmation:[],forbiddenInferences:[]});claims.push(claim);return claim;
  }
  function symbolic(u:MeaningUnit,f:SourceField,activationIds:string[],label:string,routes?:SupportRoute[],includeDevelopment=false):ReadingClaim{
    const fields=includeDevelopment?unique([f,...u.fields.filter(x=>x.purpose==="meaning"&&typeof x.value==="string"&&/^(trigger_condition|transformational_process|likely_output|recognition_signals\.0|source6\.process_arc|source6\.recognition_signals\.0|energy_movement|app_content\.sections\.rich_explanation\.0\.text)$/.test(x.fieldKey)&&!excludedField(u,x.fieldKey)&&(u.kind!=="exact-line"||x.ref.granularity==="exact-line")),...u.fields.filter(x=>typeof x.value==="string"&&/(^|\.)boundary_nonclaim$/.test(x.fieldKey))]):[f];
    const sources:ClaimSource[]=fields.map(x=>freezeReadingValue({recordId:u.recordId,variantId:u.variantId,fieldKey:x.fieldKey,ref:x.ref,text:String(x.value),shared:x.shared,realization:"faithful-paraphrase-with-canonical-labels" as const}));
    const claim=makeClaim({kind:"sourced-symbolic",scope,propositionKey:`meaning:${contentHash({record:u.recordId,fields:fields.map(x=>x.fieldKey),activationIds,scope})}`,text:normalizeReadingPunctuation(`In the symbolic source reading, ${label} has this symbolic meaning: ${sourceWords(String(f.value))}${includeDevelopment?developmentWords(sources):""}`),factIds:[],activationIds,sources,meaningPropositionIds:fields.map(x=>`meaning:${u.recordId}:${x.fieldKey}`),requiredPremiseIds:[],supportRoutes:routes||[{factIds:[],activationIds,claimIds:[]}],rule:null,alternatives:[],qualifications:["A symbolic interpretation, not an assertion of the person's expression.",...sources.filter(x=>/boundary_nonclaim/.test(x.fieldKey)).map(x=>x.text)],disconfirmation:[],forbiddenInferences:[]});
    const existing=claims.find(c=>c.claimId===claim.claimId);if(!existing)claims.push(claim);return existing||claim;
  }
  function combined(relation:ReadingRule["relation"],text:string,premises:ReadingClaim[],sections:string[],depth:ReadingDepth,priority:number,key:string,extraFacts:string[]=[]):ReadingInsight{
    const ids=unique(premises.map(c=>c.claimId)),rule=makeRule(relation,ids);
    const c=makeClaim({kind:"conditional-synthesis",scope,propositionKey:`relation:${relation}:${contentHash({key,scope})}`,text:normalizeReadingPunctuation(text),factIds:unique([...extraFacts,...premises.flatMap(p=>p.factIds)]),activationIds:unique(premises.flatMap(p=>p.activationIds)),sources:uniqueSources(premises.flatMap(p=>p.sources)),meaningPropositionIds:unique(premises.flatMap(p=>p.meaningPropositionIds)),requiredPremiseIds:ids,supportRoutes:[{factIds:extraFacts,activationIds:[],claimIds:ids}],rule,alternatives:["These meanings may not describe a reported experience; ordinary context can explain an apparent resemblance."],qualifications:rule.qualifications,disconfirmation:["Changing the linked activation, exact Line, endpoint or topology retracts or revises this reading.","The reader may observe neither symbolic possibility."],forbiddenInferences:[]});
    const meaningOccurrences=unique(premises.flatMap(p=>p.kind==='sourced-symbolic'?p.activationIds:[])).map(id=>activationMap.get(id)!).filter(Boolean);
    const bindings=unique(meaningOccurrences.map(a=>`${a.personId}:${a.gate}:${a.line}`)).sort();
    const comparisons:string[]=[];
    if(['repeated-line-contrast','directional-contribution','completed-endpoint-interaction'].includes(relation)){
      for(let a=0;a<bindings.length;a++)for(let b=a+1;b<bindings.length;b++)comparisons.push(`meaning-comparison:${bindings[a]}|${bindings[b]}`);
    }
    const expressedRelations=relation==='repeated-line-contrast'?comparisons:[`relationship:${key}`,...comparisons];
    const channels=unique(c.sources.filter(s=>s.recordId.startsWith('channel-')).map(s=>s.recordId));
    const themeKey=channels.length===1&&['completed-endpoint-interaction','directional-contribution','coherent-distorted-alternative'].includes(relation)?`theme:${channels[0]}`:`theme:${key}`;
    const themeTitle=channels.length===1?sourceWords(String(kernel(unit(channels[0])!)?.value||'')).split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/,''):undefined;
    const semanticKey=`${relation}:${channels.map(id=>String(kernel(unit(id)!)?.value||id)).sort().join('|')}:${key}`;
    claims.push(c);const insight=makeInsight({propositionKey:c.propositionKey,mechanism:relation,claimIds:[c.claimId],requiredPremiseIds:ids,sectionIds:sections,relationKind:relation,discoveryDepth:depth,salienceReason:key,semanticKey,themeKey,themeTitle,expressedRelations,priority});insights.push(insight);return insight;
  }
  function activationSource(a:IndexedActivation){
    const id=a.exactLineEligible&&a.line!==null?`${gateId(a.gate)}-line-${a.line}`:gateId(a.gate),u=unit(id),f=u&&kernel(u);
    if(!u||!f)return undefined;
    return symbolic(u,f,[a.id],readingGateLabel(a.gate,a.line),undefined,true);
  }
  const channelScore=(ch:IndexedChannel)=>{
    const ids=ch.endpointActivationIds.flat(),active=ids.map(id=>activationMap.get(id)!);
    const distinctLines=new Set(active.filter(a=>a.exactLineEligible).map(a=>`${a.personId}:${a.gate}:${a.line}`)).size;
    const directJoin=index.graphs.filter(g=>g.scope.kind==='participant').some(g=>{const ends=ch.centers.map(c=>g.components.find(x=>x.centerIds.includes(c)));return ends[0]&&ends[1]&&ends[0].id!==ends[1].id;});
    const kernels=active.map(a=>a.exactLineEligible?unit(`${gateId(a.gate)}-line-${a.line}`):undefined).filter((u):u is MeaningUnit=>!!u).map(u=>String(kernel(u)?.value||''));
    const conditionalTension=kernels.some(t=>/rhythm/i.test(t)&&/persist|continuity/i.test(t))&&kernels.some(t=>/recalibrat|adjust/i.test(t)&&/environment|conditions/i.test(t));
    return Number(conditionalTension)*45+Number(directJoin)*30+Number(!!ch.relation?.combinedOnly)*20+Math.min(distinctLines,4)*3;
  };
  const complete=index.channels.filter(c=>c.complete&&(index.context==="natal"||c.personId===null)).sort((a,b)=>channelScore(b)-channelScore(a)||String((unit(a.channelId)?kernel(unit(a.channelId)!)?.value:undefined)||a.channelId).localeCompare(String((unit(b.channelId)?kernel(unit(b.channelId)!)?.value:undefined)||b.channelId)));
  const channelFindings:{channel:IndexedChannel;source:ReadingClaim;fact:ReadingClaim;ownership:ReadingClaim[];insight:ReadingInsight;unit:MeaningUnit}[]=[];
  for(const ch of complete){
    const u=unit(ch.channelId),f=u&&kernel(u);if(!u||!f)continue;
    const routes:SupportRoute[]=ch.endpointActivationIds[0].flatMap(a=>ch.endpointActivationIds[1].map(b=>({factIds:[],activationIds:[a,b],claimIds:[]})));
    if(!routes.length)continue;
    const activationIds=unique(ch.endpointActivationIds.flat()),label=channelLabel(ch),src=symbolic(u,f,activationIds,label,routes,true);
    const owners=ch.relation?ownershipWords(ch,index):"Both endpoints are present in this natal chart.";
    // Positive completion has redundant pair-wide witnesses; ownership has its own proof.
    const fact=basic(`${label} is complete.`,activationIds,[],ch.channelId,{routes,required:[]});
    const ownership:ReadingClaim[]=[];
    if(ch.relation){
      const ownershipFacts=selectP1FactIds(index,{kind:'channel',channelId:ch.channelId,personId:null});
      for(const state of ch.relation.endpointStates){
        const ownEnds=ch.endpointActivationIds.map(ids=>ids.filter(id=>activationMap.get(id)!.personId===state.personId));
        const who=participantLabel(index,state.personId);
        // Full presence is provable from either redundant person-scoped pair. Absence
        // and partial status require the issued exhaustive ownership fact as well.
        const ownRoutes:SupportRoute[]=state.state===3
          ?ownEnds[0].flatMap(a=>ownEnds[1].map(b=>({factIds:[],activationIds:[a,b],claimIds:[]})))
          :state.state===0?[{factIds:ownershipFacts,activationIds:[],claimIds:[]}]
          :ownEnds.flat().map(a=>({factIds:ownershipFacts,activationIds:[a],claimIds:[]}));
        const text=state.state===3?`${who} has the full natal route for ${label}.`
          :state.state===0?`${who} supplies neither endpoint of ${label}.`
          :`${who} supplies only ${readingGateLabel(ch.gates[state.state===1?0:1])} of ${label}.`;
        ownership.push(basic(text,ownEnds.flat(),state.state===3?[]:ownershipFacts,`endpoint-state:${ch.channelId}:${state.personId}:${state.state}`,{routes:ownRoutes,required:[]}));
      }
      const ids=ownership.map(c=>c.claimId);
      ownership.push(basic(owners,activationIds,ownershipFacts,`classification:${ch.channelId}`,{routes:[{factIds:ownershipFacts,activationIds:[],claimIds:ids}],required:ids}));
    }
    // Endpoint facts admit redundant support; exact occurrence claims remain separately removable.
    const left=ch.endpointActivationIds[0].map(id=>activationMap.get(id)!).find(a=>a?.exactLineEligible&&activationSource(a)),right=ch.endpointActivationIds[1].map(id=>activationMap.get(id)!).find(a=>a?.exactLineEligible&&activationSource(a));
    const a=left&&activationSource(left),b=right&&activationSource(right);
    const rich=src.sources.find(s=>/^app_content\.sections\.rich_explanation\.0\.text$/.test(s.fieldKey));
    let text=`${label} has a distinct theme: ${sourceWords(String(f.value))} ${owners}`;
    if(a&&b){
      text+=` ${capitalize(activationLabel(left!,index))}: ${sourceWords(a.sources[0].text)}${developmentWords(a.sources)} ${capitalize(activationLabel(right!,index))}: ${sourceWords(b.sources[0].text)}${developmentWords(b.sources)} `;
      const at=a.sources.find(x=>x.fieldKey==='trigger_condition'),bt=b.sources.find(x=>x.fieldKey==='trigger_condition');
      const aRhythm=/rhythm|cadence/i.test(a.sources[0].text),bRhythm=/rhythm|recalibrat/i.test(b.sources[0].text);
      if(at&&bt&&aRhythm&&bRhythm&&/persist|continuity/i.test(a.sources[0].text)&&/adjust|recalibrat/i.test(b.sources[0].text))
        text+=`Read together, these distinguish maintaining a viable rhythm through disruption from recalibrating it when conditions change. The first condition is: ${sourceWords(at.text)} The second is: ${sourceWords(bt.text)} Persistence therefore does not require keeping an obsolete schedule, and adjustment does not require abandoning every workable rhythm.`;
      else if(at&&bt)text+=`The two emphases apply under different conditions: ${sourceWords(at.text)} By comparison: ${sourceWords(bt.text)} A completion links these themes mechanically; it does not establish that both conditions occur together.`;
    } else text+=` The completed route is supported at Gate level; unavailable exact-Line interpretations are omitted.`;
    const insight=combined("completed-endpoint-interaction",text,[fact,...ownership,src,...(a?[a]:[]),...(b?[b]:[])],index.context==="natal"?["I01","I08","I09","I13"]:["C03","C05","C06","SYN-A","SYN-F"],"standard",80+channelScore(ch),`completed:${ch.channelId}`);
    channelFindings.push({channel:ch,source:src,fact,ownership,insight,unit:u});
  }
  if(channelFindings.length>=2){
    const first=channelFindings[0],second=channelFindings.find(x=>!x.channel.centers.some(c=>first.channel.centers.includes(c)))||channelFindings[1];
    const graph=index.context==="composite"?index.composite!.facts.topology.combinedGraph:index.graphs.find(g=>g.scope.kind==="participant")||index.graphs[0];
    const firstComponent=graph?.components.find(c=>first.channel.centers.every(x=>c.centerIds.includes(x))),secondComponent=graph?.components.find(c=>second.channel.centers.every(x=>c.centerIds.includes(x)));
    const apart=firstComponent&&secondComponent&&firstComponent.id!==secondComponent.id;
    const topology=basic(`The selected routes occupy ${apart?"separate connected networks":"the same connected network"} in the pinned ${index.context==="natal"?"natal":"combined"} graph.`,unique([...first.fact.activationIds,...second.fact.activationIds]),selectP1FactIds(index,{kind:'components'}),`network:${first.channel.channelId}:${second.channel.channelId}:${!!apart}`);
    const text=`Two themes need to be held together without treating them as the same process. ${channelLabel(first.channel)} has this symbolic theme: “${sourceWords(first.source.sources[0].text)}”; ${channelLabel(second.channel)} has this symbolic theme: “${sourceWords(second.source.sources[0].text)}”. ${apart?"Their routes lie in different connected networks, so one route does not itself provide a continuous path into the other.":"Their routes lie in one connected network; that mechanical continuity makes both themes relevant to the same structure, without proving psychological agreement."} A useful conditional reading is to distinguish what each process contributes before assuming that expressing one has fulfilled the other.`;
    combined("parallel-network-contrast",text,[first.fact,second.fact,first.source,second.source,topology],index.context==="natal"?["I07","I13"]:["C02","C05","C11","SYN-A"],"standard",100,`network-contrast:${first.channel.channelId}:${second.channel.channelId}`);
  }
  for(const first of channelFindings){
    const co=field(first.unit,/(^|\.)coherent_expression$/),di=field(first.unit,/(^|\.)distorted_expression$/);
    if(co&&di){
      const c=symbolic(first.unit,co,first.fact.activationIds,channelLabel(first.channel),first.fact.supportRoutes),d=symbolic(first.unit,di,first.fact.activationIds,channelLabel(first.channel),first.fact.supportRoutes);
      combined("coherent-distorted-alternative",`The same ${channelLabel(first.channel)} can be explored through two different possibilities. The constructive source account is “${sourceWords(String(co.value))}”; the difficult account is “${sourceWords(String(di.value))}”. The actual contributing activations make these alternatives relevant to this reading, but do not select one as your state. An observation of neither possibility is a valid outcome; these application descriptions are also distinct from traditional exaltation or detriment labels.`,[first.fact,...first.ownership,c,d],index.context==="natal"?["I14"]:["C04","C11","SYN-I"],"standard",85,`alternatives:${first.channel.channelId}`);
    }
  }
  // Repetition creates a comparison of actual exact meanings, never additional definition.
  for(const group of index.repeatedGates){
    const active=group.activationIds.map(id=>activationMap.get(id)!).filter(a=>a?.exactLineEligible&&a.line!==null).sort((a,b)=>a.line!-b.line!||a.id.localeCompare(b.id));
    const a=active[0],b=a&&active.find(x=>x.line!==a.line);if(!a||!b)continue;
    const ca=activationSource(a),cb=activationSource(b);if(!ca||!cb||ca.sources[0].text===cb.sources[0].text)continue;
    const witness=repeatedGateWitness(index,a.gate,[a.id,b.id]);
    const contextFacts=index.facts.filter(f=>f.predicate==='activation'&&f.activationIds.some(id=>witness.allContextActivationIds.includes(id))).map(f=>f.id);
    const f=basic(`${readingGateLabel(a.gate)} has ${witness.occurrenceCount} distinct activation occurrences and ${witness.distinctEligibleLines.length} eligible exact Lines in this ${index.context==='natal'?'natal':'pair'} context; this comparison selects two occurrences.`,witness.allContextActivationIds,contextFacts,`repeat-context:${witness.witnessId}`);
    combined("repeated-line-contrast",`${f.text} This selected comparison develops two different meanings. ${capitalize(activationLabel(a,index))} has this exact-Line meaning: “${sourceWords(ca.sources[0].text)}”. ${capitalize(activationLabel(b,index))} has this exact-Line meaning: “${sourceWords(cb.sources[0].text)}”. These are two selected emphases, not an exhaustive account of the Gate. ${witness.omittedEligibleActivationIds.length} other eligible occurrence(s) remain available in the same contextual record. Keeping them separate allows a closer reading than a single Gate summary; neither the planet labels nor the number of occurrences multiplies definition or establishes which expression is active.`,[f,ca,cb],index.context==="natal"?["I09","I11","I13"]:["C06","C11","SYN-F"],"deep",95,`repeated-lines:${a.gate}:${a.line}:${b.line}:${a.personId}:${b.personId}`);
  }
  // Explicitly recomputed hypothetical graph consequences, separated from natal facts.
  for(const path of index.unfinishedPaths){
    const own=index.participants.find(p=>p.personId===path.personId)!;
    const a=path.activationIds.map(id=>activationMap.get(id)!).find(a=>a?.exactLineEligible)||path.activationIds.map(id=>activationMap.get(id)!).find(Boolean);
    const psrc=a&&activationSource(a),u=unit(path.channelId),f=u&&kernel(u);if(!a||!psrc||!u||!f)continue;
    const before=deriveStructure(own.facts.gates),after=deriveStructure([...own.facts.gates,path.absentGate]);
    const addedCenters=after.centers.filter(c=>c.defined&&!before.centers.some(b=>b.id===c.id&&b.defined)).map(c=>c.id);
    const beforeN=before.definitionIslands.length,afterN=after.definitionIslands.length;
    const consequence=addedCenters.length?`would newly define ${addedCenters.map(c=>`${CENTER_NAMES[c]} Center`).join(" and ")}`:afterN<beforeN?`would join formerly separate natal networks, reducing their count from ${beforeN} to ${afterN}`:"would add a route without joining separate natal networks or defining another Center";
    const pf=basic(`${readingGateLabel(path.presentGate)} is present and ${readingGateLabel(path.absentGate)} is absent for this per-Channel path.`,path.activationIds,selectP1FactIds(index,{kind:'unfinished',pathId:path.id,personId:path.personId}),path.id);
    const future=symbolic(u,f,path.activationIds,`the hypothetical ${channelLabel({channelId:path.channelId,gates:[path.presentGate,path.absentGate],centers:path.centers,personId:path.personId,complete:false,endpointActivationIds:[]})}`);
    const canonicalPath=index.channels.find(c=>c.channelId===path.channelId&&c.personId===path.personId)!,label=channelLabel(canonicalPath);
    combined("unfinished-path-consequence",`${capitalize(activationLabel(a,index))} has an unfinished route toward ${readingGateLabel(path.absentGate)}. Its existing meaning is: “${sourceWords(psrc.sources[0].text)}”${developmentWords(psrc.sources)}. If that absent endpoint were hypothetically added to this person’s natal chart, ${label} would become complete. Its distinct completed theme is: “${sourceWords(String(f.value))}”. Mechanically, adding the endpoint ${consequence}. This is a calculated alternative, not a claim that the route is already active or that another person is needed to supply it. ${path.otherCompletedChannelIds.length?"The present Gate also participates in another completed route; that existing completion does not erase this different unfinished possibility.":"The uncompleted route and its existing endpoint remain different kinds of evidence."}`,[pf,psrc,future],index.context==="natal"?["I07","I09","I10"]:["C05","C11"],"deep",90+Number(afterN<beforeN)*10,`unfinished:${path.personId}:${path.channelId}:${consequence}`);
    // Different missing endpoints with the same person-scoped graph consequence
    // remain alternatives in context, not multiple credits for that consequence.
    insights[insights.length-1].expressedRelations=[`hypothetical-topology:${path.personId}:${beforeN}->${afterN}:${addedCenters.slice().sort().join(",")}`];
  }
  if(index.context==="composite"){
    const pair=index.composite!;
    const joins=pair.facts.topology.actualJoins;
    if(joins.length){
      const joined=joins.map(join=>{
        const receiver=participantLabel(index,join.personId),other=participantLabel(index,pair.displayParticipantIds.find(id=>id!==join.personId)!);
        const carriers=channelFindings.filter(f=>join.witness.edges.some(e=>e.channelId===f.channel.channelId));
        const carrier=carriers.find(f=>f.channel.relation?.fullOwnerIds.some(id=>id!==join.personId)&&!f.channel.relation.fullOwnerIds.includes(join.personId))||carriers[0];
        if(!carrier)return undefined;
        const native=pair.facts.topology.natalGraphs.find(g=>g.scope.personIds.includes(join.personId))!;
        const joinFacts=selectP1FactIds(index,{kind:'join',personId:join.personId}),required=carriers.map(f=>f.fact.claimId);
        const fact=basic(`A sufficient route in the combined graph joins ${receiver}'s distinct natal islands.`,unique(carriers.flatMap(f=>f.fact.activationIds)),joinFacts,`join:${join.personId}:${join.witness.id}`,{routes:[{factIds:joinFacts,activationIds:[],claimIds:required}],required});
        const supplied=carrier.channel.relation?.fullOwnerIds.some(id=>id!==join.personId)?`a route already complete in ${other}'s natal chart`:`a route available in the combination`;
        return {fact,carrier,text:`${receiver} begins with ${native.componentCount} natal networks. A sufficient joining path uses ${join.witness.edges.map(e=>channelLabel(index.channels.find(c=>c.channelId===e.channelId)!)).join(" then ")}. Every listed edge is needed for this particular witness; other routes may still work. Within that path, ${channelLabel(carrier.channel)} is ${supplied}, whose symbolic theme is: “${sourceWords(carrier.source.sources[0].text)}”.`};
      }).filter((x):x is NonNullable<typeof x>=>!!x);
      if(joined.length){
        const topology=pair.facts.topology,components=topology.combinedGraph.componentCount,centers=topology.combinedGraph.definedCenters.length,newCenters=topology.deltas.combinedOnlyCenterIds;
        const newCenterCarriers=channelFindings.filter(f=>f.channel.centers.some(c=>newCenters.includes(c)));
        const newCenterFacts=selectP1FactIds(index,{kind:'components'});
        const newCenterPremises=newCenterCarriers.map(f=>f.fact.claimId);
        const f=basic(`The pair has ${components} combined connected network${components===1?"":"s"}, ${centers} defined Centers and ${newCenters.length} newly defined Centers.`,newCenterCarriers.flatMap(f=>f.fact.activationIds),newCenterFacts,"pair-topology-thesis",{routes:[{factIds:newCenterFacts,activationIds:[],claimIds:newCenterPremises}],required:newCenterPremises});
        const text=`The distinctive possibility here comes from how the two existing architectures connect. ${joined.map(x=>x.text).join(" ")} Together the graph has ${components} connected network${components===1?"":"s"} and ${centers} defined Centers${newCenters.length===0?", without adding a Center beyond the union of both natal definitions":`; ${newCenters.map(c=>`${CENTER_NAMES[c]} Center`).join(" and ")} ${newCenters.length===1?"is":"are"} newly defined in the pair through ${newCenterCarriers.map(f=>channelLabel(f.channel)).join(" and ")}, relative to the union of both natal definitions`}.${components>1?` The combined graph still has ${components} separate networks; a join for one person's natal islands does not merge the entire pair.`:""} The conditional reading is that these different symbolic processes gain a connected setting together; a new connection need not be a new personal resource, and neither person's natal decision process changes. The joining paths are sufficient witnesses, not claims of unique or indispensable routes.`;
        combined("reciprocal-island-join",text,[f,...joined.flatMap(x=>[x.fact,x.carrier.fact,...x.carrier.ownership,x.carrier.source])],["C01","C02","C05","C11","SYN-A","SYN-F"],"standard",120,`actual-joins:${joins.map(j=>j.personId).sort().join(":")}`);
      }
    }
    if(!joins.length&&channelFindings.length){
      const topology=pair.facts.topology,graph=topology.combinedGraph,newCenters=topology.deltas.combinedOnlyCenterIds;
      const anchor=channelFindings.find(f=>f.channel.relation?.combinedOnly)||channelFindings[0];
      const f=basic(`The combined graph has ${graph.componentCount} networks, ${graph.definedCenters.length} defined Centers and no witnessed join between a participant's distinct natal islands.`,[],selectP1FactIds(index,{kind:'components'}),"combined-structure-context");
      const novelty=newCenters.length?`${newCenters.map(c=>`${CENTER_NAMES[c]} Center`).join(" and ")} ${newCenters.length===1?"becomes":"become"} newly defined in the pair`:`No Center is added beyond the union of both natal definitions`;
      combined("combined-topology-context",`The pair's distinctiveness comes from which processes become available together and which remain separate. ${channelLabel(anchor.channel)} has this symbolic theme: ${sourceWords(anchor.source.sources[0].text)} ${ownershipWords(anchor.channel,index)} ${novelty}. The combined graph has ${graph.componentCount} connected network${graph.componentCount===1?"":"s"}; no witnessed route joins distinct natal islands for either participant. That separates the availability of this symbolic theme from a claim that the pair merges every process into one.`,[f,anchor.fact,...anchor.ownership,anchor.source],["C03","C05","C11","SYN-A"],"standard",120,"combined-topology-without-natal-join");
    }
    for(const finding of channelFindings){
      const ch=finding.channel,r=ch.relation;if(!r)continue;
      const aId=pair.displayParticipantIds[0],bId=pair.displayParticipantIds[1];
      const actual=finding.fact.activationIds.map(id=>activationMap.get(id)!).filter(a=>a.exactLineEligible);
      const groups=unique(actual.map(a=>`${a.personId}:${a.gate}:${a.line}`)).map(key=>actual.filter(a=>`${a.personId}:${a.gate}:${a.line}`===key));
      const sourceGroups=groups.map(activations=>({activations,sources:activations.map(a=>activationSource(a)).filter((c):c is ReadingClaim=>!!c)}));
      const supportedGroups=sourceGroups.filter(g=>g.sources.length);
      const bothPeople=supportedGroups.some(g=>g.activations[0].personId===aId)&&supportedGroups.some(g=>g.activations[0].personId===bId);
      const supportsJoin=joins.some(join=>join.witness.edges.some(e=>e.channelId===ch.channelId));
      // Rank any direct connection between distinct natal islands, not merely the
      // native graph's arbitrarily selected sufficient witness or a larger record count.
      const directlyJoinsNatalIslands=index.graphs.filter(g=>g.scope.kind==='participant').some(g=>{
        const ends=ch.centers.map(center=>g.components.find(c=>c.centerIds.includes(center)));
        return ends.length===2&&ends[0]&&ends[1]&&ends[0].id!==ends[1].id;
      });
      const distinctRepeatedLines=ch.gates.some(g=>new Set(index.activations.filter(a=>a.gate===g&&a.exactLineEligible).map(a=>a.line)).size>1);
      if(bothPeople&&new Set(supportedGroups.map(g=>g.sources[0].sources[0].text)).size>1){
        const parts=supportedGroups.map(g=>`${g.activations.map(a=>capitalize(activationLabel(a,index))).join(" and ")}${g.activations.length>1?" repeat one exact-Line theme":" contributes a particular exact-Line theme"}: ${sourceWords(g.sources[0].sources[0].text)}${developmentWords(g.sources[0].sources)}`);
        const withheld=sourceGroups.filter(g=>!g.sources.length).flatMap(g=>g.activations).map(a=>capitalize(activationLabel(a,index)));
        combined("directional-contribution",`${channelLabel(ch)} brings different contributions into the same route. Its shared theme is: ${sourceWords(finding.source.sources[0].text)} ${parts.join(". ")}. ${ownershipWords(ch,index)}${withheld.length?` ${withheld.join(" and ")} remains part of the calculation, while its disputed exact-Line interpretation is withheld.`:""} The comparison preserves each distinct exact-Line account at its actual source scope; it does not treat one person's account as the other's experience.`,[finding.fact,...finding.ownership,finding.source,...supportedGroups.flatMap(g=>g.sources)],["C04","C06","C11","SYN-F"],"standard",Math.min(115,88+(supportsJoin?20:0)+(directlyJoinsNatalIslands?12:0)+(distinctRepeatedLines?2:0)+(r.combinedOnly?15:0)+(r.classification==="compromise"?8:0)+Math.min(supportedGroups.length,4)),`directions:${ch.channelId}:${aId}:${bId}`);
      }
      if(r.combinedOnly){
        const pf=basic(`${channelLabel(ch)} is absent from each independent natal graph and complete in the pair graph.`,finding.fact.activationIds,selectP1FactIds(index,{kind:'channel',channelId:ch.channelId,personId:ch.personId}),`separation:${ch.channelId}`);
        combined("separation-persistence",`There is a precise difference between a shared route and an individual resource here. ${channelLabel(ch)} has this symbolic theme: “${sourceWords(finding.source.sources[0].text)}” in the combined structure, yet neither natal graph contains that completed route. Removing either participant returns the remaining participant's actual natal structure; this combined-only route disappears. The conditional implication is limited to the availability of this symbolic connection. It does not say that affection, learning, memory or practical ability disappears when you are apart.`,[pf,finding.fact,...finding.ownership,finding.source],["C05","C11","SYN-G"],"deep",94,`apart:${ch.channelId}`);
      }
    }
  }
  if(!insights.length){
    for(const a of index.activations){const src=activationSource(a);if(!src)continue;const f=basic(`${activationLabel(a,index)} is present in the pinned point calculation.`,[a.id],[],a.id);combined("contextual-meaning",`${activationLabel(a,index)} provides one supported symbolic starting point: “${sourceWords(src.sources[0].text)}”. This occurrence can be interpreted at its actual source scope; the available evidence does not turn it into a whole-chart psychological thesis.`,[f,src],index.context==="natal"?["I09"]:["C06"],"standard",20,`single-meaning:${a.id}`);}
  }
  // All exact occurrences remain inspectable from the same evidence graph, even outside the story.
  const occurrenceFacts=new Map<string,ReadingClaim>();
  for(const a of index.activations){activationSource(a);occurrenceFacts.set(a.id,basic(`${capitalize(activationLabel(a,index))} is present in the pinned point calculation.`,[a.id],selectP1FactIds(index,{kind:'activation',activationId:a.id}),`occurrence:${a.id}`));}
  const requestedIds=questionActivationIds(index,input);
  if(requestedIds.length){
    const requested=index.activations.filter(a=>requestedIds.includes(a.id)&&relevantClaim({activationIds:[a.id]} as ReadingClaim,input.selection||{kind:"whole"},index));
    const supported=requested.map(a=>({a,source:activationSource(a),fact:occurrenceFacts.get(a.id)!})).filter((x):x is typeof x&{source:ReadingClaim}=>!!x.source);
    if(supported.length)combined("contextual-meaning",supported.map(({a,source})=>`${capitalize(activationLabel(a,index))} carries the sourced meaning “${sourceWords(source.sources[0].text)}”${developmentWords(source.sources)}.`).join(" ")+" These meanings are bound to the actual selected occurrences; a separate planetary or side-based psychological interpretation is unavailable.",supported.flatMap(x=>[x.fact,x.source]),index.context==="natal"?["I09","I11"]:["C06"],"standard",150,`question-occurrences:${requestedIds.join(":")}`);
  }
  return {claims,insights,sourceDisagreements,units:[...units.values()]};
}
function capitalize(s:string){return s.charAt(0).toUpperCase()+s.slice(1);}
function developmentWords(sources:ClaimSource[]):string{
  const find=(pattern:RegExp)=>sources.find(s=>pattern.test(s.fieldKey))?.text;
  const trigger=find(/^trigger_condition$/),process=find(/^transformational_process$|^source6\.process_arc$/),outcome=find(/^likely_output$/),boundary=find(/(^|\.)boundary_nonclaim$/);
  const sentence=(label:string,text:string|undefined)=>text?` ${label}: ${sourceWords(text).replace(/[.;]$/,'')}.`:'';
  return sentence('Relevant condition',trigger)+sentence('Development',process)+sentence('Possible outcome',outcome)+sentence('Qualification',boundary);

}
function uniqueSources(sources:ClaimSource[]):ClaimSource[]{const seen=new Set<string>();return sources.filter(s=>{const id=sourceIdentity(s);if(seen.has(id))return false;seen.add(id);return true;});}
function activationLabel(a:IndexedActivation,index:ReadingChartIndex){const who=index.context==="composite"?`${participantLabel(index,a.personId)}'s `:"your ";return `${who}${a.side==="personality"?"Personality":"Design"} ${a.planet} at ${readingGateLabel(a.gate,a.line)}`;}
function ownershipWords(ch:IndexedChannel,index:ReadingChartIndex):string{
  const r=ch.relation;if(!r)return "Both endpoints are present in the natal chart.";
  const person=(id:string)=>participantLabel(index,id);
  const full=r.endpointStates.filter(s=>s.state===3).map(s=>person(s.personId)),partial=r.endpointStates.filter(s=>s.state===1||s.state===2).map(s=>person(s.personId));
  return r.classification==="electromagnetic"?"Each person supplies a different endpoint; the completed route exists only in combination.":r.classification==="companionship"?"Both people already have the entire completed route in their own natal charts.":r.classification==="dominance"?`${full.join(" and ")} already has the full route, while the other participant supplies neither endpoint.`:r.classification==="compromise"?`${full.join(" and ")} has the full natal route; ${partial.join(" and ")} supplies a partial contribution.`:"This route has no complete ownership classification.";
}

function coverageFor(index:ReadingChartIndex,selected:ReadingInsight[],selection:ReadingSelection,preferences:ReaderPreferencesV1):SectionCoverage[]{
  const coverage:SectionCoverage[]=[];
  const add=(id:string,title:string,status?:SectionCoverage["semanticStatus"],reasons:string[]=[])=>{const linked=selected.filter(i=>i.sectionIds.includes(id));coverage.push({sectionId:id,title,semanticStatus:status||(linked.length?"partial":"insufficientEvidence"),extent:selection.kind==="whole"?"partial-section":"selected-object-only",disposition:linked.length?"in-primary":status==="notApplicable"?"not-applicable":"unavailable",insightIds:linked.map(i=>i.insightId),reasonCodes:reasons.length?reasons:linked.length?["BOUNDED_DESIGN_MEANING_NOT_COMPLETE_SECTION"]:["ELIGIBLE_CORPUS_OR_INFERENCE_NOT_AVAILABLE"],authority:id.startsWith("I")?"confirmed-contract":"preserved-proposal"});};
  INDIVIDUAL.forEach((title,i)=>add(`I${String(i+1).padStart(2,"0")}`,title,index.context==="composite"?"partial":undefined,index.context==="composite"?["NATAL_ARCHITECTURES_PRESERVED_IN_PARTICIPANT_VIEWS"]:[]));
  if(index.context==="natal")return coverage;
  const construction=index.facts.filter(f=>f.predicate==='channel-ownership');
  COMPOSITE.forEach((title,i)=>{const id=`C${String(i+1).padStart(2,"0")}`;add(id,title,id==="C10"?"notRequested":id==="C07"&&!preferences.interests.some(x=>/sexual|intim|romanti/i.test(x))?"notRequested":undefined,id==="C10"?["OPTIONAL_ITE_NOT_REQUESTED"]:[]);});
  const constructionRow=coverage.find(c=>c.sectionId==='C03');
  if(constructionRow&&construction.length&&constructionRow.disposition==='unavailable'){
    constructionRow.disposition='reference-only';constructionRow.semanticStatus='partial';constructionRow.reasonCodes=['FACTUAL_CONSTRUCTION_AVAILABLE_IN_INDEX','SYMBOLIC_CONSTRUCTION_NOT_FULLY_EXPRESSED'];
  }
  LENSES.forEach((title,i)=>{const id=`L${String(i+1).padStart(2,"0")}`,requested=preferences.interests.some(x=>x===id||new RegExp(title.split(" ")[0],"i").test(x));add(id,title,requested?"insufficientEvidence":"notRequested",[requested?"DISTINCT_LENS_INFERENCE_NOT_AVAILABLE":"LENS_NOT_REQUESTED"]);});
  PATHWAYS.forEach((name,i)=>PATH_FIELDS.forEach((field,j)=>add(`F0${i+1}.${j+1}`,`${name}: ${field}`,"insufficientEvidence",[j===1?"STRUCTURE_ALONE_DOES_NOT_SUPPORT_A_PERSONAL_LOOP":"NO_SUPPORTED_PERSONAL_FEEDBACK_RULE_OR_OBSERVATION"])));
  SYNTHESIS.forEach((title,i)=>add(`SYN-${String.fromCharCode(65+i)}`,title));
  for(const lens of ["L02","L03"])for(const field of ["mutualInterest","pacingEndurance","emotionalTiming","autonomy","mutualRegulation","recovery"])add(`${lens}.${field}`,`${LENSES[lens==="L02"?1:2]}: ${field}`,"notRequested",["NO_INTIMATE_OBSERVATION_OR_SUPPORTED_RULE"]);
  return coverage;
}
function closeClaims(ids:string[],claims:ReadingClaim[]):ReadingClaim[]{const map=new Map(claims.map(c=>[c.claimId,c])),needed=new Set<string>();function visit(id:string){if(needed.has(id))return;needed.add(id);const c=map.get(id);if(!c)readingFail("RULE_PREMISE_MISSING","A planned reading has a missing premise.");c.requiredPremiseIds.forEach(visit);c.supportRoutes.flatMap(r=>r.claimIds).forEach(visit);}ids.forEach(visit);return claims.filter(c=>needed.has(c.claimId));}
function planParts(index:ReadingChartIndex,input:ReadingInput,graph:ReturnType<typeof buildGraph>,requestDigest:string){
  if(input.composition==='relational-discovery-v1')return relationalPlan(index,input,graph,requestDigest);
  const requested=input.depth||input.preferences.depth,selection=input.selection||{kind:"whole"},byClaim=new Map(graph.claims.map(c=>[c.claimId,c]));
  const questionIds=questionActivationIds(index,input);
  const candidates=graph.insights.filter(i=>!input.composition||i.mechanism.startsWith('argument:')).filter(i=>i.claimIds.some(id=>{const c=byClaim.get(id)!;return relevantClaim(c,selection,index)&&(!questionIds.length||c.activationIds.some(id=>questionIds.includes(id)));})).sort((a,b)=>b.priority-a.priority||(a.semanticKey||a.salienceReason).localeCompare(b.semanticKey||b.salienceReason));
  const standardCandidates=candidates.filter(i=>i.discoveryDepth!=='deep');
  const thesis=standardCandidates[0];
  const groups=new Map<string,ReadingInsight[]>();
  for(const i of standardCandidates){
    // A multi-Channel overview supplies the thesis, not another count of its subjects.
    if(['parallel-network-contrast','reciprocal-island-join','combined-topology-context'].includes(i.relationKind))continue;
    const key=i.themeKey||i.semanticKey||i.salienceReason;
    groups.set(key,[...(groups.get(key)||[]),i]);
  }
  const developed=[...groups.values()].slice(0,4).map(layers=>{
    const directional=layers.find(i=>i.relationKind==='directional-contribution');
    return directional?[directional,...layers.filter(i=>i.relationKind==='coherent-distorted-alternative')]:layers;
  });
  const standard=developed.map(layers=>({...layers[0],claimIds:unique(layers.flatMap(i=>i.claimIds)),requiredPremiseIds:unique(layers.flatMap(i=>i.requiredPremiseIds)),sectionIds:unique(layers.flatMap(i=>i.sectionIds)),expressedRelations:unique(layers.flatMap(i=>i.expressedRelations||[]))}));
  if(standard.length&&thesis&&!standard[0].claimIds.some(id=>thesis.claimIds.includes(id))){
    standard[0]={...standard[0],claimIds:unique([...thesis.claimIds,...standard[0].claimIds]),requiredPremiseIds:unique([...thesis.requiredPremiseIds,...standard[0].requiredPremiseIds]),expressedRelations:unique([...(thesis.expressedRelations||[]),...(standard[0].expressedRelations||[])])};
  }
  const actualStandard=standard.length>=3?standard:thesis?[thesis]:[];
  const expressed=new Set(actualStandard.flatMap(i=>i.expressedRelations||[]));
  const repeated= candidates.filter(i=>i.discoveryDepth==='deep'&&!novelRelationshipKeys(i,expressed).length);
  const deepUnique=selectNovelDeepInsights(candidates.filter(i=>i.discoveryDepth==='deep'),actualStandard);
  const completeDeep=deepUnique.length>=2&&standard.length>=3;
  const realizedDeep=requested==='deep'&&completeDeep?deepUnique:[];
  const selected=requested==='quick'?(thesis?[thesis]:[]):[...actualStandard,...realizedDeep];
  const depthStatus=!selected.length?'withheld':requested==='quick'?'satisfied':standard.length<3||requested==='deep'&&!completeDeep?'insufficient-supported-depth':'satisfied';
  const servedDepth:ReadingDepth=requested!=='quick'&&standard.length<3?'quick':requested==='deep'&&!completeDeep?'standard':requested;
  const chapters=selected.map((i):ReadingChapter=>({chapterId:`chapter:${contentHash({insight:i.insightId,requestDigest})}`,title:insightChapterTitle(i),thesisInsightId:i.insightId,supportingInsightIds:[],requiredClaimIds:i.claimIds,sectionIds:i.sectionIds}));
  const coverage=coverageFor(index,selected,selection,input.preferences);
  const standardPlanId=`plan:${contentHash({requestDigest:readingRequestDigest(index,{...input,preferences:{...input.preferences,depth:"standard"}},"standard"),selected:actualStandard.map(i=>i.insightId)})}`;
  const plan:ReadingPlan={schema:"AuricReadingPlanV1",planId:`plan:${contentHash({requestDigest:readingRequestDigest(index,{...input,preferences:{...input.preferences,depth:requested}},requested),selected:selected.map(i=>i.insightId)})}`,requestDigest,context:index.context,view:input.view||(index.context==="natal"?"natal":"combined"),indexHash:index.indexHash,contentReleaseHash:readingCatalogueHash,policyHash:POLICY_HASH,audience:"design-demonstration",requestedDepth:requested,servedDepth,depthStatus,insights:selected,chapters,coverage,depthDelta:{againstPlanId:requested==="deep"?`standard:${contentHash({index:index.indexHash,insights:standard.map(i=>i.insightId)})}`:null,newInsightIds:requested==="deep"?realizedDeep.map(i=>i.insightId):requested==="standard"?standard.slice(1).map(i=>i.insightId):selected.map(i=>i.insightId),omittedInsightIds:candidates.filter(i=>!selected.includes(i)).map(i=>i.insightId),repeatedInsightIds:requested==="deep"?[...actualStandard,...repeated].map(i=>i.insightId):[],repetitionReasons:Object.fromEntries((requested==="deep"?[...actualStandard,...repeated]:[]).map(i=>[i.insightId,repeated.includes(i)?"The same meaning relationship is already expressed in served Standard; zero novelty credit.":"Standalone Deep retains the supported Standard argument."]))},claimIds:[],semanticApproval:"design-only",semanticNoveltyStatus:"requires-human-review"};
  if(requested==="deep")plan.depthDelta.againstPlanId=standardPlanId;
  const claims=closeClaims(chapters.flatMap(c=>c.requiredClaimIds),graph.claims);plan.claimIds=claims.map(c=>c.claimId);return {plan,claims};
}

/** New bounded candidate path. Historical argument-proof-v1 is retained solely
 * for reproducible comparisons, not mixed into generalized discoveries. */
function relationalPlan(index:ReadingChartIndex,input:ReadingInput,graph:ReturnType<typeof buildGraph>,requestDigest:string){
 const requested=input.depth||input.preferences.depth,selection=input.selection||{kind:'whole'},byClaim=new Map(graph.claims.map(c=>[c.claimId,c]));
 const questionIds=questionActivationIds(index,input);
 const candidates=graph.insights.filter(i=>i.mechanism.startsWith('discovery:')&&i.claimIds.some(id=>{const c=byClaim.get(id)!;return relevantClaim(c,selection,index)&&(!questionIds.length||c.activationIds.some(id=>questionIds.includes(id)));})).sort((a,b)=>b.priority-a.priority||a.semanticKey!.localeCompare(b.semanticKey!));
 const standardSelection=selectRelationalThemes(candidates.filter(i=>i.discoveryDepth==='standard'),3);
 const standard=standardSelection.selected;
 const deepCandidates=candidates.filter(i=>index.context!=='composite'||i.discoveryMeaning?.scope==='pair-derived');
 const deepSelection=selectRelationalThemes([...deepCandidates.filter(i=>i.discoveryDepth==='deep'),...deepCandidates.filter(i=>i.discoveryDepth==='standard')],2,standard);
 const additions=deepSelection.selected;
 const completeDeep=standard.length>=3&&additions.length>=2;
 const quick=standard[0]||candidates[0];
 const compact=quick?{...quick,claimIds:quick.claimIds.filter(id=>['discovery','meaning-a','meaning-b','branch-a','branch-b','conditions'].includes(byClaim.get(id)!.argument?.clauseKey||''))}:undefined;
 // Insufficient Standard keeps its actual developed themes. It never silently
 // changes the request into Quick or borrows legacy prose to manufacture breadth.
 const assembled=requested==='quick'?(compact?[compact]:[]):[...standard,...(requested==='deep'?additions:[])];
 const deliveredScaffolding=new Set<string>();
 const selected=assembled.map(i=>({...i,claimIds:i.claimIds.filter(id=>{
  const c=byClaim.get(id)!;if(!['conditions','experiment'].includes(c.argument?.clauseKey||''))return true;
  if(deliveredScaffolding.has(c.text))return false;deliveredScaffolding.add(c.text);return true;
 })}));
 const status=!selected.length?'withheld':requested==='quick'?'satisfied':standard.length<3||requested==='deep'&&!completeDeep?'insufficient-supported-depth':'satisfied';
 const served:ReadingDepth=requested==='deep'&&!additions.length?'standard':requested;
 const chapters=selected.map((i):ReadingChapter=>({chapterId:`chapter:${contentHash({insight:i.insightId,requestDigest})}`,title:insightChapterTitle(i),thesisInsightId:i.insightId,supportingInsightIds:[],requiredClaimIds:i.claimIds,sectionIds:i.sectionIds}));
 const claims=closeClaims(selected.flatMap(i=>i.claimIds),graph.claims);
 const id=(depth:ReadingDepth,insights:ReadingInsight[])=>`plan:${contentHash({requestDigest:readingRequestDigest(index,{...input,preferences:{...input.preferences,depth}},depth),selected:insights.map(i=>i.insightId)})}`;
 const plan:ReadingPlan={discoverySelection:[...standardSelection.decisions,...deepSelection.decisions],schema:'AuricReadingPlanV1',planId:id(requested,selected),requestDigest,context:index.context,view:input.view||(index.context==='natal'?'natal':'combined'),indexHash:index.indexHash,contentReleaseHash:readingCatalogueHash,policyHash:POLICY_HASH,audience:'design-demonstration',requestedDepth:requested,servedDepth:served,depthStatus:status,insights:selected,chapters,coverage:coverageFor(index,selected,selection,input.preferences),depthDelta:{againstPlanId:requested==='deep'?id('standard',standard):null,newInsightIds:requested==='deep'?additions.map(i=>i.insightId):selected.map(i=>i.insightId),omittedInsightIds:candidates.filter(i=>!selected.some(s=>s.insightId===i.insightId)).map(i=>i.insightId),repeatedInsightIds:requested==='deep'?standard.map(i=>i.insightId):[],repetitionReasons:Object.fromEntries(standard.map(i=>[i.insightId,'Retained Standard relationship; no Deep novelty credit.']))},claimIds:claims.map(c=>c.claimId),semanticApproval:'design-only',semanticNoveltyStatus:'requires-human-review'};
 return {plan,claims};
}

export function generateReading(input:ReadingInput):ReadingEngineResult&{trace:ReadingEngineResult["trace"]&{patternCandidates:ReadingPatternCandidate[];relationalDiscovery?:RelationalDiscoveryTrace}}{
  validateReaderPreferences(input.preferences);
  if(input.composition!==undefined&&!['argument-proof-v1','relational-discovery-v1'].includes(input.composition))readingFail('REQUEST_CONTEXT_MISMATCH','Unsupported reading composition mode.');
  if((input.depth!==undefined&&!["quick","standard","deep"].includes(input.depth))||(input.disclosure!==undefined&&!["compact","expanded","full"].includes(input.disclosure))||(input.view!==undefined&&!["natal","combined","person-a","person-b","difference"].includes(input.view))||!["local-review","isolated-design-preview","private-app","public-app","remote-model","export"].includes(input.use)||(input.variantId!==undefined&&!["gold","r4","phase-d-v2"].includes(input.variantId)))readingFail("REQUEST_CONTEXT_MISMATCH","The requested reading settings are unsupported.");
  if(input.question!==undefined&&(typeof input.question!=="string"||input.question.length>4000))readingFail("REQUEST_CONTEXT_MISMATCH","The reading question exceeds the supported limit.");
  const index=indexFor(input),selection=input.selection||{kind:"whole"};validateSelection(index,selection);
  const requestDigest=readingRequestDigest(index,input);
  const permitted=input.use==="isolated-design-preview"&&isDesignPreviewScope(input.capability);
  const provisional=index.participants.some(p=>p.eligibility!=="exact-point");
  const graph=permitted&&!provisional?buildGraph(index,input):{claims:[],insights:[],sourceDisagreements:[],units:[]};
  if(permitted)addFoundations(graph,index,input);
  if(input.composition==='argument-proof-v1'&&permitted&&!provisional)graph.insights.push(...composeArgumentInsights(index,graph));
  const discovery=input.composition==='relational-discovery-v1'&&permitted&&!provisional?discoverRelationalInsights(index,graph,{...input,interests:input.preferences.interests}):undefined;
  if(discovery)graph.insights.push(...discovery.insights);
  const {plan,claims:selectedClaims}=planParts(index,input,graph,requestDigest),claims=graph.claims,paragraphs=realizeReading(plan.chapters,plan.insights,selectedClaims);
  const proseEvidencePacket=servedEvidence(claims,plan.claimIds,paragraphs,plan.insights);
  if(provisional)plan.depthStatus="withheld";
  const availability={factIds:new Set(index.facts.map(f=>f.id)),activationIds:new Set(index.activations.map(a=>a.id)),sourceIdentities:new Set(claims.flatMap(c=>c.sources).map(sourceIdentity)),worldIds:new Set([`point:${index.indexHash}`])};
  if(validateClaimDependencies(claims,availability).withheld.length)readingFail("RULE_PREMISE_MISSING","A planned interpretation lost its chart or meaning premises.");
  const evidence=uniqueSources(selectedClaims.flatMap(c=>c.sources)).map(safeEvidence);
  const notices=unique([permitted?"DESIGN_ONLY":"CONTENT_WITHHELD",...(provisional?["PROVISIONAL_POINT"]:[]),...(input.inputAssurance?["BIRTH_TIME_NOT_INDEPENDENTLY_VERIFIED"]:[]),...(graph.units.some(u=>u.fields.some(f=>excludedField(u,f.fieldKey)))?["SOURCE_FIELD_WITHHELD"]:[]),...(index.activations.some(a=>!a.exactLineEligible)?["EXACT_LINE_WITHHELD"]:[]),...(plan.depthStatus==="insufficient-supported-depth"?["INSUFFICIENT_SUPPORTED_DEPTH"]:[]),"MODIFIER_SOURCE_MISSING","COVERAGE_INCOMPLETE",...(graph.sourceDisagreements.length?["SOURCE_DISAGREEMENT"]:[]),...(!paragraphs.length?["NO_SUPPORTED_MEANING"]:[])]).map(code=>({code,text:READING_NOTICE_TEXT[code]}));
  const result:ReadingEngineResult={schema:"AuricReadingEngineResultV1",status:permitted?"design-only":"withheld",proseEvidencePacket,plan,claims,paragraphs,contextualInfo:[],evidence,index,notices,trace:{repeatedGateWitnesses:index.repeatedGates.map(g=>{const active=g.activationIds.map(id=>index.activations.find(a=>a.id===id)!).filter(a=>a.exactLineEligible&&a.line!==null).sort((a,b)=>a.line!-b.line!||a.id.localeCompare(b.id));const a=active[0],b=active.find(x=>x.line!==a?.line);return repeatedGateWitness(index,g.gate,a&&b?[a.id,b.id]:[]);}),factIds:unique(claims.flatMap(c=>c.factIds)),activationIds:unique(claims.flatMap(c=>c.activationIds)),sourceToClaims:uniqueSources(claims.flatMap(c=>c.sources)).map(s=>({sourceIdentity:sourceIdentity(s),recordId:s.recordId,fieldKey:s.fieldKey,claimIds:claims.filter(c=>c.sources.some(x=>sourceIdentity(x)===sourceIdentity(s))).map(c=>c.claimId)})),claimToParagraphs:claims.map(c=>({claimId:c.claimId,paragraphIds:paragraphs.filter(p=>p.claimIds.includes(c.claimId)).map(p=>p.paragraphId)})),rules:unique(claims.map(c=>c.rule).filter((r):r is ReadingRule=>!!r)),sourceDisagreements:graph.sourceDisagreements,candidateInsights:graph.insights,meaningPackets:graph.units.map(u=>({recordId:u.recordId,variantId:u.variantId,rawRecordHash:u.rawRecordHash,selectionLedger:u.fields.map(f=>{const matches=(c:ReadingClaim)=>c.sources.some(s=>s.recordId===u.recordId&&s.variantId===u.variantId&&s.fieldKey===f.fieldKey);const consumed=selectedClaims.some(matches),contextual=claims.some(matches);return {fieldKey:f.fieldKey,ref:f.ref,disposition:consumed?"required" as const:contextual||f.shared?"included-context" as const:"deferred" as const,reason:consumed?"SERVED_PLAN_CLOSED_MEANING_PREMISE":contextual?"CANDIDATE_OR_CONTEXT_ONLY_NOT_REQUIRED_BY_SERVED_PLAN":f.ref.granularity==="mixed"?"MIXED_SCOPE_NOT_PROMOTED_TO_EXACT_LINE":f.purpose==="source-context"?"SOURCE_COMPARISON_PRESERVED_NOT_RESOLVED":f.purpose==="metadata"?"METADATA_NOT_PSYCHOLOGICAL_MODIFIER":"AVAILABLE_FULL_RECORD_OUTSIDE_SELECTED_PROPOSITION"};})})),uncertainty:index.activations.map(a=>({activationId:a.id,lineStatus:a.lineStatus}))},integrityHash:""};
  const targets:ReadingSelection[]=[selection,...index.activations.map(a=>({kind:"activation" as const,activationId:a.id})),...unique(index.activations.map(a=>a.gate)).map(gate=>({kind:"gate" as const,gate})),...index.channels.filter(c=>c.complete).map(c=>({kind:"channel" as const,channelId:c.channelId})),...unique(index.centers.map(c=>c.centerId)).map(centerId=>({kind:"center" as const,centerId})),...index.components.map(c=>({kind:"component" as const,componentId:c.id}))];
  result.contextualInfo=targets.filter((t,i)=>targets.findIndex(x=>contentHash(x)===contentHash(t))===i).map(target=>contextualInfoForUnchecked(result,target));
  const patternCandidates=discoverReadingPatterns(index,{use:input.use,capability:input.capability,variantId:input.variantId}).map(p=>{
    const excluded=p.sourceRefs.some(s=>{const u=getMeaningUnit(s.recordId,s.variantId);return !!u&&excludedField(u,s.fieldKey);});
    if(!excluded)return p;
    const adjusted={...p,status:"withheld" as const,withheldReasonCodes:unique([...p.withheldReasonCodes,"KNOWN_SOURCE_FIELD_EXCLUSION"])};
    const {patternId,...body}=adjusted;return {...body,patternId:`pattern:${contentHash(body)}`};
  });
  const traced=Object.assign(result,{trace:Object.assign(result.trace,{patternCandidates})});
  if(discovery){
    Object.assign(traced.trace,{relationalDiscovery:discovery.trace,meaningUtilization:meaningUtilization(discovery.trace,plan.insights,graph.claims,paragraphs)});
    if(!paragraphs.length&&discovery.trace.records.some(r=>r.status.startsWith('eligible'))){
      traced.notices=traced.notices.filter(n=>n.code!=='NO_SUPPORTED_MEANING');
      traced.notices.push({code:'SYNTHESIS_RULE_GAP',text:'Eligible source meanings are present, but no supported relationship was selected by the current discovery operations. This is a synthesis gap, not evidence that the source content is missing.'});
    }
    if(plan.depthStatus==='insufficient-supported-depth')traced.notices=traced.notices.map(n=>n.code==='INSUFFICIENT_SUPPORTED_DEPTH'?{code:n.code,text:'The current discovery pass did not develop three distinct Standard themes or two additional Deep relationships. The actual supported themes are retained; source, approval and synthesis gaps are reported separately in discovery coverage.'}:n);
  }
  traced.integrityHash=integrity(traced);return freezeReadingValue(traced);
}
function integrity(result:ReadingEngineResult){const {integrityHash,...body}=result;return contentHash(body);}
function contextualInfoForUnchecked(result:ReadingEngineResult,target:ReadingSelection):ContextInfo{
  validateSelection(result.index,target);const selected=result.claims.filter(c=>relevantClaim(c,target,result.index));
  const meaning=selected.filter(c=>c.kind==="sourced-symbolic").map(c=>({text:c.text,claimIds:[c.claimId]}));
  const contextual=selected.filter(c=>c.kind==="conditional-synthesis"||c.kind==="computed-fact").map(c=>({text:c.text,claimIds:[c.claimId]}));
  return {target,requestDigest:result.plan.requestDigest,meaning,inThisChart:contextual,evidence:uniqueSources(selected.flatMap(c=>c.sources)).map(safeEvidence),unavailableReasonCodes:unique(["MODIFIER_SOURCE_MISSING",...(!meaning.length?["NO_SUPPORTED_MEANING"]:[]),...(target.kind==="activation"&&result.index.activations.some(a=>a.id===target.activationId&&!a.exactLineEligible)?["EXACT_LINE_WITHHELD"]:[])])};
}
export function contextualInfoFor(result:ReadingEngineResult,target:ReadingSelection,input:ReadingInput):ContextInfo{
  if(!input)readingFail("UNTRUSTED_ISSUANCE","Current issued chart inputs and preview permission are required to display contextual meaning.");
  validateReadingForRender(result,input);
  return contextualInfoForUnchecked(result,target);
}
/** Serialized/cache content must be reproduced against a current issued index and capability. */
export function validateReadingForRender(result:ReadingEngineResult,input:ReadingInput):ReadingEngineResult{
  if(!result||result.schema!=="AuricReadingEngineResultV1"||integrity(result)!==result.integrityHash)readingFail("UNSUPPORTED_VISIBLE_CLAIM","The saved reading has changed and cannot be rendered.");
  const fresh=generateReading(input);
  if(contentHash(result)!==contentHash(fresh))readingFail(result.plan.contentReleaseHash!==fresh.plan.contentReleaseHash?"REVOKED_CONTENT":"REQUEST_CONTEXT_MISMATCH","The reading no longer matches the current chart, content, policy or preview permissions.");
  validateRealizedParagraphs(result.paragraphs,result.plan.chapters,result.plan.insights,result.claims);return fresh;
}
