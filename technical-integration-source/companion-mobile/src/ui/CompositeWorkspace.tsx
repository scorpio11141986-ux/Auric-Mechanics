import type {LocalReaderTarget} from "./SavedReadingExperience";
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { CENTER_NAMES, type Person } from "../domain/contracts";
import type { CompositeCalculationV1, CompositeContributionV1 } from "../domain/composite-contracts";
import { calculateComposite, snapshotFromPerson } from "../domain/composite";
import { byId, runtime } from "../content/records";
import { inferenceDisposition } from "../content/inference-policy";
import type { CompositeAppStateV2, RelationshipV1 } from "../persistence/composite-state";
import { rebuildComposite, hasNewerNatalRevision } from "../persistence/composite-state";
import { CompositeBodyGraph } from "./CompositeBodyGraph";
import { BridgeExplorer } from "./BridgeExplorer";
import { RelationshipReading } from "./RelationshipReading";
import { relationshipReadingFor, workspaceFromReading, relationshipDraftKey, EMPTY_RELATIONSHIP_DRAFT, type RelationshipDraft } from "./relationship-reading-model";
import { type RelationshipReadingEntryV1, type ReportRequestV1 } from "../intelligence/relationship";
import { COMPOSITE_COLORS, FUTURE_SCOPES, actualCompletions, actorFor, eligibleSelection, selectionEligibility,
  graphFor, tracePresentation, visibleContributions, type CompositeMode, type CompositeScope, type CompositeSelection } from "./composite-workspace-model";
import { compositeReader, compositeReaderKey, compositeReadingSelection, compositeReducer, initialCompositeWorkspace, scopeAvailable } from "./composite-workspace-state";
import { theme } from "./theme";
import type { ReaderPreferencesV1 } from "../intelligence/reader-preferences";
import { ReaderPreferences } from "./ReaderPreferences";
import { ConnectionExplorer } from "./ConnectionExplorer";
import { ActualBridgeReading } from "./ActualBridgeReading";
import type { ConnectionQuery } from "../intelligence/connection-inventory";
import { ContextInfoButton, type ContextInfoTarget } from "./ContextualInfo";
import { contextActivationLabel } from "../intelligence/contextual-reader-info";
import { channelRef, gateRef } from "../intelligence/mechanics-references";
import { Ionicons } from "@expo/vector-icons";
import { compactGraphHeight } from "./compact-bodygraph-layout";
import { composeReaderChapters } from "../intelligence/reader-chapters";
import { FAMILIARITY } from "../intelligence/reader-preferences";

