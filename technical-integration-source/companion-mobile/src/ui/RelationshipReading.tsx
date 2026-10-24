import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { relationshipClaimTrace, type RelationshipContext, type RelationshipReportV1, type ReportRequestV1 } from "../intelligence/relationship";
import { readingRequestForSave, type RelationshipDraft } from "./relationship-reading-model";
import { theme } from "./theme";
import { structuralReading, structuralClaimTrace } from "../intelligence/relationship-structural";
import type { CompositeSelection } from "./composite-workspace-model";
import { relationshipReadingPresentation } from "./relationship-reading-presentation";
import { adaptiveRelationshipReading, type ReaderFinding, type ReaderNarrative } from "../intelligence/relationship-reader";
import { readingGlosses, type ReaderPreferencesV1 } from "../intelligence/reader-preferences";
import { visibleReaderFindings } from "../intelligence/reader-presentation";
import { EvidenceButton, ReadingEvidence } from "./ReadingEvidence";
import { ContextInfoButton } from "./ContextualInfo";
import { gateRef } from "../intelligence/mechanics-references";
import { labelMechanics } from "../intelligence/reader-names";

type Props={preferences:ReaderPreferencesV1;onPreferences:(p:ReaderPreferencesV1)=>Promise<void>;calculation:CompositeCalculationV1;report:RelationshipReportV1;level:"compact"|"expanded"|"full";names:Record<string,string>;draft:RelationshipDraft;
 onDraft:(patch:Partial<RelationshipDraft>)=>void;onContext:(context:RelationshipContext)=>void;
 canSave:boolean;onSave:(request:ReportRequestV1)=>Promise<boolean>;disclosures:Record<string,boolean>;onDisclosure:(key:string)=>void;onSelect:(selection:CompositeSelection)=>void;onExplore:()=>void;onFullReading:()=>void;onTrace:()=>void};
