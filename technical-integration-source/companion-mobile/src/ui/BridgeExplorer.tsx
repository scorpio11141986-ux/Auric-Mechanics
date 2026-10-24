import React,{useEffect,useMemo,useReducer,useRef,useState} from 'react';
import { Platform,Pressable,ScrollView,Share,StyleSheet,Text,TextInput,View } from 'react-native';
import type { CompositeCalculationV1 } from '../domain/composite-contracts';
import { analyzeBridgeRemoval,compositeBridgeContext,exportBridgeReceipt,solveCompositeBridges,type BridgeContribution,type BridgeRequest,type BridgeScope,type BridgeTarget } from '../domain/bridges';
import { contentHash } from '../domain/composite-hash';
import { centerId,runtime } from '../content/records';
import { CENTER_NAMES,type CenterId } from '../domain/contracts';
import { COMPOSITE_COLORS,actorFor,type CompositeSelection } from './composite-workspace-model';
import { bridgeExplorerReducer,initialBridgeExplorer } from './bridge-explorer-state';
import { theme } from './theme';

function Button({label,onPress,selected=false,disabled=false,testID}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean;testID?:string}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} testID={testID} style={[styles.button,selected&&styles.chosen,disabled&&{opacity:.45}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const short=(s:string)=>s.length>18?`${s.slice(0,9)}…${s.slice(-6)}`:s;
function Support({record,roles,names,full,onRemove}:{record:BridgeContribution;roles:[string,string];names:Record<string,string>;full:boolean;onRemove:()=>void}){
  const actor=actorFor(record.personId,roles),detail=full?(s:string)=>s:short;
  return <View><Text style={[styles.small,{color:COMPOSITE_COLORS[actor]}]}>{actor} {names[record.personId]} ({short(record.personId)}) · {record.planet||'synthetic Gate record'} {record.gate}{record.line?'.'+record.line:''} · {record.side||'structural reference'} · activation {detail(record.activationId)} · version {detail(record.chartVersionId||'fixture')} · source {detail(record.id)}{record.kind==='natal'?` · ${record.uncertaintyRef.eligibility}${record.boundaryRisk?' · near Line boundary':''}`:''}</Text><Button label={`Preview removal of ${actor} ${record.planet||'record'} ${record.gate}${record.line?'.'+record.line:''} ${record.side||''} ${short(record.activationId)}`} onPress={onRemove}/></View>;
}
const centerIds=Object.keys(CENTER_NAMES) as CenterId[];
const baseBounds={maxStates:30000,maxElapsedMs:2500,maxAlternatives:128,maxPaths:32,maxPathSteps:10000};
function suggestedCandidates(c:CompositeCalculationV1,scope:BridgeScope,t:BridgeTarget){
  const present=new Set(c.facts.contributions.filter(p=>scope==='pair'||p.personId===scope.personId).map(p=>p.gate));
  if(t.kind==='completeChannel')return runtime.channels.find(x=>x.id===t.channelId)!.gates.filter(g=>!present.has(g));
  const centers=t.kind==='connectCenters'?t.centers:c.facts.topology.natalGraphs.find(g=>g.scope.personIds[0]===t.personId)!.definedCenters;
  const near=new Set(runtime.channels.filter(x=>x.centers.some(v=>centers.includes(centerId(v)))).flatMap(x=>x.gates));
  return runtime.gates.map(g=>g.gate_number).filter(g=>!present.has(g)).sort((a,b)=>(near.has(a)?0:1)-(near.has(b)?0:1)||a-b).slice(0,12);
}
export function BridgeExplorer({calculation,roles,names,parentFull,bridgeFull,visible,onEnterFull,onReturn,onInspect}:{calculation:CompositeCalculationV1;roles:[string,string];names:Record<string,string>;parentFull:boolean;bridgeFull:boolean;visible:boolean;onEnterFull:()=>void;onReturn:()=>void;onInspect:(s:CompositeSelection)=>void}){
  const context=useMemo(()=>compositeBridgeContext(calculation),[calculation]);const contextKey=useMemo(()=>contentHash(context),[context]);
  const [state,dispatch]=useReducer(bridgeExplorerReducer,contextKey,initialBridgeExplorer);
  const [scope,setScope]=useState<BridgeScope>('pair');
  const [target,setTarget]=useState<BridgeTarget>({kind:'connectCenters',centers:['Head','G']});
  const [candidateText,setCandidateText]=useState(()=>suggestedCandidates(calculation,'pair',{kind:'connectCenters',centers:['Head','G']}).join(', '));
  const [budgetText,setBudgetText]=useState('30000'),[message,setMessage]=useState('');
  const [removal,setRemoval]=useState<ReturnType<typeof analyzeBridgeRemoval>|null>(null);
  const abort=useRef<AbortController|null>(null),reader=useRef<ScrollView>(null),live=useRef(state),requestEpoch=useRef(0),cache=useRef(new Map<string,Awaited<ReturnType<typeof solveCompositeBridges>>>());live.current=state;
  const form=useRef({scope,target,candidateText,budgetText});
  useEffect(()=>()=>{abort.current?.abort();cache.current.clear();},[]);
  useEffect(()=>{if(!bridgeFull&&live.current.level==='full')dispatch({type:'return'});},[bridgeFull]);
  const selected=state.result?.alternatives.find(a=>a.id===state.selectedId)||null;
  useEffect(()=>{if(!visible)return;const frame=requestAnimationFrame(()=>reader.current?.scrollTo({y:selected?live.current.readers[selected.id]?.scrollY||0:0,animated:false}));return()=>cancelAnimationFrame(frame);},[state.selectedId,state.level,visible]);
  const activeFull=state.level==='full'&&bridgeFull;
  function reset(){abort.current?.abort();dispatch({type:'reset',contextKey,generation:++requestEpoch.current});setRemoval(null);setMessage('');}
  function changeTarget(next:BridgeTarget){reset();const text=suggestedCandidates(calculation,form.current.scope,next).join(', ');form.current.target=next;form.current.candidateText=text;setTarget(next);setCandidateText(text);}
  function changeScope(next:BridgeScope){reset();const current=form.current.target;const nextTarget:BridgeTarget=(current.kind==='joinAllNatalIslands'||current.kind==='joinSelectedIslands')&&next!=='pair'?{kind:'joinAllNatalIslands',personId:next.personId}:current;const text=suggestedCandidates(calculation,next,nextTarget).join(', ');form.current={...form.current,scope:next,target:nextTarget,candidateText:text};setScope(next);setTarget(nextTarget);setCandidateText(text);}
  async function run(){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    const current=form.current;const candidates=current.candidateText.trim()?current.candidateText.split(/[\s,]+/).filter(Boolean).map(Number):[];
    const query:BridgeRequest={scope:current.scope,target:current.target,candidateGates:candidates,bounds:{...baseBounds,maxStates:Number(current.budgetText),maxAddedGates:Math.min(16,new Set(candidates).size)},expectedContext:context};
    const generation=++requestEpoch.current;dispatch({type:'start',generation});setMessage('');
    const key=contentHash([context,query]);const cached=cache.current.get(key);
    const result=cached||await solveCompositeBridges(calculation,query,{signal:controller.signal});
    if(cached)setMessage('Reused a complete result with the same pinned inputs, scope, target and bounds.');
    if(!cached&&result.status==='exhaustive'&&!controller.signal.aborted){cache.current.set(key,result);if(cache.current.size>4)cache.current.delete(cache.current.keys().next().value!);}
    if(!controller.signal.aborted)dispatch({type:'result',generation,result});
  }
  async function exportResult(){if(!state.result)return;try{const text=exportBridgeReceipt(state.result);if(Platform.OS==='web'){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='auric-bridge-reference.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else await Share.share({message:text,title:'Redacted bridge reference receipt'});setMessage('Reference receipt prepared. It omits birth details and cannot be imported as a calculated chart.');}catch(e){setMessage(`Export unavailable: ${(e as Error).message}`);}}
  function previewRemoval(value:{personId:string}|{contributionId:string}){try{setRemoval(analyzeBridgeRemoval(calculation,value,scope,target));setMessage('Read-only removal scenario calculated from the original pinned baseline.');}catch(e){setRemoval(null);setMessage(`Removal scenario unavailable: ${(e as Error).message}`);}}
  const sourceLabel=scope==='pair'?'Pinned A+B natal pair':`${actorFor(scope.personId,roles)} ${names[scope.personId]} natal only`;
  const result=state.result;
  const coverageDetails=result&&<View testID="cm02-coverage-details" style={styles.proof}>
    <Text style={styles.small}>Declared candidate Gates: {result.coverage.candidateGates.join(', ')||'none'}; up to {result.coverage.maxAddedGates} additions. {result.coverage.visitedSubsets} sets considered. State/time caps: {result.coverage.bounds?.maxStates||0} / {result.coverage.bounds?.maxElapsedMs||0} ms. Gate-set coverage {result.coverage.gateSetsComplete?'complete within these constraints':'incomplete'}; path coverage {result.coverage.pathsComplete?'complete for fixed target representatives':'bounded'}.</Text>
    <Text style={styles.warning}>Other absent Gates outside this search: {result.coverage.excludedAbsentGates.join(', ')||'none'}. This is not an all-64-Gate completeness or F10 release promise.</Text>
  </View>;
  return <View testID="cm02-explorer" style={[styles.root,activeFull&&{maxWidth:850,alignSelf:'center',width:'100%'}]}>
    <Text style={styles.title}>Explore potential bridges</Text>
    {!activeFull&&<Text style={styles.body}>Choose a structural question and a finite set of hypothetical Gates. Actual partner matches stay in the existing Mechanics list.</Text>}
    <Text style={styles.small}>Baseline: {sourceLabel}. {calculation.facts.eligibility==='provisional-point'?'Provisional birth-time point: this does not cover a birth-time range.':'Validated pinned natal points.'} Permanent relationship classifications stay unchanged.</Text>
    {!activeFull&&<>
      <Text style={styles.label}>Add hypothetical Gates to</Text><View style={styles.wrap}>
        <Button label="A+B baseline" selected={scope==='pair'} disabled={state.running} onPress={()=>changeScope('pair')}/>
        {roles.map(id=><Button key={id} label={`${actorFor(id,roles)} natal baseline`} selected={scope!=='pair'&&scope.personId===id} disabled={state.running} onPress={()=>changeScope({personId:id})}/>)}</View>
      <Text style={styles.label}>Question</Text><View style={styles.wrap}>
        <Button label="Connect Centers" selected={target.kind==='connectCenters'} disabled={state.running} onPress={()=>changeTarget({kind:'connectCenters',centers:['Head','G']})}/>
        <Button label="Complete a Channel" selected={target.kind==='completeChannel'} disabled={state.running} onPress={()=>changeTarget({kind:'completeChannel',channelId:runtime.channels[0].id})}/>
        <Button label="Join natal islands" selected={target.kind==='joinAllNatalIslands'||target.kind==='joinSelectedIslands'} disabled={state.running} onPress={()=>changeTarget({kind:'joinAllNatalIslands',personId:scope==='pair'?roles[0]:scope.personId})}/>
      </View>
      {target.kind==='connectCenters'&&target.centers.map((value,i)=><View key={i}><Text style={styles.label}>{i===0?'From Center':'To Center'}: {value}</Text><View style={styles.wrap}>{centerIds.map(id=><Button key={id} label={`${i===0?'From':'To'} ${id}`} selected={value===id} disabled={state.running} onPress={()=>changeTarget({kind:'connectCenters',centers:i===0?[id,target.centers[1]]:[target.centers[0],id]})}/>)}</View></View>)}
      {target.kind==='completeChannel'&&<ScrollView style={styles.choices}><View style={styles.wrap}>{runtime.channels.map(c=><Button key={c.id} label={`Complete ${c.pair}`} selected={target.channelId===c.id} disabled={state.running} onPress={()=>changeTarget({kind:'completeChannel',channelId:c.id})}/>)}</View></ScrollView>}
      {(target.kind==='joinAllNatalIslands'||target.kind==='joinSelectedIslands')&&<>
        <View style={styles.wrap}>{roles.filter(id=>scope==='pair'||scope.personId===id).map(id=><Button key={id} label={`Natal islands of ${actorFor(id,roles)} ${names[id]}`} disabled={state.running} selected={target.personId===id} onPress={()=>changeTarget({kind:'joinAllNatalIslands',personId:id})}/>)}</View>
        <Button label="Join all original natal islands" disabled={state.running} selected={target.kind==='joinAllNatalIslands'} onPress={()=>changeTarget({kind:'joinAllNatalIslands',personId:target.personId})}/>
        <Text style={styles.small}>Or select an exact set of original natal islands below. Joining these is different from connecting arbitrary Centers or integrating the whole pair.</Text>
        {calculation.facts.topology.natalGraphs.find(g=>g.scope.personIds[0]===target.personId)!.components.map(p=><Button key={p.id} label={`Target island ${p.centerIds.join(' · ')}`} disabled={state.running} selected={target.kind==='joinSelectedIslands'&&target.islandIds.includes(p.id)} onPress={()=>{const ids=target.kind==='joinSelectedIslands'?target.islandIds:[];changeTarget({kind:'joinSelectedIslands',personId:target.personId,islandIds:ids.includes(p.id)?ids.filter(id=>id!==p.id):[...ids,p.id]});}}/>)}
      </>}
      <Text style={styles.label}>Candidate Gates (at most 16 absent Gates)</Text>
      <TextInput accessibilityLabel="Bridge candidate Gates" value={candidateText} editable={!state.running} onChangeText={value=>{reset();form.current.candidateText=value;setCandidateText(value);}} style={styles.input} placeholder="Comma-separated Gate numbers" placeholderTextColor={theme.muted}/>
      <Text style={styles.small}>The suggested list is limited to 12 absent Gates. Edit it to choose the declared universe; omitted Gates can provide other solutions.</Text>
      <Text style={styles.label}>Maximum Gate sets considered</Text><TextInput accessibilityLabel="Bridge subset budget" value={budgetText} keyboardType="number-pad" editable={!state.running} onChangeText={value=>{reset();form.current.budgetText=value;setBudgetText(value);}} style={styles.input}/>
      <View style={styles.wrap}><Button label={state.running?'Searching bridges…':'Search potential bridges'} disabled={state.running} onPress={()=>void run()}/>{state.running&&<Button label="Cancel bridge search" onPress={()=>{abort.current?.abort();dispatch({type:'cancel',generation:++requestEpoch.current});}}/>}</View>
    </>}
    {!!state.notice&&<Text accessibilityLiveRegion="polite" style={styles.warning}>{state.notice}</Text>}
    {!!message&&<Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text>}
    {result&&<>
      <Text accessibilityLiveRegion="polite" testID="cm02-coverage" style={result.status==='exhaustive'?styles.body:styles.warning}>Search status: {result.status}. {result.status==='exhaustive'?'Complete within the declared search bounds.':result.reason}</Text>
      {!activeFull&&coverageDetails}
      {result.baseline&&<Text style={styles.body}>What exists now: {result.baseline.graph.edges.length} complete Channels, {result.baseline.graph.definedCenters.length} defined Centers and {result.baseline.graph.components.length} definition islands in {sourceLabel}.</Text>}
      <Text style={styles.body}>{result.targetState==='already_satisfied'?'The selected target already exists in this baseline. No hypothetical addition is required.':result.targetState==='not_applicable'?'This person has no defined natal islands to join.':result.targetState==='no_solution_within_scope'?'No solution was found within the fully searched declared universe and constraints.':result.targetState==='unresolved'?'Coverage is insufficient to assert that no alternative exists.':`${result.alternatives.length} verified prerequisite options are retained. AND joins Gates within an option; OR separates options.`}</Text>
      <View style={styles.wrap}>{result.alternatives.map((a,i)=><Button key={a.id} label={`Bridge option ${i+1}: ${a.gates.length?'add '+a.gates.join(' AND '):'already present (no additions)'}`} selected={state.selectedId===a.id} onPress={()=>dispatch({type:'select',id:a.id})}/>)}</View>
      <Button label="Export redacted bridge receipt" onPress={()=>void exportResult()}/>
      {selected&&<>
        <View style={styles.wrap}>{state.level==='compact'?<Button label="Expand bridge explanation" onPress={()=>dispatch({type:'level',level:'expanded'})}/>:state.level==='expanded'?<Button label="Compact bridge overview" onPress={()=>dispatch({type:'level',level:'compact'})}/>:null}
          {!activeFull?<Button label="Full bridge reading" testID="composite-bridge-full-opener" disabled={parentFull} onPress={()=>{dispatch({type:'full'});onEnterFull();}}/>:<><Button label="Return to chart from bridge reading" onPress={onReturn}/>{state.history.length>0&&<Button label="Back in bridge reading" onPress={()=>dispatch({type:'back'})}/>}</>}
          </View>
        <ScrollView testID="cm02-reading-scroll" ref={reader} style={[styles.reader,activeFull&&{maxHeight:650}]} onScroll={e=>{if(visible)dispatch({type:'scroll',id:selected.id,scrollY:e.nativeEvent.contentOffset.y});}} scrollEventThrottle={80}>
          <Text style={styles.label}>{activeFull?'FULL BRIDGE READING':state.level==='expanded'?'EXPANDED BRIDGE READING':'COMPACT BRIDGE OVERVIEW'} · {selected.gates.length?'DERIVED HYPOTHESIS':'CALCULATED BASELINE — ALREADY PRESENT'}</Text>
          <Text style={styles.body}>What changes: add {selected.gates.join(' AND ')||'nothing'}. The replay gives {selected.graph.edges.length} complete Channels, {selected.graph.definedCenters.length} defined Centers and {selected.graph.components.length} islands.</Text>
          <Text style={styles.small}>Added Channels: {selected.delta.addedChannelIds.map(id=>runtime.channels.find(c=>c.id===id)!.pair).join(', ')||'none'}. Added Centers: {selected.delta.addedCenterIds.join(', ')||'none'}. {selected.delta.unchangedChannelIds.length} existing Channels stay complete.</Text>
          <Text style={styles.small}>Removing any listed prerequisite from this option fails the declared target after recomputing the entire graph. This does not make it indispensable across other options.</Text>
          {state.level!=='compact'&&<>
            <Text style={styles.title}>Why it connects — complete ordered routes</Text>
            <Text style={styles.small}>Retained path coverage: {selected.witnessCoverage.complete?'complete within fixed representative/simple-path bounds':'partial'}. {selected.witnessCoverage.reason}</Text>
            {selected.witnesses.map((w,i)=><View key={w.id} style={styles.proof}><Text style={styles.body}>Route {i+1}: {w.centers.join(' → ')}</Text>{w.edges.map((e,j)=><View key={`${e.channelId}/${j}`}>
              <Text style={styles.small}>{e.from} — {runtime.channels.find(c=>c.id===e.channelId)!.pair} — {e.to} · {e.preexisting?'already complete':'hypothetically completed'} · {runtime.channels.find(c=>c.id===e.channelId)!.circuit}</Text>
              {e.endpoints.map(p=><View key={p.gate}><Text style={styles.small}>Gate {p.gate}: {p.hypotheticalIds.length?'hypothetical prerequisite; no planet or Line inferred':'actual natal source records'}</Text>{p.contributionIds.map(id=><Support key={id} record={result.baseline!.contributions.find(c=>c.id===id)!} roles={roles} names={names} full={activeFull} onRemove={()=>previewRemoval({contributionId:id})}/>)}</View>)}
              <Button label={`Inspect permanent Channel ${runtime.channels.find(c=>c.id===e.channelId)!.pair}`} onPress={()=>onInspect({kind:'channel',id:e.channelId})}/>
            </View>)}</View>)}
            <Text style={styles.small}>Original island mappings after this option: {selected.delta.islandMappings.map(m=>`${actorFor(m.personId,roles)} [${m.centers.join(', ')}] → component ${m.afterComponent===null?'unavailable':m.afterComponent+1}`).join('; ')}</Text>
            <Text style={styles.small}>Result {short(result.resultId)} · pinned calculation {short(calculation.calculationId)} · catalog {short(context.catalogHash)}. Canonical records are source context; they do not prove relationship outcomes or content rights.</Text>
          </>}
        </ScrollView>
      </>}
      {activeFull&&coverageDetails}
      {!activeFull&&result.baseline&&<><Text style={styles.title}>Read-only removal scenarios</Text><View style={styles.wrap}>{roles.map(id=><Button key={id} label={`Preview removal of ${actorFor(id,roles)}`} onPress={()=>previewRemoval({personId:id})} disabled={scope!=='pair'&&scope.personId!==id}/>)}</View></>}
      {removal&&<><Text style={styles.body}>Removing {removal.removedContributionIds.length} actual records would lose {removal.lostChannelIds.length} Channels and {removal.lostCenterIds.join(', ')||'no'} defined Centers. The remaining graph has {removal.graph.components.length} islands. {removal.targetReached===null?'This target has no original natal split to assess.':removal.targetReached?'The remaining baseline satisfies the selected target.':'The remaining baseline does not satisfy the selected target.'}</Text>{removal.survivingWitnesses.map(w=><Text key={w.id} style={styles.small}>Remaining sufficient path: {w.centers.join(' → ')} ({w.edges.map(e=>runtime.channels.find(c=>c.id===e.channelId)!.pair).join(' → ')})</Text>)}<Text style={styles.small}>This previews the remaining permanent baseline without hypothetical additions; saved people, charts and permanent relationship classifications are unchanged.</Text></>}
    </>}
  </View>;
}
const styles=StyleSheet.create({
  root:{width:'100%',minWidth:0,borderWidth:1,borderColor:theme.border,borderRadius:8,padding:12,gap:10,marginVertical:8,backgroundColor:theme.surface},title:{color:theme.text,fontSize:20,lineHeight:28,fontWeight:'700'},body:{color:theme.text,fontSize:16,lineHeight:24},small:{color:theme.muted,fontSize:16,lineHeight:24},warning:{color:theme.uncertain,fontSize:16,lineHeight:24},label:{color:theme.accent,fontSize:16,lineHeight:24,fontWeight:'700',marginTop:8},wrap:{flexDirection:'row',flexWrap:'wrap',gap:6},button:{maxWidth:'100%',flexShrink:1,minHeight:44,borderWidth:1,borderColor:theme.border,borderRadius:6,paddingHorizontal:10,paddingVertical:9,justifyContent:'center',marginVertical:2},chosen:{borderColor:theme.accent},buttonText:{color:theme.text,fontSize:16,lineHeight:24},input:{minHeight:44,fontSize:16,color:theme.text,borderWidth:1,borderColor:theme.border,borderRadius:6,padding:10},choices:{maxHeight:200},reader:{maxHeight:440},proof:{borderTopWidth:1,borderColor:theme.border,paddingVertical:12,gap:8}
});
