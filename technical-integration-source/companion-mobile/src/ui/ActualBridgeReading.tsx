import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import type { BridgeAnalysisV1, BridgeTarget } from "../domain/bridges-contracts";
import { analyzeBridgeRemoval, solveCompositeBridges } from "../domain/bridges";
import type { CompositeSelection } from "./composite-workspace-model";
import { theme } from "./theme";

export function ActualBridgeReading({calculation:c,names,onSelect}:{calculation:CompositeCalculationV1;names:Record<string,string>;onSelect:(s:CompositeSelection)=>void}){
 const [results,setResults]=useState<{personId:string;result:BridgeAnalysisV1}[]>([]),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();setResults([]);setError("");
  const targets=c.facts.topology.natalGraphs.filter(g=>g.componentCount>1).flatMap<Extract<BridgeTarget,{personId:string}>>(g=>{
   const personId=g.scope.personIds[0],joins=c.facts.topology.actualJoins.filter(j=>j.personId===personId);
   return joins.length?joins.map(j=>({kind:"joinSelectedIslands" as const,personId,islandIds:j.targetNatalIslandIds})):[{kind:"joinAllNatalIslands" as const,personId}];
  });
  void Promise.all(targets.map(async target=>({personId:target.personId,result:await solveCompositeBridges(c,{scope:"pair",target,candidateGates:[],bounds:{maxStates:1,maxAddedGates:0,maxElapsedMs:3000,maxPaths:128,maxPathSteps:100000}},{signal:controller.signal})}))).then(rows=>{if(!controller.signal.aborted)setResults(rows);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
 },[c]);
 const text={color:theme.text,fontSize:15,lineHeight:23},small={color:theme.muted,fontSize:13,lineHeight:20};
 return <View testID="actual-bridge-reading" style={{gap:10,paddingVertical:12}}>
  <Text style={{...text,fontWeight:"700",fontSize:18}}>What joins — and what remains apart</Text>
  {!results.length&&!error&&<Text style={small}>{c.facts.topology.natalGraphs.some(g=>g.componentCount>1)?"Checking actual complete paths…":"Neither person has a natal split to join. New pair definition is a different question."}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={small}>{error} No exhaustive claim is made.</Text>}
  {results.map(({personId,result:r})=><View key={`${personId}:${r.resultId}`} style={{gap:8}}>
   <Text style={text}>{names[personId]}: {r.targetState==="already_satisfied"?c.facts.topology.islandEffects.find(e=>e.personId===personId)?.status==="all-joined"?"all natal islands join in this pair":"the selected natal islands join, but other natal islands remain separate":"not all natal islands join through the actual pair graph"}.</Text>
   <Text style={small}>{r.status} · {r.coverage.pathsComplete?"All simple paths for the solver's declared representative Center targets checked":"Path coverage bounded"}. Candidate universe: no added Gates. These are actual routes, not hypothetical potential bridges. Routes are sufficient, not necessarily unique; longer routes are alternatives, not additional necessary bridges.</Text>
   {r.alternatives.flatMap(a=>a.witnesses).map(w=><View key={w.id} style={{gap:5}}><Text style={text}>{w.centers.join(" → ")}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>{w.edges.map(e=><Pressable key={e.channelId} accessibilityRole="button" accessibilityLabel={`Inspect path Channel ${e.gates.join("–")}`} onPress={()=>onSelect({kind:"channel",id:e.channelId})} style={{padding:8,minHeight:44,borderWidth:1,borderColor:theme.border,justifyContent:"center"}}><Text style={text}>{e.gates.join("–")}</Text></Pressable>)}</View><Text style={small}>Proof {w.id}</Text></View>)}
  </View>)}
  <Text style={{...text,fontWeight:"700"}}>Separate charts, not separate worth</Text>
  {c.displayParticipantIds.map(personId=>{const removal=analyzeBridgeRemoval(c,{personId});return <Text key={personId} style={text}>Without {names[personId]}'s contributions: {removal.graph.edges.length} complete Channels and {removal.graph.components.length} connected areas remain. Lost Channels: {removal.lostChannelIds.map(id=>id.replace("channel-","")).join(", ")||"none"}. This is a calculated removal comparison, not emotional dependence. Either person's natal Authority is unchanged.</Text>;})}
 </View>;
}
