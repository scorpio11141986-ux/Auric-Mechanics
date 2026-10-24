import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import type { ReaderFinding, ReaderNarrative } from "../intelligence/relationship-reader";
import { byId, channels } from "../content/records";
import { theme } from "./theme";
import { evidenceSummary } from "../intelligence/reader-evidence";

type Evidence = ReaderFinding | ReaderNarrative;
export function ReadingEvidence({value,calculation,names,roles,onClose,onExplore,onTrace}:{value:Evidence;calculation:CompositeCalculationV1;names:Record<string,string>;roles:string[];onClose:()=>void;onExplore:()=>void;onTrace:()=>void}) {
 const {width}=useWindowDimensions(),close=useRef<any>(null);
 const [advanced,setAdvanced]=useState(false);
 useEffect(()=>{
  if(Platform.OS!=="web")return;
  const opener=document.activeElement as HTMLElement|null;
  const frame=requestAnimationFrame(()=>close.current?.focus());
  const key=(e:KeyboardEvent)=>{
   if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();}
   if(e.key==="Tab"){
    const nodes=[...document.querySelectorAll<HTMLElement>('[data-testid="reading-evidence"] [tabindex="0"], [data-testid="reading-evidence"] a[href]')].filter(n=>!n.hasAttribute("disabled"));
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener("keydown",key,true);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener("keydown",key,true);requestAnimationFrame(()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});};
 },[onClose]);
 const facts=calculation.facts.mechanicsFacts.filter(f=>value.factIds.includes(f.id));
 const sourceIds=[...new Set(facts.flatMap(f=>f.sourceRecordIds))];
 const narrative="headline" in value;
 return <Modal transparent animationType="none" onRequestClose={onClose}>
  <View style={[s.overlay,{justifyContent:width<600?"flex-end":"center"}]}>
   <Pressable accessibilityLabel="Dismiss evidence" onPress={onClose} style={StyleSheet.absoluteFill}/>
   <View testID="reading-evidence" accessibilityViewIsModal style={[s.sheet,{maxHeight:"88%",borderRadius:width<600?8:6}]}>
    <View style={s.row}><Text accessibilityRole="header" style={s.heading}>{narrative?value.headline:value.title}</Text><Pressable ref={close} accessibilityRole="button" accessibilityLabel="Close evidence" onPress={onClose} style={s.button}><Text style={s.text}>Close</Text></Pressable></View>
    <ScrollView contentContainerStyle={{gap:12,padding:16}}>
     <Text style={s.heading}>Why this finding</Text>
     <Text style={s.text}>{narrative?value.paragraphs[0]:value.summary}</Text>
     {evidenceSummary(calculation,value,names).map((text,i)=><Text key={i} style={s.text}>{text}</Text>)}
     <Text style={s.text}>These facts support a structural comparison. They do not establish attraction, feelings or a relationship outcome. A different lived experience does not invalidate the chart calculation.</Text>
     <Pressable accessibilityRole="button" accessibilityState={{expanded:advanced}} accessibilityLabel="Advanced mechanics & sources" onPress={()=>setAdvanced(v=>!v)} style={s.button}><Text style={s.text}>{advanced?"Hide":"Show"} advanced mechanics & sources</Text></Pressable>
     {advanced&&<View testID="advanced-reading-evidence" style={{gap:12}}>
     <Text style={s.text}>Calculated structure only. No traditional teaching or personal-psychology inference is asserted.</Text>
     <Text style={s.small}>Trace {narrative?value.traceId:value.id}{"\n"}Calculation {calculation.calculationId}{"\n"}Facts {calculation.factsHash}</Text>
     <Text style={s.heading}>Why these facts matter</Text>
     {narrative?value.rankingReasons.map(t=><Text key={t} style={s.text}>{t}</Text>):<Text style={s.text}>{value.summary}</Text>}
     <Text style={s.text}>{narrative?value.counterfactual:"Both endpoints and their actual owners are required. Remove a required endpoint and recalculate; repeated activations can preserve it. Ownership alone does not prove a natal-island join."}</Text>
     <Text style={s.heading}>Exact chart support</Text>
     {narrative&&facts.some(f=>f.predicate==="definition-component")&&<View style={{gap:10}}>
      {calculation.facts.topology.natalGraphs.map(g=><Text key={g.id} style={s.text}>{names[g.scope.personIds[0]]} alone: {g.componentCount} islands · {g.components.map(c=>c.centerIds.join(" + ")).join(" / ")||"no defined Centers"}. {calculation.inputs.find(i=>i.personId===g.scope.personIds[0])?.facts.authority} natal Authority.</Text>)}
      <Text style={s.text}>Together: {calculation.facts.topology.combinedGraph.componentCount} islands · {calculation.facts.topology.combinedGraph.components.map(c=>c.centerIds.join(" + ")).join(" / ")||"no defined Centers"}.</Text>
      {calculation.facts.topology.islandEffects.map(e=><Text key={e.personId} style={s.text}>{names[e.personId]}: {e.status}; {e.natalIslandCount} natal islands. This classification compares that person's natal networks, not their psychological experience.</Text>)}
      {calculation.facts.topology.actualJoins.map(j=><Text key={j.witness.id} style={s.text}>{names[j.personId]} · one sufficient join: {j.witness.centers.join(" → ")}. Channels {j.witness.edges.map(e=>e.channelId.replace("channel-","")).join(" → ")}. Alternatives may exist; necessity is not asserted.{"\n"}<Text style={s.small}>Witness {j.witness.id}</Text></Text>)}
     </View>}
     {facts.map(f=><Text key={f.id} style={s.small}>{f.predicate} · {f.subjectPersonIds.map(id=>`${id===roles[0]?"A":"B"} ${names[id]}`).join(" + ")}{"\n"}{f.id}</Text>)}
     {calculation.facts.contributions.filter(c=>value.contributionIds.includes(c.id)).map(c=><Text key={c.id} style={s.text}>{c.personId===roles[0]?"A":"B"} · {names[c.personId]} · {c.planet} · Gate {c.gate}{c.boundaryRisk||c.uncertaintyRef.eligibility!=="exact-point"?" · exact Line uncertain (withheld)":`.${c.line}`} · {c.side==="design"?"Design":"Personality"}{"\n"}<Text style={s.small}>{c.id}</Text></Text>)}
     {!narrative&&<Text style={s.small}>Original claim IDs: {value.claimIds.join(", ")||"Derived comparison; issued calculation facts above."}</Text>}
     <Text style={s.heading}>Sources and limits</Text>
     <Text style={s.text}>Derivation: issued CM01a-1.0.0 calculation and the pinned natal snapshots. Source code: src/domain/composite.ts; src/intelligence/relationship-reader.ts. Canonical records below are catalog context, not permission to publish their interpretation. Original-source authenticity, commercial rights and owner wording approval remain unresolved.</Text>
     {sourceIds.map(id=><View key={id} style={{gap:6}}><Text style={s.text}>{byId.get(id)?.title||id}</Text><Text style={s.small}>assets/app2_documents.json · {id} · pinned {calculation.pins.catalogVersion}. Edition/date not independently authenticated.</Text>{channels.get(id)?.source_urls.map(url=><Text key={url} accessibilityRole="link" style={s.link} onPress={()=>void Linking.openURL(url)}>{url}</Text>)}</View>)}
     <Text style={s.text}>{calculation.facts.eligibility==="provisional-point"?"Approximate time: this is a provisional point, not a tested uncertainty interval. Gates, islands and Authority can vary outside this point. No probability is calculated.":"These are point-chart facts; a near-boundary Line is withheld, not interpreted."} A structural connection does not establish feelings, consent, attraction or relationship outcomes. Separate lived experience may contradict a symbolic interpretation.</Text>
     <View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel="View full Mechanics Trace" onPress={onTrace} style={s.button}><Text style={s.text}>Full Mechanics Trace</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Explore exact Channel evidence" onPress={onExplore} style={s.button}><Text style={s.text}>Channel explorer</Text></Pressable></View>
     </View>}
    </ScrollView>
   </View>
  </View>
 </Modal>;
}
export function EvidenceButton({title,onPress}:{title:string;onPress:()=>void}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={`Why this reading? ${title}`} onPress={onPress} style={({focused}:any)=>[s.info,focused&&{borderColor:theme.accent}]}><Text aria-hidden style={{color:theme.muted,fontSize:20}}>ⓘ</Text></Pressable>;
}
const s=StyleSheet.create({overlay:{flex:1,alignItems:"center",backgroundColor:"rgba(0,0,0,.55)"},sheet:{width:"100%",maxWidth:720,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8,padding:12},heading:{color:theme.text,fontSize:18,fontWeight:"700",lineHeight:26,flexShrink:1},text:{color:theme.text,fontSize:16,lineHeight:25,flexShrink:1},small:{color:theme.muted,fontSize:13,lineHeight:21,overflowWrap:"anywhere"} as any,link:{color:theme.accent,fontSize:14,lineHeight:22,overflowWrap:"anywhere"} as any,button:{minHeight:44,padding:10,borderWidth:1,borderColor:theme.border,borderRadius:4,justifyContent:"center"},info:{width:44,height:44,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"transparent",borderRadius:4,flexShrink:0}});
