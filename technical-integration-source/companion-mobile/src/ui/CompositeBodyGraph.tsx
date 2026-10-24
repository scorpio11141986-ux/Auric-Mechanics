import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Text as SvgText } from "react-native-svg";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { CENTER_NAMES, type CenterId } from "../domain/contracts";
import { centerId, runtime } from "../content/records";
import { GRAPH_HEIGHT, GRAPH_WIDTH, gatePaths, gatePorts, centerShapes, integrationPaths, integrationAxis,
  gateInkPartition, gateInkAxis, halfPlane, channelInk, channelGeometry, integrationState, type Point } from "./bodygraph-geometry";
import type { ChartView } from "./ui01-state";
import { COMPOSITE_COLORS, graphFor, ownershipInk, visibleContributions,
  type CompositeMode, type CompositeSelection } from "./composite-workspace-model";
import { theme } from "./theme";

type Ink = "none" | "A" | "B" | "both";
const centerColors: Record<CenterId, string> = { Head: "#d6c47a", Ajna: "#81a595", Throat: "#bb947d", G: "#d6c47a",
  Ego: "#c77c80", Spleen: "#bb947d", SolarPlexus: "#bb947d", Sacral: "#c77c80", Root: "#bb947d" };
const centerLabels:Record<CenterId,{text:string;x?:number;y?:number}>={Head:{text:"HEAD"},Ajna:{text:"THIRD EYE"},Throat:{text:"THROAT"},G:{text:"IDENTITY"},Ego:{text:"EGO",x:599,y:823},Spleen:{text:"SPLEEN",x:57,y:979},SolarPlexus:{text:"EMOTION",x:790,y:979},Sacral:{text:"SACRAL"},Root:{text:"ROOT"}};
function InkPath({ id, path, ink, direction, pivot, opacity = 1 }: { id: string; path: string; ink: Ink; direction: Point; pivot?: Point; opacity?: number }) {
  if (ink === "none") return null;
  const partition = pivot ? { pivot, direction } : gateInkPartition(Number(id.split("-").at(-1)));
  return <G pointerEvents="none" opacity={opacity}>
    <Path id={`composite-ink-${id}`} d={path} fill={ink === "A" ? COMPOSITE_COLORS.A : COMPOSITE_COLORS.B} stroke="none" />
    {ink === "both" && <>
      <Defs><ClipPath id={`composite-A-half-${id}`}><Path d={halfPlane(partition.pivot,partition.direction,-1)} /></ClipPath></Defs>
      <Path id={`composite-dual-${id}`} d={path} fill={COMPOSITE_COLORS.A} clipPath={`url(#composite-A-half-${id})`} stroke="none" />
    </>}
  </G>;
}
function Hotspot({ name, selected, onSelect, onHover, children }: {name:string;selected:boolean;onSelect:()=>void;onHover:(value:boolean)=>void;children:React.ReactNode}) {
  if (Platform.OS === "web") return React.createElement("g", {
    role:"button",tabIndex:0,"aria-label":name,"aria-pressed":selected,
    onClick:onSelect,onMouseEnter:()=>onHover(true),onMouseLeave:()=>onHover(false),onFocus:()=>onHover(true),onBlur:()=>onHover(false),
    onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect();}},style:{cursor:"pointer"},
  },React.createElement("title",null,name),children);
  return <G onPress={onSelect} accessibilityLabel={name+(selected?", selected":"")}>{children}</G>;
}
export function CompositeBodyGraph({ calculation, mode, roles, selection, preview, chartView, height, onSelect, onHover, onChartView, compact=false }: {
  calculation: CompositeCalculationV1; mode: CompositeMode; roles: [string,string]; selection: CompositeSelection; preview: CompositeSelection|null;
  chartView: ChartView; height: number; onSelect:(value:CompositeSelection)=>void; onHover:(value:CompositeSelection|null)=>void;
  onChartView:(patch:Partial<ChartView>)=>void;
  compact?:boolean;
}) {
  const graph=graphFor(calculation,mode,roles), contributions=visibleContributions(calculation,mode,roles);
  const activeGates=graph.gates, zoom=compact?1:chartView.zoom;
  const [canvasWidth,setCanvasWidth]=useState(1);
  const dragStart=useRef({x:.5,y:.5}),draggedAt=useRef(0);
  const dragContext=useRef({zoom:1,scale:1});
  const gestureLive=useRef({zoom,canvasWidth,height,chartView,onChartView,onHover});
  gestureLive.current={zoom,canvasWidth,height,chartView,onChartView,onHover};
  const selected=preview||selection, selectedGate=selected.kind==="gate"?selected.gate:selected.kind==="activation"?calculation.facts.contributions.find(c=>c.id===selected.id)?.gate:null;
  const selectedChannel=selected.kind==="channel"?selected.id:null;
  const selectedCenter=selected.kind==="center"?selected.id:null;
  const witness=selected.kind==="witness"?calculation.facts.topology.actualJoins.find(j=>j.witness.id===selected.id)?.witness:selected.kind==="motor"?calculation.facts.topology.motorRoutes.find(r=>r.graphId===selected.graphId&&r.motor===selected.motor)?.witness:null;
  const component=selected.kind==="component"?graph.components.find(c=>c.id===selected.id):null;
  const witnessChannels=new Set([...(witness?.edges.map(e=>e.channelId)||[]),...graph.edges.filter(e=>selectedCenter?e.centers.includes(selectedCenter):component?e.centers.every(c=>component.centerIds.includes(c)):false).map(e=>e.channelId)]);
  const committedGate=selection.kind==="gate"?selection.gate:selection.kind==="activation"?calculation.facts.contributions.find(c=>c.id===selection.id)?.gate:null;
  const pan=useMemo(()=>({x:Math.max(.5/zoom,Math.min(1-.5/zoom,chartView.center.x))*GRAPH_WIDTH,y:Math.max(.5/zoom,Math.min(1-.5/zoom,chartView.center.y))*GRAPH_HEIGHT}),[chartView.center.x,chartView.center.y,zoom]);
  const gesture=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>gestureLive.current.zoom>1&&Math.abs(g.dx)+Math.abs(g.dy)>12,
    onPanResponderGrant:()=>{const live=gestureLive.current;dragStart.current={...live.chartView.center};dragContext.current={zoom:live.zoom,scale:Math.min(live.canvasWidth/GRAPH_WIDTH,live.height/GRAPH_HEIGHT)*live.zoom};live.onHover(null);},
    onPanResponderMove:(_,g)=>{
      const {zoom:dragZoom,scale}=dragContext.current;
      const x=Math.max(.5/dragZoom,Math.min(1-.5/dragZoom,dragStart.current.x-g.dx/(GRAPH_WIDTH*scale)));
      const y=Math.max(.5/dragZoom,Math.min(1-.5/dragZoom,dragStart.current.y-g.dy/(GRAPH_HEIGHT*scale)));
      gestureLive.current.onChartView({center:{x,y}});
    },
    onPanResponderRelease:()=>{draggedAt.current=Date.now();},
    onPanResponderTerminate:()=>{draggedAt.current=Date.now();},
  })).current;
  const commit=(value:CompositeSelection)=>{if(Date.now()-draggedAt.current>250)onSelect(value);};
  const ink=(gate:number):Ink=>ownershipInk(contributions,gate,roles);
  const [upper,lower]=integrationAxis;
  const trunkDirection={x:lower.x-upper.x,y:lower.y-upper.y};
  const trunkMid={x:(upper.x+lower.x)/2,y:(upper.y+lower.y)/2};
  const trunkDivider={x:trunkDirection.y,y:-trunkDirection.x};
  const span=integrationState(activeGates);
  const trunkInk=(gates:number[]):Ink=>{
    const owners=new Set(contributions.filter(c=>gates.includes(c.gate)).map(c=>c.personId));
    return owners.has(roles[0])&&owners.has(roles[1])?"both":owners.has(roles[0])?"A":owners.has(roles[1])?"B":"none";
  };
  const area=chartView.layer;
  return <View testID="composite-bodygraph" style={{width:"100%"}}>
    <View style={{height,width:"100%"}} onLayout={e=>setCanvasWidth(e.nativeEvent.layout.width)} {...gesture.panHandlers}>
    <Svg testID="composite-graph-svg" accessibilityLabel={`${mode} Composite BodyGraph, ${Math.round(zoom*100)} percent`} viewBox={`${pan.x-GRAPH_WIDTH/(2*zoom)} ${pan.y-GRAPH_HEIGHT/(2*zoom)} ${GRAPH_WIDTH/zoom} ${GRAPH_HEIGHT/zoom}`} width="100%" height="100%">
      {runtime.gates.map(g=><Path key={g.id} d={gatePaths[g.gate_number]} fill={channelInk.inactive} stroke={channelInk.edge} strokeWidth={2}/>)}
      {Object.entries(integrationPaths).map(([id,path])=><Path key={id} d={path} fill={channelInk.inactive} stroke={channelInk.edge} strokeWidth={2}/>)}
      {runtime.gates.map(g=><InkPath key={g.id} id={`gate-${g.gate_number}`} path={gatePaths[g.gate_number]} ink={ink(g.gate_number)} direction={gateInkAxis(g.gate_number)}/>)}
      {[10,34].map(n=><InkPath key={n} id={`connector-${n}`} path={integrationPaths[n===10?"GateConnect10":"GateConnect34"]} ink={ink(n)} direction={gateInkAxis(n)}/>)}
      {span.GateSpan&&<>
        <Defs><ClipPath id="composite-trunk-upper"><Path d={halfPlane(trunkMid,trunkDivider,-1)}/></ClipPath><ClipPath id="composite-trunk-lower"><Path d={halfPlane(trunkMid,trunkDivider)}/></ClipPath></Defs>
        <G clipPath="url(#composite-trunk-upper)"><InkPath id="trunk-upper" path={integrationPaths.GateSpan} ink={trunkInk([10,20])} direction={trunkDirection} pivot={trunkMid}/></G>
        <G clipPath="url(#composite-trunk-lower)"><InkPath id="trunk-lower" path={integrationPaths.GateSpan} ink={trunkInk([34,57])} direction={trunkDirection} pivot={trunkMid}/></G>
      </>}
      {[2,14].filter(n=>ink(n)!=="none").map(n=><G key={`cross-${n}`} pointerEvents="none"><Path d={gatePaths[n]} fill={channelInk.inactive} stroke={theme.background} strokeWidth={6}/><InkPath id={`crossing-${n}`} path={gatePaths[n]} ink={ink(n)} direction={gateInkAxis(n)}/></G>)}
      {/* Match hit priority to the existing foreground crossing ink. Other Channels remain reachable along their own routes. */}
      {[...channelGeometry].sort((a,b)=>Number(a.channel.id==="channel-02-14")-Number(b.channel.id==="channel-02-14")).map(({channel,path,integration})=>{
        const pick:CompositeSelection={kind:"channel",id:channel.id};
        const committed=selection.kind==="channel"&&selection.id===channel.id;
        const focused=selectedChannel===channel.id||witnessChannels.has(channel.id)||committed;
        return <React.Fragment key={channel.id}>
          {focused&&<Path d={path} fill="none" stroke={preview&&!committed?"#efc66b":theme.text} strokeWidth={5} strokeDasharray={preview&&!committed?"9 7":undefined} pointerEvents="none"/>}
          {area==="Channels"&&!integration&&<Hotspot name={`Composite Channel ${channel.pair}${graph.edges.some(e=>e.channelId===channel.id)?", complete":", incomplete"} · ${channel.centers.map(c=>CENTER_NAMES[centerId(c)]).join(" \u2194 ")}`} selected={focused} onSelect={()=>commit(pick)} onHover={v=>onHover(v?pick:null)}><Path d={path} fill="none" stroke="transparent" strokeWidth={26}/></Hotspot>}
        </React.Fragment>;
      })}
      {Object.entries(centerShapes).map(([id,shape])=>{
        const center=id as CenterId,defined=graph.definedCenters.includes(center),pick:CompositeSelection={kind:"center",id:center};
        const focused=selectedCenter===center||witness?.centers.includes(center)||component?.centerIds.includes(center)||selection.kind==="center"&&selection.id===center;
        const label=centerLabels[center];
        return <Hotspot key={id} name={`${CENTER_NAMES[center]}, ${defined?"defined":"undefined"}`} selected={!!focused} onSelect={()=>commit(pick)} onHover={v=>onHover(v?pick:null)}>
          <Path d={shape.path} fill={defined?centerColors[center]:"#e9eeea"} stroke={focused?"#efc66b":defined?centerColors[center]:theme.muted} strokeWidth={focused?5:3}/>
          <SvgText x={label.x??shape.x} y={label.y??shape.y+5} textAnchor="middle" fontSize={center==="Spleen"||center==="SolarPlexus"?13:16} fontWeight="700" fill={theme.background}>{label.text}</SvgText>
        </Hotspot>;
      })}
      {runtime.gates.map(g=>{
        const n=g.gate_number,{x,y}=gatePorts[n],active=activeGates.includes(n),pick:CompositeSelection={kind:"gate",gate:n},focused=selectedGate===n||committedGate===n;
        return <Hotspot key={g.id} name={`Composite Gate ${n}, ${active?"active":"inactive"} · ${CENTER_NAMES[centerId(g.center)]} Center`} selected={focused} onSelect={()=>commit(pick)} onHover={v=>onHover(v?pick:null)}>
          {area==="Gates"&&<Circle cx={x} cy={y} r={18} fill="transparent"/>}
          <Circle cx={x} cy={y} r={12.3} fill={active?theme.background:"transparent"} stroke={committedGate===n?theme.text:focused?"#efc66b":active?"#e9eeea":"transparent"} strokeWidth={focused?4:2} strokeDasharray={preview&&selectedGate===n&&committedGate!==n?"4 3":undefined}/>
          <SvgText x={x} y={y+6} textAnchor="middle" fontSize={18} fontWeight={active?"700":"500"} fill={active?theme.text:theme.background}>{n}</SvgText>
        </Hotspot>;
      })}
    </Svg>
    </View>
    {!compact&&<><View style={styles.controls}>
      {([ ["Zoom out",()=>onChartView({zoom:Math.max(1,zoom-.5)})], ["Fit whole",()=>onChartView({zoom:1,center:{x:.5,y:.5},fitWhole:true})], ["Zoom in",()=>onChartView({zoom:Math.min(3,zoom+.5)})],
        ["Locate selection",()=>{const points=selectedGate?[gatePorts[selectedGate]]:selectedCenter?[centerShapes[selectedCenter]]:selectedChannel?runtime.channels.find(c=>c.id===selectedChannel)!.gates.map(g=>gatePorts[g]):(witness?.centers||component?.centerIds||[]).map(c=>centerShapes[c]);if(points.length)onChartView({zoom:2,center:{x:points.reduce((s,p)=>s+p.x,0)/points.length/GRAPH_WIDTH,y:points.reduce((s,p)=>s+p.y,0)/points.length/GRAPH_HEIGHT}});}],
        ["Pan left",()=>onChartView({center:{x:Math.max(.5/zoom,chartView.center.x-.12),y:chartView.center.y}})], ["Pan right",()=>onChartView({center:{x:Math.min(1-.5/zoom,chartView.center.x+.12),y:chartView.center.y}})],
        ["Pan up",()=>onChartView({center:{x:chartView.center.x,y:Math.max(.5/zoom,chartView.center.y-.12)}})], ["Pan down",()=>onChartView({center:{x:chartView.center.x,y:Math.min(1-.5/zoom,chartView.center.y+.12)}})] ] as const).map(([name,action])=><Pressable key={name} accessibilityRole="button" accessibilityLabel={name} onPress={action} style={styles.control}><Text style={styles.controlText}>{name}</Text></Pressable>)}
    </View>
    <Text style={styles.legend}>A {COMPOSITE_COLORS.A} · B {COMPOSITE_COLORS.B} · actor colors; natal side appears in exact contribution details</Text></>}
  </View>;
}
const styles=StyleSheet.create({controls:{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:4,paddingTop:4},control:{minWidth:44,minHeight:44,paddingHorizontal:7,justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:theme.border,borderRadius:5},controlText:{color:theme.text,fontSize:11},legend:{color:theme.muted,fontSize:11,textAlign:"center",paddingTop:4}});