type Props = {
  onLocalReadingTarget?:(target:LocalReaderTarget|null)=>void;
  onOpenLocalReading?:(target:LocalReaderTarget)=>void;
  state: CompositeAppStateV2;
  preferences:ReaderPreferencesV1;
  onPreferences:(p:ReaderPreferencesV1)=>Promise<void>;
  compareTarget?:{id:string;revision:number}|null;
  onSave: (calculation: CompositeCalculationV1, roles: [string,string]) => Promise<{relationship:RelationshipV1;cleanupComplete:boolean}>;
  onUpdateRelationship: (relationshipId:string, patch:{displayParticipantIds?:[string,string];label?:string;selectedCalculationId?:string}) => Promise<boolean>;
  onDeleteRelationship: (relationshipId:string) => Promise<boolean>;
  onExport: (relationship:RelationshipV1) => Promise<void>;
  onSaveReading: (calculation:CompositeCalculationV1, request:ReportRequestV1) => Promise<boolean>;
};
const selectionLabel=(selection:CompositeSelection):string=>selection.kind==="overview"?"Overview":selection.kind==="gate"?gateRef(selection.gate):selection.kind==="activation"?"Exact activation":selection.kind==="channel"?channelRef(selection.id):selection.kind==="center"?`${CENTER_NAMES[selection.id]} Center`:selection.kind==="component"?"Definition island":selection.kind==="motor"?`${CENTER_NAMES[selection.motor]} → Throat route`:"Actual island join";
const contextTarget=(selection:CompositeSelection):ContextInfoTarget|null=>selection.kind==="gate"?{kind:"gate",id:String(selection.gate)}:selection.kind==="activation"||selection.kind==="channel"||selection.kind==="center"?{kind:selection.kind,id:selection.id}:selection.kind==="component"||selection.kind==="witness"?{kind:"definition",id:selection.id}:null;
const exactContributionLabel=(c:CompositeContributionV1,roles:[string,string],names:Record<string,string>)=>`${actorFor(c.personId,roles)} ${names[c.personId]||"Participant"} · ${contextActivationLabel(c)}`;
const short=(id:string)=>id.length>16?`${id.slice(0,8)}…${id.slice(-6)}`:id;
function Action({name,onPress,onPreview,selected=false,disabled=false,testID}: {name:string;onPress:()=>void;onPreview?:(active:boolean)=>void;selected?:boolean;disabled?:boolean;testID?:string}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}
    onHoverIn={()=>onPreview?.(true)} onHoverOut={()=>onPreview?.(false)} onFocus={()=>onPreview?.(true)} onBlur={()=>onPreview?.(false)}
    style={[styles.action,selected&&styles.actionSelected,disabled&&{opacity:.48}]}><Text style={[styles.actionText,selected&&{fontWeight:"700"}]}>{name}</Text></Pressable>;
}
function PersonPicker({label,people,value,onChange}: {label:string;people:Person[];value:string;onChange:(id:string)=>void}) {
  return <View style={styles.picker}><Text style={styles.small}>{label}</Text><View style={styles.wrap}>{people.map(p=><Action key={p.birth.id} name={people.filter(other=>other.birth.name===p.birth.name).length>1?`${p.birth.name} · ${short(p.birth.id)}`:p.birth.name} selected={value===p.birth.id} onPress={()=>onChange(p.birth.id)}/>)}</View></View>;
}
function VersionPicker({person,value,onChange}: {person:Person|null;value:string;onChange:(id:string)=>void}) {
  const versions=person?.versions?.length?person.versions:[person?{id:`${person.birth.id}:${person.birth.updatedAt}`,birth:person.birth,facts:person.facts}:null].filter(Boolean) as NonNullable<Person["versions"]>;
  return <View style={styles.picker}><Text style={styles.small}>Pinned chart version · {person?.birth.name||"choose person"}</Text><View style={styles.wrap}>{versions?.map((v,i)=><Action key={v.id} name={`${i+1}. ${v.birth.date} · ${v.birth.confidence} · ${short(v.id)}`} selected={value===v.id} onPress={()=>onChange(v.id)}/>)}</View></View>;
}
export function CompositeWorkspace({onLocalReadingTarget,onOpenLocalReading,state,preferences,compareTarget,onPreferences:updatePreferences,onSave,onUpdateRelationship,onDeleteRelationship,onExport,onSaveReading}:Props) {
  const people=state.people;
  const [aId,setAId]=useState(people[0]?.birth.id||""),[bId,setBId]=useState(people[1]?.birth.id||"");
  const a=people.find(p=>p.birth.id===aId)||null,b=people.find(p=>p.birth.id===bId)||null;
  const [aVersion,setAVersion]=useState(a?.activeChartVersionId||""),[bVersion,setBVersion]=useState(b?.activeChartVersionId||"");
  const [calculation,setCalculation]=useState<CompositeCalculationV1|null>(null);
  useEffect(()=>{if(!calculation)onLocalReadingTarget?.(null);},[calculation,onLocalReadingTarget]);
  const [roles,setRoles]=useState<[string,string]>([aId,bId]);
  const [openNonce,setOpenNonce]=useState(0),[message,setMessage]=useState("");
  const [activeRelationshipId,setActiveRelationshipId]=useState<string|null>(null),[confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [labelDraft,setLabelDraft]=useState("");
  const [initialReading,setInitialReading]=useState<RelationshipReadingEntryV1|null>(null);
  const [setupOpen,setSetupOpen]=useState(false);
  const [versionsOpen,setVersionsOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
  useEffect(()=>{
    if(!compareTarget)return;
    const first=people.find(p=>p.birth.id===compareTarget.id),second=people.find(p=>p.birth.id!==compareTarget.id);
    if(!first||!second)return;
    setAId(first.birth.id);setBId(second.birth.id);setAVersion(first.activeChartVersionId||`${first.birth.id}:${first.birth.updatedAt}`);setBVersion(second.activeChartVersionId||`${second.birth.id}:${second.birth.updatedAt}`);
    setCalculation(null);setActiveRelationshipId(null);setInitialReading(null);setSetupOpen(true);
  },[compareTarget]);
  const outerScroll=useRef<ScrollView>(null),outerY=useRef(0);
  const viewport=useRef<View>(null),chartTarget=useRef<View>(null),readTarget=useRef<View>(null),listTarget=useRef<View>(null);
  function jump(target:React.RefObject<View|null>){viewport.current?.measure((_x,_y,_w,_h,_px,top)=>target.current?.measure((_a,_b,_c,_d,_e,y)=>outerScroll.current?.scrollTo({y:Math.max(0,outerY.current+y-top-12),animated:false})));}
  const relationship=state.relationships.find(r=>r.relationshipId===activeRelationshipId)||null;
  useEffect(()=>{if(calculation&&calculation.inputs.some(input=>!state.people.some(p=>p.birth.id===input.personId))){setCalculation(null);setActiveRelationshipId(null);setMessage("A participant was deleted. This comparison is closed; no stale chart remains visible.");}},[state.people,calculation]);
  useEffect(()=>{if(a&&!a.versions?.some(v=>v.id===aVersion))setAVersion(a.activeChartVersionId||`${a.birth.id}:${a.birth.updatedAt}`);},[a,aVersion]);
  useEffect(()=>{if(b&&!b.versions?.some(v=>v.id===bVersion))setBVersion(b.activeChartVersionId||`${b.birth.id}:${b.birth.updatedAt}`);},[b,bVersion]);
  function compare() {
    setMessage("");
    try {
      if(!a||!b||a.birth.id===b.birth.id)throw Error("Choose two distinct saved people.");
      const first=snapshotFromPerson(a,aVersion),second=snapshotFromPerson(b,bVersion);
      const next=calculateComposite(first,second);
      setInitialReading(null);
      setLabelDraft(state.relationships.find(r=>r.relationshipId===next.relationshipId)?.label||"");
      setCalculation(next);setRoles([a.birth.id,b.birth.id]);setActiveRelationshipId(state.relationships.find(r=>r.relationshipId===next.relationshipId)?.relationshipId||null);
      setOpenNonce(n=>n+1);setMessage(next.status==="complete-provisional-point"?"Provisional point calculation: approximate birth time or boundary uncertainty remains visible.":"Calculated from two validated, pinned natal revisions.");
    }catch(e){setCalculation(null);setMessage((e as Error).message);}
  }
  function reopen(rel:RelationshipV1,revisionId=rel.selectedCalculationId){
    try{
      setInitialReading(null);
      const result=rebuildComposite(state,rel,revisionId);
      const refs=rel.revisions.find(r=>r.calculationId===revisionId)!.inputRefs;
      setAId(rel.displayParticipantIds[0]);setBId(rel.displayParticipantIds[1]);
      setAVersion(refs.find(r=>r.personId===rel.displayParticipantIds[0])!.chartVersionId);
      setBVersion(refs.find(r=>r.personId===rel.displayParticipantIds[1])!.chartVersionId);
      setCalculation(result);setRoles([...rel.displayParticipantIds]);setActiveRelationshipId(rel.relationshipId);setLabelDraft(rel.label);setOpenNonce(n=>n+1);
      setMessage(rel.revisions.length>1?`Opened pinned revision ${short(revisionId)}. Newer charts do not replace it automatically.`:"Opened the exact pinned relationship revision.");
    }catch(e){setCalculation(null);setMessage((e as Error).message);}
  }
  function reopenReading(entry:RelationshipReadingEntryV1){
    try{
      const rel=state.relationships.find(r=>r.relationshipId===entry.request.relationshipId);
      if(!rel)throw Error("Saved relationship is unavailable.");
      const result=rebuildComposite(state,rel,entry.request.calculationId);
      const restored=workspaceFromReading(result,entry);
      setAId(restored.roles[0]);setBId(restored.roles[1]);
      setAVersion(entry.request.inputRefs.find(r=>r.personId===restored.roles[0])!.chartVersionId);
      setBVersion(entry.request.inputRefs.find(r=>r.personId===restored.roles[1])!.chartVersionId);
      setCalculation(result);setRoles(restored.roles);setActiveRelationshipId(rel.relationshipId);setLabelDraft(rel.label);
      setInitialReading(entry);setOpenNonce(n=>n+1);
      setMessage("Recomputed the saved request against its exact pinned revision. Display order and current charts do not reinterpret it.");
    }catch(e){setCalculation(null);setMessage(`Saved reading unavailable: ${(e as Error).message}`);}
  }
  const newer=!!relationship&&!!calculation&&hasNewerNatalRevision(state,calculation);
  return <View ref={viewport} testID="composite-workspace" style={styles.root}>
    <ScrollView ref={outerScroll} onScroll={e=>{outerY.current=e.nativeEvent.contentOffset.y;}} scrollEventThrottle={80} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      {!calculation&&<Text style={styles.h1}>Compare people</Text>}
      {calculation&&<Action name={setupOpen?"Hide people and preferences":"Customize reading or change people"} onPress={()=>setSetupOpen(v=>!v)}/>}
      {(!calculation||setupOpen)&&<>
      <ReaderPreferences value={preferences} onSave={updatePreferences}/>
      <Text style={styles.small}>Select two saved people and exact chart versions. Mechanics stay pinned until you choose Recalculate.</Text>
      {people.length<2?<Text style={styles.warning}>Save two distinct calculated charts in People before comparing.</Text>:<>
        <View style={styles.compareRow}><PersonPicker label="Person A" people={people} value={aId} onChange={id=>{setAId(id);setAVersion(state.people.find(p=>p.birth.id===id)?.activeChartVersionId||"");}}/>
          <PersonPicker label="Person B" people={people} value={bId} onChange={id=>{setBId(id);setBVersion(state.people.find(p=>p.birth.id===id)?.activeChartVersionId||"");}}/></View>
        <Action name={versionsOpen?"Hide chart version details":"Chart version details"} onPress={()=>setVersionsOpen(v=>!v)}/>
        {versionsOpen&&<View style={styles.compareRow}><VersionPicker person={a} value={aVersion} onChange={setAVersion}/><VersionPicker person={b} value={bVersion} onChange={setBVersion}/></View>}
        <Action name={calculation?"Recalculate selected versions":"Compare selected charts"} onPress={compare}/>
      </>}
      </>}
      {!!message&&(!calculation||setupOpen||message.includes("failed"))&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
      {(!!state.relationships.length||!!state.relationshipReadingHistory?.length)&&<Action name={historyOpen?"Hide saved relationships and requests":"Saved relationships and reading requests"} onPress={()=>setHistoryOpen(v=>!v)}/>}
      {historyOpen&&!!state.relationships.length&&<View style={styles.section}><Text style={styles.h2}>Saved relationships</Text>
        {state.relationships.map(rel=><View key={rel.relationshipId} style={styles.savedRow}>
          <Action name={`Open ${rel.label||rel.displayParticipantIds.map(id=>people.find(p=>p.birth.id===id)?.birth.name||short(id)).join(" + ")}`} onPress={()=>reopen(rel)}/>
          <Text style={styles.small}>{rel.revisions.length} immutable calculation {rel.revisions.length===1?"revision":"revisions"}</Text>
        </View>)}
      </View>}
      {historyOpen&&!!state.relationshipReadingHistory?.length&&<View style={styles.section}><Text style={styles.h2}>Saved reading requests</Text>
        {state.relationshipReadingHistory.slice().reverse().map((entry,i)=><View key={entry.id} style={styles.savedRow}>
          <Action name={`Open reading ${i+1} · ${entry.request.context} · ${selectionLabel(entry.request.selection)}`} onPress={()=>reopenReading(entry)}/>
          <Text style={styles.small}>{entry.request.mode} · {entry.request.scope} · {entry.request.requestedAt} · pinned {short(entry.request.calculationId)} · {entry.request.ruleVersion}</Text>
          {state.relationships.find(r=>r.relationshipId===entry.request.relationshipId)?.selectedCalculationId!==entry.request.calculationId&&<Text style={styles.warning}>Earlier pinned revision; not the current selected calculation.</Text>}
        </View>)}
      </View>}
      {calculation&&<CompositeResult onLocalReadingTarget={onLocalReadingTarget} onOpenLocalReading={onOpenLocalReading} preferences={preferences} onPreferences={updatePreferences} key={`${calculation.calculationId}/${openNonce}`} calculation={calculation} initialRoles={roles} initialReading={initialReading} people={people} relationship={relationship} newer={newer} outerScroll={outerScroll} outerY={outerY} chartTarget={chartTarget} readTarget={readTarget} listTarget={listTarget} onReading={()=>jump(readTarget)} onSaveReading={request=>onSaveReading(calculation,request)}
        onSave={async(display)=>{try{const saved=await onSave(calculation,display);setActiveRelationshipId(saved.relationship.relationshipId);setLabelDraft(saved.relationship.label);setMessage(saved.cleanupComplete?"Relationship saved and verified on this device.":"Relationship committed; old storage cleanup is pending. Reopen before assuming deletion is complete.");}catch(e){setMessage(`Save failed: ${(e as Error).message}`);}}}
        onSwap={async(display)=>{if(relationship)try{const clean=await onUpdateRelationship(relationship.relationshipId,{displayParticipantIds:display});setMessage(clean?"Display order saved.":"Display order committed; storage cleanup pending.");}catch(e){setMessage(`Could not save display order: ${(e as Error).message}`);}}}/>} 
      {relationship&&calculation&&<View style={styles.section}><Text style={styles.h2}>Manage relationship</Text>
        {newer&&<Text style={styles.warning}>A newer natal revision is available. The open pair still uses its pinned inputs. Select current versions and Recalculate to add a revision.</Text>}
        <TextInput accessibilityLabel="Relationship label" value={labelDraft} maxLength={140} onChangeText={setLabelDraft} placeholder="Optional private label" placeholderTextColor={theme.muted} style={styles.input}/>
        <View style={styles.wrap}><Action name="Save label" onPress={()=>void onUpdateRelationship(relationship.relationshipId,{label:labelDraft}).then(clean=>setMessage(clean?"Relationship label saved.":"Label committed; storage cleanup pending.")).catch(e=>setMessage((e as Error).message))}/>
          <Action name="Export redacted relationship receipt" onPress={()=>void onExport(relationship).catch(e=>setMessage((e as Error).message))}/></View>
        <Text style={styles.small}>Previous revisions remain pinned; selecting one does not recalculate or replace its facts.</Text>
        <View style={styles.wrap}>{relationship.revisions.map((r,i)=><Action key={r.calculationId} name={`Open revision ${i+1} · ${short(r.calculationId)}`} selected={r.calculationId===calculation.calculationId} onPress={()=>{reopen(relationship,r.calculationId);void onUpdateRelationship(relationship.relationshipId,{selectedCalculationId:r.calculationId}).catch(e=>setMessage((e as Error).message));}}/>)}</View>
        {confirmDelete===relationship.relationshipId?<View style={styles.wrap}><Text style={styles.warning}>Delete this relationship and all its managed calculation revisions? The two people remain saved.</Text>
          <Action name="Confirm relationship deletion" onPress={()=>void onDeleteRelationship(relationship.relationshipId).then(clean=>{setCalculation(null);setActiveRelationshipId(null);setConfirmDelete(null);setMessage(clean?"Relationship deleted from managed storage.":"Relationship deletion committed; storage cleanup pending.");}).catch(e=>setMessage((e as Error).message))}/>
          <Action name="Cancel deletion" onPress={()=>setConfirmDelete(null)}/></View>:<Action name="Delete relationship" onPress={()=>setConfirmDelete(relationship.relationshipId)}/>} 
      </View>}
    </ScrollView>
  </View>;
}

function CompositeResult({onLocalReadingTarget,onOpenLocalReading,preferences,onPreferences,calculation,initialRoles,initialReading,people,relationship,newer,onSave,onSwap,onSaveReading,outerScroll,outerY,chartTarget,readTarget,listTarget,onReading}: {onLocalReadingTarget?:(target:LocalReaderTarget|null)=>void;onOpenLocalReading?:(target:LocalReaderTarget)=>void;preferences:ReaderPreferencesV1;onPreferences:(p:ReaderPreferencesV1)=>Promise<void>;calculation:CompositeCalculationV1;initialRoles:[string,string];initialReading:RelationshipReadingEntryV1|null;people:Person[];relationship:RelationshipV1|null;newer:boolean;onSave:(roles:[string,string])=>Promise<void>;onSwap:(roles:[string,string])=>Promise<void>;onSaveReading:(request:ReportRequestV1)=>Promise<boolean>;outerScroll:React.RefObject<ScrollView|null>;outerY:React.RefObject<number>;chartTarget:React.RefObject<View|null>;readTarget:React.RefObject<View|null>;listTarget:React.RefObject<View|null>;onReading:()=>void}) {
  const [state,dispatch]=useReducer(compositeReducer,calculation,()=>initialReading?workspaceFromReading(calculation,initialReading):initialCompositeWorkspace(calculation,initialRoles));
  useEffect(()=>{onLocalReadingTarget?.({participants:state.roles.map(id=>({personId:id,chartVersionId:calculation.inputs.find(p=>p.personId===id)!.chartVersionId})),selection:compositeReadingSelection(state),mode:state.mode,relationshipContext:state.relationshipContext,calculation,origin:"Compare",nonce:0});},[calculation,state.roles,state.mode,state.relationshipContext,state.selection,state.fullCursor,onLocalReadingTarget]);
  const [drafts,setDrafts]=useState<Record<string,RelationshipDraft>>(()=>initialReading?{[relationshipDraftKey(workspaceFromReading(calculation,initialReading))]:{question:initialReading.request.question,observationText:initialReading.request.observation?.text||"",consented:!!initialReading.request.observation}}:{});
  const [selfId,setSelfId]=useState(initialRoles[0]),[traceOpen,setTraceOpen]=useState(false);
  const [focus,setFocus]=useState<"together"|"chart"|"reading"|"evidence">("together");
  const [connectionQuery,setConnectionQuery]=useState<ConnectionQuery>({});
  const [scopeOpen,setScopeOpen]=useState(false);
  const [optionsOpen,setOptionsOpen]=useState(false),[expandedChart,setExpandedChart]=useState(false);
  const [chartWidth,setChartWidth]=useState(0),[compareLevels,setCompareLevels]=useState(false);
  const expandOpener=useRef<any>(null);
  const [preferenceError,setPreferenceError]=useState("");
  const [mechanicsOpen,setMechanicsOpen]=useState(false);
  const [bridgeOpen,setBridgeOpen]=useState(false),[bridgeFullAt,setBridgeFullAt]=useState<string|null>(null);
  const fullOpener=useRef('composite-full-opener');
  const bridgeWorkspaceKey=`${state.contextKey}/${state.scope==='A'?state.roles[0]:state.scope==='B'?state.roles[1]:state.scope}`;
  const bridgeFull=state.readingLevel==='full'&&bridgeFullAt===bridgeWorkspaceKey;
  const bridgeVisible=state.readingLevel!=='full'||bridgeFull;
  const {width,height,fontScale}=useWindowDimensions();
  const sideBySide=width>=840&&height>=600&&fontScale<1.5;
  const railWidth=width>=1100?Math.min(620,width*.44):370;
  const compactChart=!sideBySide&&focus==="together"&&!expandedChart;
  const graphHeight=sideBySide?Math.max(350,Math.min(740,height-280)):compactChart?compactGraphHeight(chartWidth):Math.max(440,Math.min(700,height*.7));
  const graph=graphFor(calculation,state.mode,state.roles),selected=eligibleSelection(calculation,compositeReadingSelection(state),state.mode,state.roles,state.scope),reader=compositeReader(state),readerKey=compositeReaderKey(state);
  const draftKey=relationshipDraftKey(state),draft=drafts[draftKey]||EMPTY_RELATIONSHIP_DRAFT;
  // Report evidence depends on reading context, not hover, chart pan or scroll.
  const report=useMemo(()=>relationshipReadingFor(calculation,state,draft),[calculation,state.contextKey,state.roles,state.mode,state.scope,state.relationshipContext,state.selection,state.fullCursor,state.readingLevel,draft]);
  const calculatedDetails=reader.disclosures.calculatedDetails??false;
  const patchDraft=(patch:Partial<RelationshipDraft>)=>setDrafts(current=>({...current,[draftKey]:{...(current[draftKey]||EMPTY_RELATIONSHIP_DRAFT),...patch}}));
  const toggleDisclosure=(key:string)=>dispatch({type:"reader",key:readerKey,patch:{disclosures:{...reader.disclosures,[key]:!reader.disclosures[key]}}});
  const names=useMemo(()=>Object.fromEntries(people.map(p=>[p.birth.id,p.birth.name])),[people]);
  const overview=useMemo(()=>composeReaderChapters(calculation,preferences,names,state.roles),[calculation,preferences,names,state.roles]);
  const levelComparisons=useMemo(()=>compareLevels?FAMILIARITY.map(familiarity=>({familiarity,
    reading:composeReaderChapters(calculation,{...preferences,familiarity,preset:undefined},names,state.roles)})):[],[compareLevels,calculation,preferences,names,state.roles]);
  const [columnsOpen,setColumnsOpen]=useState(false);
  const rawChartContext=contextTarget(eligibleSelection(calculation,state.selection,state.mode,state.roles,state.scope));
  const contextGraph=state.scope==="A"||state.scope==="B"?calculation.facts.topology.natalGraphs.find(g=>g.scope.personIds[0]===state.roles[state.scope==="A"?0:1])!:graph;
  const chartContext=rawChartContext?{...rawChartContext,graphId:contextGraph.id}:null;
  const activationRow=(c:CompositeContributionV1)=><View key={c.id} style={styles.wrap}><View style={{flex:1,minWidth:0}}><Action name={exactContributionLabel(c,state.roles,names)} onPreview={active=>preview(active?{kind:"activation",id:c.id}:null)} onPress={()=>choose({kind:"activation",id:c.id})}/></View><ContextInfoButton calculation={calculation} names={names} target={{kind:"activation",id:c.id,graphId:contextGraph.id}}/></View>;
  const readerScroll=useRef<ScrollView>(null),pageScroll=useRef<ScrollView>(null);
  const live=useRef(state);live.current=state;
  useEffect(()=>{const frame=requestAnimationFrame(()=>readerScroll.current?.scrollTo({y:reader.scrollY,animated:false}));return()=>cancelAnimationFrame(frame);},[readerKey,state.restoreRevision]);
  const browserSteps=useRef(0),ignorePop=useRef(false),previousRoute=useRef({full:false,depth:0});
  useEffect(()=>{
    if(Platform.OS!=="web")return;
    const full=state.readingLevel==="full",previous=previousRoute.current;
    if(full&&(!previous.full||state.fullHistory.length>previous.depth)){window.history.pushState({auricCompositeReading:true,context:state.contextKey,depth:state.fullHistory.length},"");browserSteps.current++;}
    if(!full&&previous.full&&browserSteps.current){ignorePop.current=true;window.history.go(-browserSteps.current);browserSteps.current=0;}
    previousRoute.current={full,depth:state.fullHistory.length};
  },[state.readingLevel,state.fullHistory.length,state.contextKey]);
  useEffect(()=>{
    if(Platform.OS!=="web")return;
    const back=(event:PopStateEvent)=>{if(ignorePop.current){ignorePop.current=false;return;}
      if(event.state?.auricCompositeReading&&event.state.context===live.current.contextKey&&event.state.depth===live.current.fullHistory.length)return;
      if(live.current.readingLevel==="full"){browserSteps.current=Math.max(0,browserSteps.current-1);dispatch({type:"back"});}};
    const clear=()=>dispatch({type:"preview",selection:null});
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")clear();};
    const touch=(event:PointerEvent)=>{if(event.pointerType!=="mouse")clear();};
    window.addEventListener("popstate",back);window.addEventListener("blur",clear);window.addEventListener("keydown",key);
    window.addEventListener("resize",clear);window.addEventListener("scroll",clear,true);window.addEventListener("pointerdown",touch,true);
    return()=>{window.removeEventListener("popstate",back);window.removeEventListener("blur",clear);window.removeEventListener("keydown",key);window.removeEventListener("resize",clear);window.removeEventListener("scroll",clear,true);window.removeEventListener("pointerdown",touch,true);
      if(browserSteps.current){window.history.go(-browserSteps.current);browserSteps.current=0;}};
  },[]);
  useEffect(()=>{const sub=BackHandler.addEventListener("hardwareBackPress",()=>{if(live.current.readingLevel==="full"){dispatch({type:"back"});return true;}return false;});return()=>sub.remove();},[]);
  useEffect(()=>{if(state.readingLevel==="full")return;const frame=requestAnimationFrame(()=>{
    readerScroll.current?.scrollTo({y:reader.scrollY,animated:false});pageScroll.current?.scrollTo({y:state.chartView.canvasScrollY,animated:false});
    if(state.restoreRevision){outerScroll.current?.scrollTo({y:state.chartView.pageScrollY,animated:false});if(Platform.OS==="web")document.querySelector<HTMLElement>(`[data-testid="${fullOpener.current}"]`)?.focus?.({preventScroll:true});}
    });return()=>cancelAnimationFrame(frame);
  },[state.restoreRevision,state.readingLevel]);
  const setChart=(patch:Partial<typeof state.chartView>)=>dispatch({type:"chart",patch});
  const choose=(selection:CompositeSelection)=>{setTraceOpen(false);dispatch({type:"select",selection});};
  const showOnChart=(selection:CompositeSelection)=>{
    if(state.readingLevel==="full")dispatch({type:"return"});
    choose(selection);
    if(sideBySide&&focus==="evidence")setFocus("together");
    if(!sideBySide){setFocus("chart");requestAnimationFrame(()=>chartTarget.current?.measure((_x,_y,_w,_h,_px,y)=>outerScroll.current?.scrollTo({y:Math.max(0,outerY.current+y-120),animated:true})));}
  };
  const preview=(selection:CompositeSelection|null)=>dispatch({type:"preview",selection,contextKey:state.contextKey});
  const showTrace=()=>setTraceOpen(v=>!v);
  const enterReading=()=>{setFocus("reading");requestAnimationFrame(onReading);};
  const enterFull=()=>{fullOpener.current='composite-full-opener';setBridgeFullAt(null);dispatch({type:"chart",patch:{pageScrollY:outerY.current}});dispatch({type:"full",opener:"composite-full-opener"});enterReading();};
  const modeButtons=(['Combined','Person A','Person B','Difference'] as CompositeMode[]).map(mode=><Action key={mode} name={mode} selected={state.mode===mode} onPress={()=>{dispatch({type:"mode",mode});setTraceOpen(false);}}/>);
  const scopeButtons=(['A','B','A+B',...FUTURE_SCOPES] as CompositeScope[]).map(scope=><Action key={scope} name={scope.replace('+Transit',' + Transit')+(scope.includes('Transit')?' · future':'')} selected={state.scope===scope} onPress={()=>{dispatch({type:"scope",scope});setTraceOpen(false);}}/>);
  const chart=<View ref={chartTarget} onLayout={e=>setChartWidth(e.nativeEvent.layout.width-8)} style={[styles.chart,compactChart&&{maxWidth:500,alignSelf:"center"},sideBySide&&{flex:1,minWidth:0,width:undefined}]}>
    {!compactChart&&<><View style={styles.wrap}>{(['Centers','Channels','Gates'] as const).map(layer=><Action key={layer} name={`${layer} layer`} selected={state.chartView.layer===layer} onPress={()=>setChart({layer})}/>)}</View>
    <Text style={styles.small}>{state.mode} · {scopeAvailable(state)?state.scope:"permanent natal reference only; transit unavailable"} · {Math.round(state.chartView.zoom*100)}% · {graph.edges.length} complete Channels · {graph.componentCount} definition islands</Text></>}
    <CompositeBodyGraph calculation={calculation} mode={state.mode} roles={state.roles} selection={eligibleSelection(calculation,state.selection,state.mode,state.roles,state.scope)} preview={state.preview&&selectionEligibility(calculation,state.preview,state.mode,state.roles,state.scope).eligible?state.preview:null}
      chartView={state.chartView} height={graphHeight} compact={compactChart} onSelect={choose} onHover={selection=>dispatch({type:"preview",selection,contextKey:state.contextKey})} onChartView={setChart}/>
    {chartContext&&scopeAvailable(state)&&<View style={styles.wrap}><Text style={[styles.small,{flex:1}]}>{selectionLabel(state.selection)}</Text><ContextInfoButton calculation={calculation} names={names} target={chartContext}/></View>}
    <View testID="compact-chart-toolbar" style={styles.chartToolbar}>
      <View style={styles.chartLegend}><Text style={[styles.small,{color:COMPOSITE_COLORS.A}]}>A · {names[state.roles[0]]}</Text><Text style={[styles.small,{color:COMPOSITE_COLORS.B}]}>B · {names[state.roles[1]]}</Text></View>
      {scopeAvailable(state)&&<Pressable accessibilityRole="button" accessibilityLabel={columnsOpen?"Hide planetary columns":"Show planetary columns"} accessibilityState={{expanded:columnsOpen}}
        {...(Platform.OS==="web"?{title:columnsOpen?"Hide planetary columns":"Show planetary columns"}:{})} onPress={()=>setColumnsOpen(v=>!v)} style={styles.chartTool}>
        <Ionicons name="list-outline" size={20} color={theme.text}/><Text style={styles.small}>Planets</Text>
      </Pressable>}
      {!sideBySide&&<Pressable ref={expandOpener} accessibilityRole="button" accessibilityLabel={expandedChart?"Collapse BodyGraph":"Expand BodyGraph"} accessibilityState={{expanded:expandedChart}}
        {...(Platform.OS==="web"?{title:expandedChart?"Collapse BodyGraph":"Expand BodyGraph"}:{})} onPress={()=>{setExpandedChart(v=>!v);requestAnimationFrame(()=>expandOpener.current?.focus?.({preventScroll:true}));}} style={styles.chartTool}>
        <Ionicons name={expandedChart?"contract-outline":"expand-outline"} size={20} color={theme.text}/><Text style={styles.small}>{expandedChart?"Compact":"Expand"}</Text>
      </Pressable>}
    </View>
    {state.chartView.layer==="Channels"&&<><Text style={styles.small}>Overlapping Integration routes — choose the exact Channel</Text><View style={styles.wrap}>{runtime.channels.filter(c=>c.gates.every(g=>[10,20,34,57].includes(g))).map(c=><Action key={c.id} name={`Integration ${channelRef(c.id)}`} onPreview={active=>preview(active?{kind:"channel",id:c.id}:null)} onPress={()=>choose({kind:"channel",id:c.id})}/>)}</View></>}
    {scopeAvailable(state)&&columnsOpen&&<View testID="context-planetary-columns" style={styles.compareRow}>{(["design","personality"] as const).map(side=><View key={side} style={{flexGrow:1,flexBasis:250,minWidth:0}}><Text style={styles.h2}>{side==="design"?"Design":"Personality"}</Text>{visibleContributions(calculation,state.mode,state.roles).filter(c=>c.side===side).map(activationRow)}</View>)}</View>}
  </View>;
  const reading=<View ref={readTarget} style={[styles.reading,focus==="reading"&&{maxWidth:850,alignSelf:"center"},sideBySide&&focus==="together"&&{width:railWidth}]}>
    <View style={styles.wrap}>
      {onOpenLocalReading&&<Action name="Personal relationship reading" onPress={()=>onOpenLocalReading({participants:state.roles.map(id=>({personId:id,chartVersionId:calculation.inputs.find(p=>p.personId===id)!.chartVersionId})),selection:compositeReadingSelection(state),mode:state.mode,relationshipContext:state.relationshipContext,calculation,origin:"Compare",nonce:Date.now()})}/>} 
      {state.readingLevel==="full"&&<><Action name="Return to chart" onPress={()=>{dispatch({type:"return"});setFocus("together");}}/>{state.fullHistory.length>0&&<Action name="Back in reading" onPress={()=>{if(Platform.OS==="web")window.history.back();else dispatch({type:"back"});}}/>}</>}
      {optionsOpen&&<><Action name="Full Reading" testID="composite-full-opener" onPress={enterFull}/><Action name="Mechanics Trace" onPress={showTrace}/></>}</View>
    <ScrollView ref={readerScroll} style={[styles.readerScroll,(focus==="reading"||state.readingLevel==="full")&&{maxHeight:100000,flexShrink:0}]} onScroll={e=>dispatch({type:"reader",key:readerKey,patch:{scrollY:e.nativeEvent.contentOffset.y}})} scrollEventThrottle={80}>
      {!!state.selectionNotice&&<Text testID="composite-selection-notice" accessibilityLiveRegion="polite" style={styles.warning}>{state.selectionNotice}</Text>}
      <Text testID="composite-preview-cue" numberOfLines={2} accessibilityElementsHidden={!state.preview} importantForAccessibility={state.preview?'auto':'no-hide-descendants'}
        style={[styles.warning,{height:state.preview?40*fontScale:0,opacity:state.preview?1:0}]}>{state.preview?`Preview: ${selectionLabel(state.preview)}`:" "}</Text>
      {!scopeAvailable(state)?<><Text style={styles.warning}>Transit calculations are unavailable. The permanent A+B natal baseline remains available separately; no temporary Channel, Center or timing result is inferred.</Text><Text style={styles.small}>Future context: {state.scope} · temporal layer {state.temporalLayer} · snapshot none · UTC none · freshness unavailable.</Text></>:
        <>{initialReading&&<Text style={styles.small}>Original saved request and mechanics retained. Current display preferences affect exposition only; old requests are not rewritten.</Text>}<RelationshipReading preferences={preferences} onPreferences={onPreferences} key={draftKey} calculation={calculation} report={report} level={state.readingLevel} names={names} draft={draft} onDraft={patchDraft}
          onContext={context=>dispatch({type:"relationship-context",context})} canSave={!!relationship?.revisions.some(r=>r.calculationId===calculation.calculationId)} onSave={onSaveReading}
          disclosures={reader.disclosures} onDisclosure={toggleDisclosure} onSelect={showOnChart} onExplore={()=>setFocus("evidence")} onFullReading={enterFull} onTrace={()=>{setTraceOpen(true);requestAnimationFrame(()=>readerScroll.current?.scrollToEnd({animated:false}));}}/>
          {state.readingLevel!=="compact"&&<><Action name={calculatedDetails?"Hide calculated details":"Show calculated details"} onPress={()=>dispatch({type:"reader",key:readerKey,patch:{disclosures:{...reader.disclosures,calculatedDetails:!calculatedDetails}}})}/>
            {calculatedDetails&&<ReadingContent calculation={calculation} selection={selected} mode={state.mode} scope={state.scope} roles={state.roles} names={names} expanded choose={choose} preview={preview}/>}</>}
        </>}
      {traceOpen&&scopeAvailable(state)&&<TracePanel calculation={calculation} selection={selected} mode={state.mode} scope={state.scope} roles={state.roles} names={names}/>}
      {state.readingLevel==="full"&&<View style={styles.section}><Text style={styles.h2}>References within this reading</Text>
        {calculation.facts.channelRelations.filter(r=>r.formed).map(r=><Action key={r.channelId} name={channelRef(r.channelId)} onPreview={active=>preview(active?{kind:"channel",id:r.channelId}:null)} onPress={()=>choose({kind:"channel",id:r.channelId})}/>)}
        <Text style={styles.small}>These links move within the pinned reading. Return restores the chart state at entry.</Text></View>}
    </ScrollView>
  </View>;
  return <View testID="composite-result" style={styles.section}>
    <Text style={styles.h2}>{names[state.roles[0]]} + {names[state.roles[1]]}</Text>
    {scopeAvailable(state)&&focus==="together"&&state.readingLevel!=="full"&&<Text testID="composite-takeaway" style={styles.notice}>{overview.takeaway}</Text>}
    <View style={styles.wrap}>{(["quick","standard","deep"] as const).map(depth=><Action key={depth} name={depth[0].toUpperCase()+depth.slice(1)} selected={preferences.depth===depth} onPress={()=>void onPreferences({...preferences,depth}).then(()=>setPreferenceError("")).catch(e=>setPreferenceError(e.message))}/>)}<Action name={optionsOpen?"Close workspace options":"Workspace options"} onPress={()=>setOptionsOpen(v=>!v)}/></View>
    {!!preferenceError&&<Text accessibilityRole="alert" style={styles.warning}>{preferenceError}</Text>}
    {optionsOpen&&<>
    <Action name={compareLevels?"Hide explanation comparison":"Compare seven explanation levels"} onPress={()=>setCompareLevels(v=>!v)}/>
    {compareLevels&&<View testID="seven-level-comparison" style={styles.section}>{levelComparisons.map(({familiarity,reading})=><View key={familiarity} testID="comparison-level" style={{gap:6}}>
      <Text style={styles.h2}>{FAMILIARITY.indexOf(familiarity)+1} · {familiarity}</Text><Text style={styles.body}>{reading.opening.join("\n\n")}</Text>
    </View>)}</View>}
    <View style={styles.wrap}><Action name="Swap A / B" onPress={()=>{const next:[string,string]=[state.roles[1],state.roles[0]];dispatch({type:"swap"});void onSwap(next);}}/><Action name="Save relationship" onPress={()=>void onSave(state.roles)}/></View>
    {newer&&<Text style={styles.warning}>Newer natal chart revision available; this relationship stays pinned until explicit recalculation.</Text>}
    <View style={styles.wrap}>{modeButtons}</View>
    <View style={styles.wrap}><Action name="Chart Focus" selected={focus==="chart"} onPress={()=>{if(state.readingLevel==="full")dispatch({type:"return"});setFocus("chart");}}/><Action name="Reading Focus" selected={focus==="reading"} onPress={enterReading}/><Action name="Evidence Focus" selected={focus==="evidence"} onPress={()=>{if(state.readingLevel==="full")dispatch({type:"return"});setFocus("evidence");}}/><Action name="Chart + reading" selected={focus==="together"} onPress={()=>{if(state.readingLevel==="full")dispatch({type:"return"});setFocus("together");}}/></View>
    <Action name={scopeOpen?"Hide analysis scope":"Analysis scope"} onPress={()=>setScopeOpen(v=>!v)}/>{(scopeOpen||state.scope.includes("Transit"))&&<View style={styles.wrap}>{scopeButtons}</View>}
    {state.scope.includes("Transit")&&<View style={styles.wrap}>{(['baseline','overlay','temporary-only'] as const).map(layer=><Action key={layer} name={`${layer} layer`} selected={state.temporalLayer===layer} onPress={()=>dispatch({type:"temporal-layer",layer})}/>)}</View>}
    {scopeAvailable(state)&&<Action name={bridgeOpen?'Close potential bridge explorer':'Explore potential bridges'} onPress={()=>{if(bridgeFull)dispatch({type:'return'});setBridgeOpen(v=>!v);}}/>}
    </>}
    {bridgeOpen&&scopeAvailable(state)&&<View ref={bridgeFull?readTarget:undefined} style={!bridgeVisible?{display:'none'}:undefined} accessibilityElementsHidden={!bridgeVisible} importantForAccessibility={bridgeVisible?'auto':'no-hide-descendants'}><BridgeExplorer key={bridgeWorkspaceKey} calculation={calculation} roles={state.roles} names={names} parentFull={state.readingLevel==='full'} bridgeFull={bridgeFull} visible={bridgeVisible}
      onEnterFull={()=>{fullOpener.current='composite-bridge-full-opener';setBridgeFullAt(bridgeWorkspaceKey);dispatch({type:'chart',patch:{pageScrollY:outerY.current}});dispatch({type:'full',opener:'composite-bridge-full-opener'});}}
      onReturn={()=>dispatch({type:'return'})} onInspect={selection=>{setBridgeFullAt(null);choose(selection);}}/></View>}
    {focus==="evidence"?<View testID="evidence-focus" style={styles.full}>{scopeAvailable(state)?<><Text style={styles.h2}>Permanent A+B natal evidence</Text><Text style={styles.small}>The inventory compares both pinned natal charts. Chart selection still respects the current {state.mode} view; no foreign activation is reassigned.</Text><ConnectionExplorer calculation={calculation} preferences={preferences} names={names} query={connectionQuery} onQuery={setConnectionQuery} onSelect={showOnChart} selection={selected}/><ActualBridgeReading calculation={calculation} names={names} onSelect={showOnChart}/></>:<Text style={styles.warning}>Transit evidence is unavailable. Return to the A+B scope to inspect permanent natal connections; no temporal result is substituted.</Text>}</View>:
     state.readingLevel==="full"?(bridgeFull?null:<View style={styles.full}>{reading}</View>):<View style={[styles.content,sideBySide&&focus==="together"&&{flexDirection:"row"}]}>{focus!=="reading"&&chart}{focus!=="chart"&&reading}</View>}
    {state.readingLevel!=="full"&&<View ref={listTarget}><Action name={mechanicsOpen?"Hide mechanics browser":"Browse mechanics"} onPress={()=>setMechanicsOpen(v=>!v)}/>{mechanicsOpen&&<ScrollView ref={pageScroll} onScroll={e=>{setChart({canvasScrollY:e.nativeEvent.contentOffset.y});preview(null);}} scrollEventThrottle={80} style={styles.mechanicsList}>
      <Text style={styles.h2}>Actual complements for a chosen person</Text><View style={styles.wrap}>{state.roles.map(id=><Action key={id} name={`${actorFor(id,state.roles)} · ${names[id]}`} selected={selfId===id} onPress={()=>setSelfId(id)}/>)}</View>
      <Text style={styles.small}>These are actual Channel completions and actual natal-island joins. Potential bridges are explored separately; no compatibility score.</Text>
      {actualCompletions(calculation,selfId).map(row=><Action key={row.channelId} name={`${channelRef(row.channelId)} · ${names[selfId]} supplies ${gateRef(row.ownGate)}; ${row.partnerContributions.map(c=>exactContributionLabel(c,state.roles,names)).join(', ')}`} onPress={()=>choose({kind:"channel",id:row.channelId})}/>)}
      {!actualCompletions(calculation,selfId).length&&<Text style={styles.small}>No actual harmonic completion for this person in the pinned pair.</Text>}
      {calculation.facts.topology.actualJoins.filter(j=>j.personId===selfId).map(j=><Action key={j.witness.id} name={`Actual join · ${j.witness.centers.join(' → ')} · one sufficient route`} onPress={()=>choose({kind:"witness",id:j.witness.id,personId:selfId})}/>)}
      <Text style={styles.h2}>Complete Channels</Text>
      {calculation.facts.channelRelations.filter(r=>r.formed).map(r=><Action key={r.channelId} name={`${channelRef(r.channelId)} · ${r.classification} · ${r.endpointStates.map(s=>`${actorFor(s.personId,state.roles)} ${s.role}`).join(' / ')}`} onPreview={active=>preview(active?{kind:"channel",id:r.channelId}:null)} onPress={()=>choose({kind:"channel",id:r.channelId})}/>)}
      {state.mode==="Difference"&&<><Text style={styles.h2}>Difference / contribution matrix</Text><Text style={styles.small}>Each row shows individual endpoint ownership and permanent A+B completion. State 0 = neither; 1 = first Gate; 2 = second Gate; 3 = both.</Text>
        {calculation.facts.channelRelations.map(r=><Action key={r.channelId} name={`${channelRef(r.channelId)} · A ${r.endpointStates.find(s=>s.personId===state.roles[0])!.state} · B ${r.endpointStates.find(s=>s.personId===state.roles[1])!.state} · A+B ${r.formed?'complete':'incomplete'} · ${r.classification}`} onPreview={active=>preview(active?{kind:"channel",id:r.channelId}:null)} onPress={()=>choose({kind:"channel",id:r.channelId})}/>)}
        {calculation.facts.topology.deltas.perPerson.map(d=><Text key={d.personId} style={styles.small}>Relative to {names[d.personId]}: {d.addedChannelIds.length} added Channels; {d.addedCenterIds.join(', ')||'no added Centers'}. Natal-island effect: {calculation.facts.topology.islandEffects.find(e=>e.personId===d.personId)?.status}.</Text>)}</>}
      <Text style={styles.h2}>Definition islands</Text>
      {graph.components.map(c=><Action key={c.id} name={`${c.centerIds.join(' · ')} · ${short(c.id)}`} onPress={()=>choose({kind:"component",id:c.id,graphId:graph.id})}/>)}
      <Text style={styles.h2}>Motor to Throat paths</Text>{calculation.facts.topology.motorRoutes.filter(r=>r.graphId===graph.id).map(r=><Action key={r.motor} name={`${r.motor} → Throat · ${r.connected?'actual route':'not connected'}`} onPress={()=>choose({kind:"motor",graphId:r.graphId,motor:r.motor})}/>)}
      <Text style={styles.h2}>Gate ownership</Text><View style={styles.wrap}>{runtime.gates.map(g=>{const owners=calculation.facts.contributions.filter(c=>c.gate===g.gate_number);return <Action key={g.id} name={`${gateRef(g.gate_number)} · ${[...new Set(owners.map(c=>actorFor(c.personId,state.roles)))].join(' + ')||'reference / inactive'}`} onPreview={active=>preview(active?{kind:"gate",gate:g.gate_number}:null)} onPress={()=>choose({kind:"gate",gate:g.gate_number})}/>;})}</View>
      <Text style={styles.h2}>Exact planetary contributions</Text>
      {visibleContributions(calculation,state.mode,state.roles).map(activationRow)}
      <Text style={styles.small}>Personality and Design are natal sides; A/B colors denote participants. Duplicate Gate.Line records remain separate activations.</Text>
    </ScrollView>}</View>}
  </View>;
}

function ReadingContent({calculation,selection,mode,scope,roles,names,expanded,choose,preview}: {calculation:CompositeCalculationV1;selection:CompositeSelection;mode:CompositeMode;scope:CompositeScope;roles:[string,string];names:Record<string,string>;expanded:boolean;choose:(s:CompositeSelection)=>void;preview:(s:CompositeSelection|null)=>void}) {
  const eligibility=selectionEligibility(calculation,selection,mode,roles,scope);
  if(!eligibility.eligible)return <Text style={styles.warning}>{eligibility.reason}</Text>;
  const graph=graphFor(calculation,mode,roles),top=calculation.facts.topology;
  const contextGraph=scope==="A"||scope==="B"?top.natalGraphs.find(g=>g.scope.personIds[0]===roles[scope==="A"?0:1])!:graph;
  const selectedChannel=selection.kind==="channel"?calculation.facts.channelRelations.find(r=>r.channelId===selection.id):null;
  const selectedContribution=selection.kind==="activation"?visibleContributions(calculation,mode,roles).find(c=>c.id===selection.id):null;
  const selectedJoin=selection.kind==="witness"?top.actualJoins.find(j=>j.witness.id===selection.id):null;
  const selectedMotor=selection.kind==="motor"?top.motorRoutes.find(r=>r.graphId===selection.graphId&&r.motor===selection.motor):null;
  const gate=selection.kind==="gate"?selection.gate:selectedContribution?.gate;
  const supports=selectedContribution?[selectedContribution]:gate?visibleContributions(calculation,mode,roles).filter(c=>c.gate===gate):selectedChannel?visibleContributions(calculation,mode,roles).filter(c=>selectedChannel.gates.includes(c.gate)):selectedJoin?calculation.facts.contributions.filter(c=>selectedJoin.witness.edges.some(e=>e.endpoints.some(p=>p.contributionIds.includes(c.id)))):selection.kind==="center"?visibleContributions(calculation,mode,roles).filter(c=>graph.edges.some(e=>e.centers.includes(selection.id)&&e.gates.includes(c.gate))):selectedMotor?calculation.facts.contributions.filter(c=>selectedMotor.witness?.edges.some(e=>e.endpoints.some(p=>p.contributionIds.includes(c.id)))):[];
  const sourceIds=selectedContribution?[`gate-${String(selectedContribution.gate).padStart(2,'0')}-line-${selectedContribution.line}`]:selectedChannel?[selectedChannel.channelId]:gate?[`gate-${String(gate).padStart(2,'0')}`]:[];
  return <>
    {selection.kind==="overview"&&<><Text style={styles.body}>{graph.edges.length} complete Channels define {graph.definedCenters.length} Centers in {graph.componentCount} connected {graph.componentCount===1?"island":"islands"}.</Text>
      <Text style={styles.small}>{mode==="Person A"||mode==="Person B"?"Individual pinned natal structure. Relationship classifications belong to the A+B baseline.":"Permanent two-person natal structure. No combined Type, Authority or Profile is asserted."}</Text>
      {mode==="Difference"&&<Text style={styles.body}>Combined-only Channels: {top.deltas.combinedOnlyChannelIds.length}; combined-only Centers: {top.deltas.combinedOnlyCenterIds.length}; actual person-specific joins: {top.actualJoins.length}.</Text>}</>}
    {selection.kind==="gate"&&<><Text style={styles.body}>{gateRef(selection.gate)} is {graph.gates.includes(selection.gate)?"active in this view":"a reference Gate in this view"}. Exact activations below identify who supplies it.</Text></>}
    {selectedContribution&&<><Text style={styles.body}>{exactContributionLabel(selectedContribution,roles,names)}. This is one immutable planetary activation, even if another record shares the same Gate.Line.</Text><Text style={styles.small}>Pinned version {short(selectedContribution.chartVersionId)} · activation {short(selectedContribution.activationId)} · {selectedContribution.uncertaintyRef.eligibility}</Text></>}
    {selectedChannel&&<><Text style={styles.body}>{channelRef(selectedChannel.channelId)} is {selectedChannel.formed?`complete; its permanent pair classification is ${selectedChannel.classification}.`:"incomplete in the permanent A+B baseline."}</Text>
      {(mode==="Person A"||mode==="Person B")&&<Text style={styles.body}>In the selected person's natal view it is {graph.edges.some(e=>e.channelId===selectedChannel.channelId)?'complete':'incomplete'}. The relationship classification above describes A+B.</Text>}
      {selectedChannel.endpointStates.map(s=><Text key={s.personId} style={styles.small}>{actorFor(s.personId,roles)} {names[s.personId]}: {s.role}, endpoint state {s.state}</Text>)}
      <Text style={styles.small}>Both endpoint owners and exact activations remain inspectable. A temporary transit connection never changes this classification.</Text></>}
    {selection.kind==="center"&&<Text style={styles.body}>{selection.id} is {graph.definedCenters.includes(selection.id)?"defined":"undefined"} in {mode}. The graph derives Center definition from complete Channels.</Text>}
    {selection.kind==="component"&&<Text style={styles.body}>This connected definition island contains {graph.components.find(c=>c.id===selection.id)?.centerIds.join(" · ")||"no matching component in this mode"}. Its identity is graph scoped.</Text>}
    {selectedJoin&&<><Text style={styles.body}>For {names[selectedJoin.personId]}, the pinned pair joins natal islands through one sufficient actual route: {selectedJoin.witness.centers.join(" → ")}.</Text>
      {selectedJoin.witness.edges.map((e,i)=><Text key={i} style={styles.small}>{channelRef(e.channelId)}; support {e.endpoints.map(p=>gateRef(p.gate)).join(" + ")}</Text>)}
      <Text style={styles.small}>The route may contain already complete natal Channels. It is not asserted to be unique, necessary or exhaustive.</Text></>}
    {selectedMotor&&<><Text style={styles.body}>{selectedMotor.connected?`Actual ${CENTER_NAMES[selectedMotor.motor]} → Throat path: ${selectedMotor.witness!.centers.map(c=>CENTER_NAMES[c]).join(' → ')}.`:`${CENTER_NAMES[selectedMotor.motor]} is not connected to Throat in this graph.`}</Text><Text style={styles.small}>{selectedMotor.witness?.edges.map(e=>channelRef(e.channelId)).join(' → ')}. This route does not establish a combined Authority or Type.</Text></>}
    {expanded&&<View style={styles.section}><Text style={styles.h2}>Exact supporting contributions</Text>
      {supports.length?supports.map(c=><View key={c.id} style={styles.wrap}><View style={{flex:1,minWidth:0}}><Action name={exactContributionLabel(c,roles,names)} onPreview={active=>preview(active?{kind:"activation",id:c.id}:null)} onPress={()=>choose({kind:"activation",id:c.id})}/></View><ContextInfoButton calculation={calculation} names={names} target={{kind:"activation",id:c.id,graphId:contextGraph.id}}/></View>):<Text style={styles.small}>No exact contribution in this scope; reference structure is not a calculated activation.</Text>}
      <Text style={styles.h2}>Source boundary</Text><Text style={styles.small}>These are deterministic chart facts. Canonical records provide source context at exact Gate.Line or Channel scope; they do not prove relationship feelings or outcomes.</Text></View>}
    {expanded&&sourceIds.map(id=>{const record=byId.get(id),disposition=inferenceDisposition(id);return <View key={id} style={styles.section}><Text style={styles.eyebrow}>PINNED SOURCE CONTEXT · {id}</Text><Text style={styles.h2}>{record?.title||'Source unavailable'}</Text><Text style={styles.small}>{!disposition.allowed?`Interpretation withheld: ${disposition.reason}`:record?.fields.mechanical_kernel||record?.fields.deep_mechanics||'No scoped source excerpt is supplied.'}</Text><Text style={styles.small}>Source reference is interpretive context, distinct from the calculated relationship facts. Exact Line identity is retained.</Text></View>;})}
  </>;
}
function TracePanel({calculation,selection,mode,scope,roles,names}: {calculation:CompositeCalculationV1;selection:CompositeSelection;mode:CompositeMode;scope:CompositeScope;roles:[string,string];names:Record<string,string>}) {
  const p=tracePresentation(calculation,selection,mode,roles,scope);
  if(!p)return <View testID="composite-mechanics-trace" style={styles.section}><Text style={styles.h2}>Whole-chart Mechanics Trace</Text><Text style={styles.small}>Calculation {calculation.calculationId} · facts {calculation.factsHash}. Calculated structure only; source rights and interpretive approval remain open.</Text>{calculation.facts.mechanicsFacts.filter(f=>f.predicate!=="activation-contribution").map(f=><Text key={f.id} style={styles.small}>{f.predicate} · {f.subjectPersonIds.map(id=>names[id]).join(" + ")}{"\n"}{f.id}</Text>)}</View>;
  return <View testID="composite-mechanics-trace" style={styles.section}><Text style={styles.h2}>Mechanics Trace</Text>
    <Text style={styles.eyebrow}>SUBJECT / PERSPECTIVE</Text><Text style={styles.small}>{p.subjectPersonIds.map(id=>names[id]||id).join(" + ")}</Text>
    <Text style={styles.eyebrow}>ACTUAL SUPPORTING CONTRIBUTORS</Text>{p.supportingContributors.length?p.supportingContributors.map(c=><Text key={c.id} style={styles.small}>{exactContributionLabel(c,roles,names)} · {short(c.id)}</Text>):<Text style={styles.small}>No personal activation directly supports this fact.</Text>}
    <Text style={styles.eyebrow}>CALCULATION INPUTS — PINNED CHARTS</Text>{p.calculationInputs.map(r=><Text key={r.personId} style={styles.small}>{names[r.personId]} · {short(r.chartVersionId)} · {short(r.snapshotHash)}</Text>)}
    <Text style={styles.eyebrow}>CANONICAL SOURCE RECORDS</Text>{p.canonicalRecordIds.map(id=><Text key={id} style={styles.small}>{id} · {byId.get(id)?.title||"pinned record"}</Text>)}
    <Text style={styles.small}>Input charts are calculation context; they are not evidence that both people supplied this selected Gate. {p.nonclaims[0]}</Text>
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:theme.background},page:{padding:10,paddingBottom:24,gap:10},section:{paddingVertical:10,marginTop:12,gap:6,backgroundColor:theme.surface},
  h1:{color:theme.text,fontSize:21,fontWeight:"700"},h2:{color:theme.text,fontSize:17,fontWeight:"700",marginTop:5},body:{color:theme.text,fontSize:16,lineHeight:23,marginVertical:6},small:{color:theme.muted,fontSize:12,lineHeight:18},eyebrow:{color:theme.accent,fontSize:11,fontWeight:"700",marginTop:8},warning:{color:theme.uncertain,fontSize:14,lineHeight:20},notice:{color:theme.text,fontSize:14,lineHeight:20},
  action:{borderWidth:1,borderColor:theme.border,borderRadius:6,minHeight:44,paddingHorizontal:10,paddingVertical:7,justifyContent:"center",marginRight:4,marginBottom:4},actionSelected:{borderColor:theme.accent,backgroundColor:theme.surface},actionText:{color:theme.text,fontSize:12},
  wrap:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:3},compareRow:{flexDirection:"row",flexWrap:"wrap",gap:8},picker:{minWidth:250,flexGrow:1,flexBasis:300},savedRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:5},
  chartToolbar:{flexDirection:"row",alignItems:"center",gap:4,borderBottomWidth:1,borderColor:theme.border},chartLegend:{flex:1,minWidth:0,gap:2,paddingVertical:4},chartTool:{minWidth:44,minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:6,flexShrink:0},
  jumpBar:{flexDirection:"row",justifyContent:"center",flexWrap:"wrap",padding:4,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.background},
  content:{width:"100%",gap:12,alignItems:"flex-start"},chart:{padding:4,width:"100%"},reading:{padding:4,width:"100%",minHeight:250},readerScroll:{maxHeight:580},full:{width:"100%",maxWidth:850,alignSelf:"center"},mechanicsList:{maxHeight:550,borderTopWidth:1,borderColor:theme.border,marginTop:8},input:{minHeight:44,borderWidth:1,borderColor:theme.border,color:theme.text,padding:9,borderRadius:6},
});
