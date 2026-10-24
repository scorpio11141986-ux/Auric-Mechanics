import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { connectionInventory, queryConnections, type ConnectionQuery } from "../intelligence/connection-inventory";
import type { ReaderPreferencesV1 } from "../intelligence/reader-preferences";
import type { CompositeSelection } from "./composite-workspace-model";
import { theme } from "./theme";

const text={color:theme.text,fontSize:15,lineHeight:23},small={color:theme.muted,fontSize:13,lineHeight:20};
function Button({label,onPress,selected=false}:{label:string;onPress:()=>void;selected?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} aria-pressed={selected} accessibilityState={{selected}} onPress={onPress} style={{minHeight:44,padding:8,borderWidth:1,borderColor:selected?theme.accent:theme.border,borderRadius:4,justifyContent:"center",maxWidth:"100%"}}><Text style={text}>{label}</Text></Pressable>;
}
export function ConnectionExplorer({calculation,preferences,names,query,onQuery,onSelect,selection}:{calculation:CompositeCalculationV1;preferences:ReaderPreferencesV1;names:Record<string,string>;query:ConnectionQuery;onQuery:(q:ConnectionQuery)=>void;onSelect:(s:CompositeSelection)=>void;selection:CompositeSelection}){
 const [filters,setFilters]=useState(false),[open,setOpen]=useState<string|null>(null);
 const inventory=useMemo(()=>connectionInventory(calculation,preferences),[calculation,preferences]);
 const rows=useMemo(()=>queryConnections(inventory,query),[inventory,query]);
 const patch=(q:Partial<ConnectionQuery>)=>onQuery({...query,...q});
 const selected=selection.kind==="channel"?selection.id:null;
 const filteredOut=selected&&!rows.some(r=>r.id===selected);
 return <View testID="connection-explorer" style={{gap:10,paddingVertical:12,borderTopWidth:1,borderColor:theme.border}}>
  <Text style={{...text,fontWeight:"700",fontSize:18}}>All connections</Text>
  <Text testID="connection-count" style={small}>{rows.length} shown / {inventory.filter(r=>r.relation.formed).length} complete Channels · {inventory.length} canonical connections available</Text>
  <TextInput accessibilityLabel="Search connections" placeholder="Gate pair, Center or circuit" placeholderTextColor={theme.muted} value={query.search||""} onChangeText={search=>patch({search})} style={{...text,minHeight:44,padding:8,borderWidth:1,borderColor:theme.border,borderRadius:4}}/>
  <Button label={filters?"Hide connection filters":"Sort and filter connections"} onPress={()=>setFilters(v=>!v)}/>
  {filters&&<View style={{gap:8}}>
   <Text style={small}>Sort by</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{(["salience","classification","center","circuit","person","evidence"] as const).map(sort=><Button key={sort} label={`Sort: ${sort}`} selected={(query.sort||"salience")===sort} onPress={()=>patch({sort})}/>)}</View>
   <Text style={small}>Salience counts structural changes and selected focus, not compatibility or importance to your life.</Text>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{["electromagnetic","compromise","companionship","dominance"].map(classification=><Button key={classification} label={classification} selected={query.classification===classification} onPress={()=>patch({classification:query.classification===classification?undefined:classification})}/>)}</View>
   <TextInput accessibilityLabel="Filter by Center" placeholder="Center (optional)" placeholderTextColor={theme.muted} value={query.center||""} onChangeText={center=>patch({center:center||undefined})} style={{...text,minHeight:44,padding:8,borderWidth:1,borderColor:theme.border}}/>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{[...new Set(inventory.map(r=>r.relation.circuit))].map(circuit=><Button key={circuit} label={`Circuit: ${circuit}`} selected={query.circuit===circuit} onPress={()=>patch({circuit:query.circuit===circuit?undefined:circuit})}/>)}</View>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{calculation.displayParticipantIds.map(id=><Button key={id} label={`Contributions: ${names[id]}`} selected={query.personId===id} onPress={()=>patch({personId:query.personId===id?undefined:id})}/>)}<Button label="Line boundary caution" selected={query.evidence==="boundary"} onPress={()=>patch({evidence:query.evidence==="boundary"?"all":"boundary"})}/><Button label="Include incomplete connections" selected={query.includeIncomplete} onPress={()=>patch({includeIncomplete:!query.includeIncomplete})}/><Button label="Reset connection filters" onPress={()=>onQuery({})}/></View>
  </View>}
  {filteredOut&&<Text accessibilityLiveRegion="polite" style={small}>Your selected Channel remains pinned on the chart, outside this filter. Reset filters to see its row.</Text>}
  {!rows.length&&<Text style={text}>No connections match these filters. The chart and selected evidence have not changed.</Text>}
  {rows.map(row=>{const r=row.relation,contributions=calculation.facts.contributions.filter(c=>row.contributionIds.includes(c.id));return <View key={row.id} testID={`connection-${row.id}`} style={{gap:7,paddingVertical:9,borderBottomWidth:1,borderColor:theme.border}}>
   <Button label={`${r.gates.join("–")} · ${r.classification||"incomplete"}`} selected={selected===r.channelId} onPress={()=>onSelect({kind:"channel",id:r.channelId})}/>
   <Text style={text}>{r.endpointStates.map(e=>`${names[e.personId]}: ${e.state===3?"complete natal Channel":e.state===0?"neither Gate":`Gate ${r.gates[e.state===1?0:1]} only`}`).join("; ")}. Together: {r.formed?"complete":"incomplete"}.</Text>
   <Text style={small}>{r.centers.join(" ↔ ")} · {r.circuit} · {row.substream||"No substream specified"}</Text>
   <Button label={`${open===row.id?"Hide":"Inspect"} exact evidence · ${r.gates.join("–")}`} onPress={()=>setOpen(open===row.id?null:row.id)}/>
   {open===row.id&&<View style={{gap:7}}>
    {row.effects.map(e=><Text key={e} style={text}>{e}</Text>)}
    <Text style={small}>Featured because: {row.reasons.join("; ")||"part of the complete inventory"}. This rank is not a relationship score.</Text>
    {contributions.map(c=><Button key={c.id} label={`${names[c.personId]} · ${c.planet} · ${c.side} · ${c.gate}.${c.line}${c.boundaryRisk?" · near Line boundary":""}`} onPress={()=>onSelect({kind:"activation",id:c.id})}/>)}
    <Text style={small}>Every activation is retained, including repeated Gate.Line entries. Stable-point means no flagged boundary here, not verified stability across a birth-time window.</Text>
    {row.factIds.map(id=><Text key={id} style={small}>Fact: {id}</Text>)}
    {row.source.map(x=><Text key={x.field} style={small}>{x.recordId} / {x.field} / {x.fieldHash} · catalog context, not a personal interpretation or permission receipt</Text>)}
   </View>}
  </View>;})}
 </View>;
}
