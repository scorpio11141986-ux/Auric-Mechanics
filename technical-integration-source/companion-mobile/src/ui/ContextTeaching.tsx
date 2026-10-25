import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {Person} from '../domain/contracts';
import {FAMILIARITY,CONCEPTS,type ReaderPreferencesV1} from '../intelligence/reader-preferences';
import {contextBundle,explainConcept,localContextEnabled,localReading,type TeachingConcept} from '../reading/local-explanation';
import {BodyGraph} from './BodyGraph';
import {defaultChartView} from './ui01-state';
import type {Selection} from './workspace-model';
import {theme} from './theme';

const concepts:TeachingConcept[]=['typeStrategy','profile','authority','centers','definition'];
type Props={people:Person[];revisions?:string[];preferences:ReaderPreferencesV1;onPreferences?:(p:ReaderPreferencesV1)=>Promise<void>;origin:'Chart'|'Reading'|'Knowledge';active?:boolean;relationshipContext?:string};
export function ContextTeaching(props:Props){return localContextEnabled({development:typeof __DEV__!=='undefined'&&__DEV__,flag:process.env.EXPO_PUBLIC_AURIC_LOCAL_READING,platform:Platform.OS,host:typeof window==='undefined'?'':window.location.hostname})?<Pilot {...props}/>:null;}
function Pilot({people,revisions,preferences,onPreferences,origin,active=true,relationshipContext='general'}:Props){
 const [topics,setTopics]=useState(false),[open,setOpen]=useState(false),[concept,setConcept]=useState<TeachingConcept|null>(null),[personId,setPersonId]=useState(people[0]?.birth.id||'');
 const [depth,setDepth]=useState<'quick'|'standard'|'deep'>('quick'),[evidence,setEvidence]=useState(false),[showChart,setShowChart]=useState(false),[settings,setSettings]=useState(false),[error,setError]=useState('');
 const [selection,setSelection]=useState<Selection>({kind:'chart'}),[chartView,setChartView]=useState(defaultChartView);
 const opener=useRef<any>(null),closeButton=useRef<any>(null);
 const scope=JSON.stringify(people.map((p,i)=>[p.birth.id,revisions?.[i]||p.activeChartVersionId||p.facts.birthUpdatedAt]));
 // Exact issued snapshots, built lazily so a closed explanation does not search graphs.
 const prepared=useMemo(()=>{if(!open)return {bundle:null,error:''};try{return {bundle:contextBundle(people,revisions),error:''};}catch(e){return {bundle:null,error:(e as Error).message};}},[open,scope]);
 const bundle=prepared.bundle;
 const person=bundle?.index.participants.find(p=>p.personId===personId)||bundle?.index.participants[0];
 const explanation=bundle&&person&&concept?explainConcept(bundle,person.personId,concept,preferences):null;
 const reading=bundle?localReading(bundle,depth,relationshipContext):null;
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus?.({preventScroll:true}));}
 useEffect(()=>{setOpen(false);setPersonId(people[0]?.birth.id||'');setShowChart(false);},[scope]);
 useEffect(()=>{if(!active)setOpen(false);},[active]);
 useEffect(()=>{if(!open||Platform.OS!=='web')return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();close();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open]);
 const button=(label:string,press:()=>void,selected=false)=> <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={press} style={[s.button,selected&&s.selected]}><Text style={s.buttonText}>{label}</Text></Pressable>;
 async function change(p:ReaderPreferencesV1){if(!onPreferences)return;try{await onPreferences(p);setError('');}catch{setError('Your explanation preference could not be saved. Your chart and reading are unchanged.');}}
 return <View testID={`context-entry-${origin.toLowerCase()}`}>
  <Pressable ref={opener} accessibilityRole="button" accessibilityLabel={`Local reading and explanations from ${origin}`} onPress={()=>{setConcept(null);setEvidence(false);setOpen(true);}} style={s.button}><Text style={s.buttonText}>Local reading and explanations</Text></Pressable>
  <Modal visible={open} animationType="none" onRequestClose={close} onShow={()=>closeButton.current?.focus?.()}>
   <View style={s.shell} testID="context-teaching" accessibilityViewIsModal>
    <View style={s.header}><Text style={s.title}>Chart connections</Text><Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Return to selected chart context" onPress={close} style={s.button}><Text style={s.buttonText}>Return to {origin}</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} testID="context-scroll">
     <Text style={s.badge}>Local teaching pilot · for review</Text>
     <Text testID="context-subject" style={s.body}>{bundle?.index.participants.map(p=>p.birth.name).join(' + ')||people.map(p=>p.birth.name).join(' + ')}</Text>
     {!!(prepared.error||error)&&<Text accessibilityRole="alert" style={s.body}>{prepared.error||error}</Text>}
     <View style={s.wrap}>{button('Connections reading',()=>{setConcept(null);setEvidence(false);},!concept)}{button(topics?'Hide topics':'Choose a topic',()=>setTopics(v=>!v))}{topics&&concepts.map(c=>button(`Explain ${CONCEPTS[c]}`,()=>{setConcept(c);setTopics(false);setEvidence(false);setShowChart(false);},concept===c))}</View>
     {explanation&&person?<View testID="context-explanation" style={s.panel}>
      {bundle!.index.participants.length>1&&<View style={s.wrap}>{bundle!.index.participants.map(p=>button(`Explain chart of ${p.birth.name}`,()=>{setPersonId(p.personId);setShowChart(false);},p.personId===person.personId))}</View>}
      <Text style={s.title}>{CONCEPTS[concept!]} · {person.birth.name}</Text>
      <Text style={s.heading}>In this chart</Text>{explanation.factStatements.map((t,i)=><Text key={i} style={s.body} testID="context-fact">{t}</Text>)}
      {!explanation.known&&<><Text style={s.heading}>How to read this</Text><Text style={s.body} testID="context-gloss">{explanation.mechanicalMeaning}</Text></>}
      {explanation.meaning&&<><Text style={s.heading}>Traditional meaning · review draft</Text><Text style={s.body}>{explanation.meaning}</Text>{explanation.experiment&&<Text style={s.body}>Optional experiment: {explanation.experiment}</Text>}</>}
      {!explanation.meaning&&<Text style={s.small}>This pilot explains the calculated facts here. Additional symbolic teaching is not supplied for this classification.</Text>}
      <View style={s.wrap}>{button(showChart?'Hide highlighted chart':'Show on chart',()=>{setShowChart(v=>!v);setSelection({kind:'center',id:concept==='authority'&&person.facts.authority==='Sacral'?'Sacral':explanation.centers[0]||'G'});})}</View>
      {showChart&&<View testID="context-bodygraph"><BodyGraph chart={person.facts} selection={selection} focus={selection} onSelect={setSelection} onHover={()=>{}} height={360} fitWhole chartView={chartView} onChartView={patch=>setChartView(v=>({...v,...patch}))}/><Text style={s.small}>Select a Center or Gate to inspect its place in this unchanged natal chart. Highlight: {selection.kind==='center'?selection.id:selection.kind==='gate'?`Gate ${selection.gate}`:selection.kind}.</Text></View>}
      <Text style={s.heading}>What would change</Text><Text style={s.body}>{explanation.whatChanges}</Text>
     </View>:reading&&<View testID="context-local-reading" style={s.panel}>
      <View style={s.wrap}>{(['quick','standard','deep'] as const).map(d=>button(`Local ${d[0].toUpperCase()+d.slice(1)}`,()=>setDepth(d),depth===d))}</View>
      <Text style={s.body} testID="local-core-discovery">{reading.opening}</Text>
      {reading.chapters.map(c=><View key={c.id}><Text style={s.heading}>{c.title}</Text><Text style={s.body}>{c.text}</Text></View>)}
      <Text style={s.small}>{reading.plan.depthStatus==='insufficient-supported-depth'?'Insufficient supported depth: ':''}{reading.gaps.join(' ')}</Text>
     </View>}
     {button(settings?'Close explanation controls':'Explanation controls',()=>setSettings(v=>!v))}
     {settings&&<View style={s.panel}><Text style={s.heading}>Familiarity changes explanation, not findings</Text><View style={s.wrap}>{FAMILIARITY.map(f=>button(`Local familiarity: ${f}`,()=>void change({...preferences,familiarity:f}),preferences.familiarity===f))}</View>
      {concept&&button(`Local known: ${CONCEPTS[concept]}`,()=>void change({...preferences,concepts:{...preferences.concepts,[concept]:!preferences.concepts?.[concept]}}),preferences.concepts?.[concept]===true)}
      {!onPreferences&&<Text style={s.small}>Preference changes are unavailable until saved preferences have loaded.</Text>}</View>}
     {button(evidence?'Hide local evidence':'Evidence and limits',()=>setEvidence(v=>!v))}
     {evidence&&<View style={s.panel} testID="context-evidence"><Text style={s.heading}>Evidence and limits</Text><Text selectable style={s.mono}>{JSON.stringify(explanation||{plan:reading?.plan,trace:reading?.trace},null,2)}</Text><Text style={s.small}>Calculated structure and traditional teaching are distinct. No new model request is made here. Teaching drafts are for internal review; content approval, rights and the seven-source target remain unresolved.</Text></View>}
    </ScrollView>
   </View>
  </Modal>
 </View>;
}
const s=StyleSheet.create({shell:{flex:1,backgroundColor:theme.background},header:{padding:12,borderBottomWidth:1,borderColor:theme.border,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8},content:{padding:16,gap:14,maxWidth:1000,width:'100%',alignSelf:'center',paddingBottom:80},title:{fontSize:22,fontWeight:'700',color:theme.text},heading:{fontSize:19,lineHeight:26,fontWeight:'600',color:theme.accent,marginTop:16,marginBottom:8},body:{fontSize:16,lineHeight:25,color:theme.text,marginBottom:10},small:{fontSize:14,lineHeight:22,color:theme.muted},badge:{fontSize:13,color:theme.uncertain},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},panel:{padding:14,borderWidth:1,borderColor:theme.border,borderRadius:12,gap:4},button:{minHeight:44,paddingVertical:11,paddingHorizontal:12,borderWidth:1,borderColor:theme.border,borderRadius:9,justifyContent:'center',alignSelf:'flex-start',maxWidth:'100%'},buttonText:{fontSize:14,lineHeight:21,color:theme.text,flexShrink:1},selected:{backgroundColor:theme.surfaceRaised,borderColor:theme.accent},mono:{fontSize:12,lineHeight:19,color:theme.muted,fontFamily:Platform.OS==='web'?'monospace':undefined}});