function Control({label,onPress,selected=false,disabled=false}: {label:string;onPress:()=>void;selected?:boolean;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}
  style={[s.control,selected&&s.selected,disabled&&{opacity:.5}]}><Text style={s.text}>{label}</Text></Pressable>;
}
function LegacyClaimTrace({trace,report,names,embedded=false}:{trace:ReturnType<typeof relationshipClaimTrace>;report:RelationshipReportV1;names:Record<string,string>;embedded?:boolean}) {
 const claim=trace.claim;
 return <View testID="relationship-claim-trace" style={[s.trace,embedded&&{borderLeftWidth:0,paddingLeft:0}]}>
  <Text style={s.heading}>{embedded?"Original mechanics provenance":"Mechanics Trace"}</Text>
  <Text style={s.small}>Subjects: {claim.subjectPersonIds.map(id=>names[id]||id).join(", ")} · scope {claim.scope} · {claim.status}</Text>
  <Text style={s.small}>Claim {claim.id} · rule {claim.ruleVersion}</Text>
  <Text style={s.small}>Calculation {report.request.calculationId} · facts {report.request.factsHash}</Text>
  <Text style={s.small}>Catalog {report.request.catalogSHA256} · canonical {report.request.canonicalSHA256}</Text>
  <Text style={s.heading}>{claim.kind==="canonicalInterpretation"&&claim.status==="insufficientEvidence"?"Actual mechanical context; not evidence for withheld interpretation":claim.kind==="deterministicFact"?"Structural support":claim.kind==="userReportedExperience"?"Reported experience; no chart causation asserted":"Mechanical context; not evidence of a personal experience"}</Text>
  {trace.supportingContributions.map(c=><Text key={c.id} style={s.text}>{c.personId===report.request.roles[0]?"A":"B"} · {names[c.personId]} · {c.planet} · {c.gate}.{c.line} · {c.side==="design"?"Design":"Personality"}{"\n"}{c.id}</Text>)}
  {!trace.supportingContributions.length&&<Text style={s.small}>No supporting planetary activation is claimed.</Text>}
  {trace.facts.map(f=><Text key={f.id} style={s.small}>{f.predicate} · {f.id}</Text>)}
  <Text style={s.heading}>Calculation inputs · not claim support</Text>
  {trace.calculationInputs.map(input=><Text key={input.personId} style={s.small}>{names[input.personId]} · revision {input.chartVersionId} · snapshot {input.snapshotHash}</Text>)}
  {trace.sources.map(source=><Text key={source.id} style={s.small}>{source.title} · {source.id} · {source.status}{"\n"}{source.reason}</Text>)}
  {!trace.sources.length&&<Text style={s.small}>No canonical source is asserted as supporting this claim.</Text>}
  {claim.alternatives.map(text=><Text key={text} style={s.small}>{text}</Text>)}
  {claim.nonclaims.map(text=><Text key={text} style={s.small}>{text}</Text>)}
 </View>;
}
export function RelationshipReading({preferences,onPreferences,calculation,report,level,names,draft,onDraft,onContext,canSave,onSave,disclosures,onDisclosure,onSelect,onExplore,onFullReading,onTrace}:Props) {
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [evidence,setEvidence]=useState<ReaderFinding|ReaderNarrative|null>(null);
 const closeEvidence=useCallback(()=>setEvidence(null),[]);
 const expanded=level!=="compact";
 const structural=useMemo(()=>report.status==="ready"?structuralReading(calculation,report):null,[calculation,report]);
 const {groups,legacyClaims}=relationshipReadingPresentation(report,structural,level);
 const adapted=useMemo(()=>report.status==="ready"?adaptiveRelationshipReading(calculation,report,preferences,names):null,[calculation,report,preferences,names]);
 async function preference(patch:Partial<ReaderPreferencesV1>){try{await onPreferences({...preferences,...patch});setNotice("");}catch(e){setNotice((e as Error).message);}}
 const labels:Record<string,string>={deterministicFact:"Calculated mechanic",derivedHypothesis:"Reflection question · not a prediction",canonicalInterpretation:"Sourced teaching · withheld",userReportedExperience:"Consented observation · self-report"};
 async function save(){setSaving(true);setNotice("");try{const clean=await onSave(readingRequestForSave(report,new Date().toISOString()));setNotice(clean?"Reading request saved. Reports are recomputed from pinned evidence.":"Request committed; old storage cleanup is pending.");}catch(e){setNotice(`Save failed: ${(e as Error).message}`);}finally{setSaving(false);}}
 return <View testID="relationship-reading" style={s.root}>
  <Text testID="relationship-reading-scope" style={s.small}>{names[report.request.roles[0]]} + {names[report.request.roles[1]]} · {report.request.context} · {report.request.scope} · {preferences.depth}</Text>
  {report.eligibility==="provisional-point"&&<Text accessibilityRole="alert" style={s.warning}>Provisional point reading: approximate birth time is not a tested uncertainty range.</Text>}
  {report.status!=="ready"?<Text accessibilityRole="alert" style={s.warning}>{report.reason} No generic reading is substituted.</Text>:<>
   {adapted&&<View testID="adaptive-reading" style={{gap:12}}>
    {report.request.selection.kind==="overview"&&<View testID="reading-narrative" style={s.claim}>
     <View style={s.titleRow}><Text accessibilityRole="header" style={s.headline}>{adapted.narrative.headline}</Text><EvidenceButton title={adapted.narrative.headline} onPress={()=>setEvidence(adapted.narrative)}/></View>
     {adapted.narrative.paragraphs.map((text,i)=><Text key={i} style={s.text}>{text}</Text>)}
     {preferences.researchMode===true&&<Control label="Research: opening trace" onPress={()=>setEvidence(adapted.narrative)}/>}
    </View>}
    {adapted.semantic&&<>
     <View style={s.wrap}><ContextInfoButton calculation={calculation} names={names} target={{kind:"definition",id:"combined"}} label="Definition"/></View>
     {adapted.semantic.chapters.map(chapter=><View key={chapter.id} testID={`reading-chapter-${chapter.topic}`} style={s.claim}>
      <View style={s.titleRow}><Text accessibilityRole="header" style={s.heading}>{chapter.title}</Text><EvidenceButton title={chapter.title} onPress={()=>setEvidence({id:chapter.id,title:chapter.title,summary:chapter.paragraphs[0],details:chapter.paragraphs.slice(1),selection:chapter.channelIds[0]?{kind:"channel",id:chapter.channelIds[0]}:{kind:"overview"},factIds:chapter.factIds,contributionIds:chapter.contributionIds,claimIds:[],kind:"structural"})}/></View>
      {chapter.paragraphs.map((text,i)=><Text key={i} style={s.text}>{text}</Text>)}
      {!!chapter.channelIds.length&&<View style={s.wrap}>{chapter.channelIds.slice(0,2).map(id=><ContextInfoButton key={id} calculation={calculation} names={names} target={{kind:"channel",id}}/>)}</View>}
     </View>)}
     {preferences.depth!=="quick"&&<View testID="activation-learning" style={{gap:6}}>
      <Text style={s.heading}>Explore the exact contributions</Text>
      <View style={s.wrap}>{calculation.facts.contributions.filter(a=>adapted.semantic!.contextActivationIds.includes(a.id)).map(a=><ContextInfoButton key={a.id} calculation={calculation} names={names} target={{kind:"activation",id:a.id}} label={`${names[a.personId]} · ${a.side==="personality"?"Personality":"Design"} ${a.planet} · ${gateRef(a.gate,!a.boundaryRisk&&a.uncertaintyRef.eligibility==="exact-point"?a.line:undefined)}`}/>)}</View>
     </View>}
     <Control label={disclosures.readingLenses?"Hide relationship lenses":"Relationship lenses"} onPress={()=>onDisclosure("readingLenses")}/>
     {disclosures.readingLenses&&<View testID="reading-lens-status" style={{gap:8}}>{adapted.semantic.unavailable.map(lens=><View key={lens.topic}><Text style={s.heading}>{lens.topic}</Text><Text style={s.small}>{lens.reason}</Text></View>)}</View>}
    </>}
    {!adapted.semantic&&visibleReaderFindings(adapted,preferences.depth,false).map(finding=><View key={finding.id} style={s.claim} testID="reader-finding">
     <View style={s.titleRow}><Text style={s.heading}>{finding.title}</Text><EvidenceButton title={finding.title} onPress={()=>setEvidence(finding)}/></View><Text style={s.text}>{finding.summary}</Text>
     {(preferences.depth!=="quick"?finding.details:report.request.selection.kind!=="overview"?finding.details.slice(0,1):[]).map((text,i)=><Text key={i} style={s.text}>{text}</Text>)}
     <Control label="Highlight in BodyGraph" onPress={()=>onSelect(finding.selection)}/>
     {preferences.researchMode===true&&<Text style={s.small}>Structural facts: {finding.factIds.join(", ")}</Text>}
    </View>)}
    <View style={s.wrap}><Control label={`Explore all ${calculation.facts.channelRelations.filter(r=>r.formed).length} Channels`} onPress={onExplore}/></View>
    {!!readingGlosses(preferences,report.request.selection.kind).length&&<Control label={disclosures.glossary?"Hide unfamiliar terms":"Explain unfamiliar terms"} onPress={()=>onDisclosure("glossary")}/>}
    {disclosures.glossary&&<View testID="concept-glosses" style={{gap:6}}>{readingGlosses(preferences,report.request.selection.kind).map(gloss=><Text key={gloss.key} style={s.small}>{gloss.text}</Text>)}</View>}
    <View style={s.wrap}><Control label={disclosures.explain?"Hide explanation":"Explain this"} onPress={()=>onDisclosure("explain")}/><Control label="Give an example" onPress={()=>{void preference({teaching:"example"});if(!disclosures.explain)onDisclosure("explain");}}/></View>
    {disclosures.explain&&<Text style={s.text}>{labelMechanics(adapted.teaching,Object.values(names))} {preferences.terminology==="modern"?"Connected areas are traditionally called Definition islands.":preferences.terminology==="traditional"?"Definition refers to complete Channel connectivity, not simply Gate activation.":"Definition islands / connected areas: two vocabularies for the same graph, not different calculations."}</Text>}
    {preferences.astrologyBridge&&<Text style={s.small}>{preferences.astrology==="none"?"No astrology knowledge is needed.":"Planet names here label exact natal activations, not astrological compatibility aspects."} An HD Channel connects matching Gate endpoints; an astrology aspect compares planetary positions. No astrology relationship analysis is calculated here.</Text>}
    <Text style={s.text}>{adapted.prompt}</Text>{adapted.observation&&<Text testID="consented-reader-observation" style={s.text}>{adapted.observation}</Text>}
    <Text style={s.small}>{adapted.boundary}</Text>
   </View>}
   <Control label={`Context: ${report.request.context}`} onPress={()=>onDisclosure("contextChoice")}/>
   {disclosures.contextChoice&&<View style={s.wrap}>{(["general","friendship","romantic"] as const).map(context=><Control key={context} label={context[0].toUpperCase()+context.slice(1)} selected={report.request.context===context} onPress={()=>{setNotice("");onContext(context);}}/>)}</View>}
   <Control label={disclosures.originalEvidence?"Hide original report evidence":"Original report evidence"} onPress={()=>onDisclosure("originalEvidence")}/>
   {disclosures.originalEvidence&&<>
   {groups.map(({claim,legacyAlias})=>{
    const key=legacyAlias?`relationship-claim:${legacyAlias.id}`:`structural:${claim.id}`,open=!!disclosures[key];
    const trace=open?structuralClaimTrace(calculation,report,structural!,claim.id):null;
    const originalTrace=open&&legacyAlias?relationshipClaimTrace(calculation,report,legacyAlias.id):null;
    return <View key={claim.id} style={s.claim} testID={`structural-claim-${claim.ruleId}`}>
     <Text style={s.heading}>{claim.title}</Text>{adapted?.findings.some(f=>f.claimIds.includes(claim.id))?<Text style={s.small}>This explanation is shown in the reading above. Original claim provenance is retained below.</Text>:<Text style={s.text}>{claim.summary}</Text>}
     {expanded&&claim.details.map((text,i)=><Text key={i} style={s.text}>{text}</Text>)}
     {claim.selection.kind==="witness"&&<Control label={`Inspect connection · ${claim.subjectPersonIds.map(id=>names[id]||id).join(", ")}`} onPress={()=>onSelect(claim.selection)}/>}
     <Control label={`${open?"Hide":"Show"} trace · ${legacyAlias?"mechanics":claim.title}`} onPress={()=>onDisclosure(key)}/>
     {trace&&<View testID="structural-claim-trace" style={s.trace}>
      <Text style={s.heading}>Structural support</Text>
      <Text style={s.small}>Claim {claim.id} · {claim.ruleId} · {structural!.version} · {structural!.calculationId}{"\n"}Facts {structural!.factsHash}</Text>
      {trace.contributions.map(c=><Text key={c.id} style={s.text}>{c.personId===report.request.roles[0]?"A":"B"} · {names[c.personId]} · {c.planet} · {c.gate}.{c.line} · {c.side==="design"?"Design":"Personality"}{"\n"}{c.id}</Text>)}
      {trace.facts.map(f=><Text key={f.id} style={s.small}>{f.predicate} · {f.id}</Text>)}
      <Text style={s.heading}>Interpretive support</Text><Text style={s.small}>None. This explains calculated structure; no psychological interpretation is asserted.</Text>
      <Text style={s.heading}>Calculation inputs · not claim support</Text>
      {trace.provenance.calculationDependency.map(input=><Text key={input.personId} style={s.small}>{names[input.personId]} · revision {input.chartVersionId} · snapshot {input.snapshotHash}</Text>)}
      {originalTrace&&<LegacyClaimTrace trace={originalTrace} report={report} names={names} embedded/>}
     </View>}
    </View>;
   })}
   {legacyClaims.map(claim=>{
    const key=`relationship-claim:${claim.id}`,open=!!disclosures[key];
    const trace=open?relationshipClaimTrace(calculation,report,claim.id):null;
    return <View key={claim.id} style={s.claim} testID={`relationship-claim-${claim.id.split(":").at(-1)}`}>
     <Text style={s.small}>{labels[claim.kind]}</Text><Text style={s.text}>{claim.text}</Text>
     <Control label={`${open?"Hide":"Show"} trace · ${claim.id.split(":").slice(2).join(":")}`} onPress={()=>onDisclosure(key)}/>
     {trace&&<LegacyClaimTrace trace={trace} report={report} names={names}/>}
    </View>;
   })}
   </>}
   {structural&&<View testID="advanced-coverage" style={s.claim}>
    <Control label={disclosures.advancedCoverage?"Hide advanced reading coverage":"Show advanced reading coverage"} onPress={()=>onDisclosure("advancedCoverage")}/>
    {disclosures.advancedCoverage&&<>
     <Text style={s.heading}>Relationship lenses</Text>
     {structural.coverage.lenses.map(item=><Text key={item.id} style={s.small}>{item.label} · interpretation unavailable</Text>)}
     <Text style={s.heading}>Friction pathways</Text>
     {structural.coverage.pathways.map(item=><View key={item.id} style={{gap:4}}><Text style={s.text}>{item.label}</Text>{item.fields.map(field=><Text key={field.id} style={s.small}>{field.label} · interpretation unavailable</Text>)}</View>)}
     <Text style={s.heading}>Relationship synthesis</Text>
     {structural.coverage.synthesis.map(item=><Text key={item.id} style={s.small}>{item.label} · advanced synthesis unavailable</Text>)}
    </>}
   </View>}
  </>}
  {expanded&&<View style={s.claim}>
   <TextInput accessibilityLabel="Local relationship question" value={draft.question} maxLength={600} onChangeText={question=>{setNotice("");onDraft({question});}} placeholder="Explain these mechanics" placeholderTextColor={theme.muted} style={s.input}/>
   <TextInput accessibilityLabel="Private relationship observation" value={draft.observationText} maxLength={600} multiline onChangeText={observationText=>{setNotice("");onDraft({observationText,consented:false});}} placeholder="Optional personal observation" placeholderTextColor={theme.muted} style={s.input}/>
   <Pressable accessibilityRole="checkbox" accessibilityLabel="Include my observation in this local reading request" accessibilityState={{checked:draft.consented}} onPress={()=>onDraft({consented:!draft.consented})} style={s.control}>
    <Text style={s.text}>{draft.consented?"[x]":"[ ]"} Include my observation in this local reading request</Text>
   </Pressable>
   {!!draft.observationText&&<Control label="Clear observation and withdraw consent" onPress={()=>onDraft({observationText:"",consented:false})}/>}
   <Text style={s.small}>Nothing is retained automatically. Saving records only this request and any explicitly included observation, not generated report text.</Text>
  </View>}
  <Control label={saving?"Saving reading request":"Save reading request"} disabled={saving||!canSave||report.status!=="ready"} onPress={()=>void save()}/>
  {!canSave&&<Text style={s.small}>Save this relationship revision before retaining a reading request.</Text>}
  {!!notice&&<Text accessibilityLiveRegion="polite" style={s.small}>{notice}</Text>}
  {disclosures.originalEvidence&&report.nonclaims.map(text=><Text key={text} style={s.small}>{text}</Text>)}
  {evidence&&<ReadingEvidence value={evidence} calculation={calculation} names={names} roles={report.request.roles} onClose={closeEvidence} onExplore={()=>{closeEvidence();onExplore();}} onTrace={()=>{closeEvidence();onTrace();}}/>}
 </View>;
}
const fontFamily=Platform.OS==="web"?"system-ui":undefined;
const s=StyleSheet.create({
 root:{gap:12,minWidth:0},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},
 titleRow:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:6},headline:{fontFamily,fontSize:22,lineHeight:30,fontWeight:"700",color:theme.text,flexShrink:1},
 heading:{fontFamily,fontSize:17,lineHeight:25,fontWeight:"700",color:theme.text},
 text:{fontFamily,fontSize:16,lineHeight:24,color:theme.text,flexShrink:1},
 small:{fontFamily,fontSize:14,lineHeight:22,color:theme.muted,flexShrink:1},
 warning:{fontFamily,fontSize:16,lineHeight:24,color:theme.uncertain,flexShrink:1},
 claim:{gap:8,paddingVertical:10,borderBottomWidth:1,borderColor:theme.border},
 trace:{gap:10,borderLeftWidth:2,borderColor:theme.border,paddingLeft:10,minWidth:0},
 control:{minHeight:44,justifyContent:"center",paddingVertical:8,paddingHorizontal:10,borderWidth:1,borderColor:theme.border,borderRadius:4,alignSelf:"flex-start",maxWidth:"100%"},
 selected:{backgroundColor:theme.surfaceRaised,borderColor:theme.accent},
 input:{fontFamily,minHeight:44,borderWidth:1,borderColor:theme.border,borderRadius:4,padding:10,color:theme.text,fontSize:16,lineHeight:24,width:"100%"},
});
