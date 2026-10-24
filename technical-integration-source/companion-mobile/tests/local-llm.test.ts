import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLocalBundle,localFactClosure} from '../src/reading/llm-validation';
import {localReadingFlag,currentReadingResponse,localReadingClaimIds} from '../src/reading/llm-presentation';
import {LOCAL_LLM_SCHEMA} from '../src/reading/llm-contract';
import {readingDemoSession} from '../src/reading/demo-session';
import {calculateComposite} from '../src/domain/composite';
import {buildCompositeChartIndex} from '../src/reading/chart-index';
import {localReaderError} from '../src/reading/local-reader-feedback';

const levels=['new','type','profile-authority','centers','gates-channels','advanced','practitioner'];
const concepts=['typeStrategy','authority','profile','centers','definition','gates','channels','lines','planets','sides'];
function fixture(){
 const packet:any={entry:{context:'individual',relationshipContext:['self-understanding']},requestDigest:'request',packetDigest:'packet',withheld:[],records:[{id:'r1',gate:48,line:3},{id:'r2',gate:16,line:1}],evidence:[
  {id:'e1',recordId:'r1',fieldKey:'kernel',activationIds:['native1'],exactLineMeaning:true,text:'test meaning',ref:{}},
  {id:'e2',recordId:'r2',fieldKey:'kernel',activationIds:['native2'],exactLineMeaning:true,text:'other test meaning',ref:{}}
 ],model:{participants:[{personId:'p1',name:'Person A',chartVersionId:'revision1'}],activations:[
  {id:'a1',nativeIndexedId:'native1',personId:'p1',gate:48,line:3,side:'Design',planet:'Saturn',exactLineEligible:true},
  {id:'a2',nativeIndexedId:'native2',personId:'p1',gate:16,line:1,side:'Personality',planet:'Sun',exactLineEligible:true}
 ],facts:[{id:'f1',predicate:'natal-classification',personIds:['p1'],activationIds:[],value:{authority:'Sacral'}}],graphs:[],contributions:[]}};
 const claims=Array.from({length:10},(_,i)=>({id:`c${i}`,text:`A conditional test proposition number ${i} connects these two supplied meanings.`,kind:'proposed-synthesis',personIds:['p1'],activationIds:['a1','a2'],factIds:[],factBindings:[],evidenceIds:['e1','e2'],requiredClaimIds:[],conditions:['when the stated condition holds'],alternatives:['another response remains possible'],limitations:['test-only fabricated meaning; never reading content']}));
 const discoveries=Array.from({length:5},(_,i)=>({id:`d${i}`,conclusion:`Distinct conclusion ${i}`,mechanism:`A condition linking the two meanings in test relationship ${i}`,relationKey:`relation-${i}`,claimIds:[`c${i+3}`],evidenceIds:['e1','e2'],personIds:['p1'],noveltyBeyondStandard:i<3?'':'A different structural consequence beyond the actual three Standard conclusions.'}));
 const chapter=(i:number)=>({id:`chapter${i}`,title:`Test theme ${i}`,titleClaimIds:[`c${i+3}`],paragraphs:[[`c${i+3}`]],discoveryId:`d${i}`});
 const bundle:any={schema:LOCAL_LLM_SCHEMA,requestDigest:'request',packetDigest:'packet',title:'Contract fixture',quick:{title:'Quick',claimIds:['c0','c1']},standard:{title:'Standard',thesisClaimIds:['c2'],chapters:[0,1,2].map(chapter)},deep:{additionalChapters:[3,4].map(chapter),gaps:[]},claims,discoveries,teaching:concepts.map(concept=>({concept,byFamiliarity:Object.fromEntries(levels.map(level=>[level,`Mechanical test explanation of ${concept} for ${level}.`])),factIds:['f1'],evidenceIds:[]})),limitations:['Contract tests do not establish interpretive quality.']};
 return {packet,bundle};
}
test('local preview requires all development, explicit flag, web and exact loopback conditions',()=>{
 const good={development:true,flag:'1',platform:'web',host:'127.0.0.1'};
 assert.equal(localReadingFlag(good),true);
 for(const bad of [{development:false},{flag:undefined},{platform:'android'},{host:'localhost.evil.test'},{host:'192.168.0.1'}])assert.equal(localReadingFlag({...good,...bad}),false);
});
test('stale case/digest responses cannot replace the current reading',()=>{
 assert.equal(currentReadingResponse(2,1,'same','same'),false);
 assert.equal(currentReadingResponse(2,2,'new-chart','old-chart'),false);
 assert.equal(currentReadingResponse(2,2,'same','same'),true);
});
test('closed paragraphs and all seven explanation registers have evidence traces',()=>{
 const {packet,bundle}=fixture(),r=validateLocalBundle(bundle,packet);
 assert.equal(r.trace.length,80);assert.equal(r.validation.depthStatus,'supported-candidate');
 assert.deepEqual(localReadingClaimIds(bundle,'quick'),['c0','c1']);
 assert.ok(!localReadingClaimIds(bundle,'standard').includes('c6'));
 assert.ok(localReadingClaimIds(bundle,'deep').includes('c6'));
});
test('reject foreign world, missing sources, cycles, foreign people and uncertain exact Lines',()=>{
 const variants:[string,(b:any,p:any)=>void][]=[
  ['STALE_OR_FOREIGN_READING',b=>b.packetDigest='old'],
  ['WITHHELD_OR_UNKNOWN_SOURCE',b=>b.claims[0].evidenceIds=['withheld']],
  ['CYCLIC_CLAIM_DEPENDENCY',b=>b.claims[0].requiredClaimIds=['c0']],
  ['WRONG_PERSON_SCOPE',b=>b.claims[0].personIds=['other']],
  ['UNCERTAIN_OR_FOREIGN_EXACT_LINE',(b,p)=>{b.claims[0].text='Gate 48.3 has this conditional meaning.';p.model.activations[0].exactLineEligible=false;}],
  ['WRONG_PLANET_OR_SIDE',b=>b.claims[0].text='Personality Saturn marks this conditional test.'],
  ['WITHHELD_SOURCE',(_b,p)=>p.withheld=[{recordId:'r1',fieldKey:'kernel'}]],
 ];
 for(const [code,mutate] of variants){const {bundle,packet}=fixture();mutate(bundle,packet);assert.throws(()=>validateLocalBundle(bundle,packet),new RegExp(code));}
});
test('typed native facts reject changed ownership values and absent JSON-pointer values',()=>{
 for(const mutation of ['wrong-value','missing-path','missing-binding','actor'] as const){
  const {packet,bundle}=fixture();packet.model.facts.push({id:'f2',predicate:'channel-ownership',personIds:['p1'],activationIds:['a1','a2'],value:{relation:{classification:'dominance',fullOwnerIds:['p1']}}});
  Object.assign(bundle.claims[0],{kind:'computed-fact',text:'This is dominance, with a full natal owner.',factIds:['f2'],factBindings:[{factId:'f2',predicate:'channel-ownership',path:'/relation/classification',value:'dominance'}]});
  if(mutation==='wrong-value')bundle.claims[0].factBindings[0].value='electromagnetic';
  if(mutation==='missing-path'){bundle.claims[0].factBindings[0].path='/relation/absent';delete bundle.claims[0].factBindings[0].value;}
  if(mutation==='missing-binding')bundle.claims[0].factBindings=[];
  if(mutation==='actor')packet.model.facts[1].personIds=['p2'];
  assert.throws(()=>validateLocalBundle(bundle,packet),/FACT_BINDING|BINDING_REQUIRED|FACT_PERSON_SCOPE/);
 }
});
test('ordinary compromise is not mistaken for a Channel ownership assertion',()=>{
 const {packet,bundle}=fixture();bundle.claims[0].text='You could discuss a precise compromise and a proportionate limit before continuing.';
 assert.doesNotThrow(()=>validateLocalBundle(bundle,packet));
 bundle.claims[0].text='This Channel is a compromise configuration.';
 assert.throws(()=>validateLocalBundle(bundle,packet),/OWNERSHIP_BINDING_REQUIRED/);
});
test('Deep recaps with different IDs earn no credit; new relations may reuse the same fields',()=>{
 const {packet,bundle}=fixture();bundle.discoveries[3].relationKey=bundle.discoveries[0].relationKey;
 const r=validateLocalBundle(bundle,packet);assert.equal(r.validation.depthStatus,'insufficient-supported-depth');assert.deepEqual(r.creditedDeepDiscoveryIds,['d4']);
 bundle.discoveries[3].relationKey='a different supported relationship';assert.equal(validateLocalBundle(bundle,packet).validation.depthStatus,'supported-candidate');
});
test('friendship limits include optional teaching and cannot be bypassed by hiding prose there',()=>{
 const {packet,bundle}=fixture();packet.entry.relationshipContext=['friendship'];bundle.teaching[0].byFamiliarity.new='This chart implies romantic attraction.';
 assert.throws(()=>validateLocalBundle(bundle,packet),/FRIENDSHIP_CONTEXT_LEAK/);
});
test('friendship and editorial markers cannot hide in reader headings or Deep gaps',()=>{
 for(const target of ['heading','gap','claim'] as const){const {packet,bundle}=fixture();packet.entry.relationshipContext=['friendship'];
  if(target==='heading')bundle.standard.chapters[0].title='Romantic attraction';
  if(target==='gap')bundle.deep.gaps=['A sexual attraction interpretation'];
  if(target==='claim')bundle.claims[0].text='The frozen source itself supplies a traditional meaning.';
  assert.throws(()=>validateLocalBundle(bundle,packet),/FRIENDSHIP_CONTEXT_LEAK|EDITORIAL_MARKER_IN_PROSE/);
 }
});
test('Standard priorities require served completion facts AND eligible Channel meanings',()=>{
 const {packet,bundle}=fixture();packet.model.readingPriorities=[{id:'new-center:root',kind:'new-center',factIds:['f1'],channelIds:['channel-16-48'],sourceRecordIds:['channel-16-48'],personIds:['p1'],reason:'test',requiredInStandard:true}];
 assert.throws(()=>validateLocalBundle(bundle,packet),/STANDARD_STRUCTURAL_PRIORITY_MISSING/);
 // Merely giving an unserved claim all required references is not sufficient.
 bundle.claims[9].text='Channel 16-48 is a conditional relationship.';bundle.claims[9].factIds=['f1'];
 assert.throws(()=>validateLocalBundle(bundle,packet),/STANDARD_STRUCTURAL_PRIORITY_MISSING/);
});
test('teaching cannot restore an uncertain exact Line or become untraced interpretation',()=>{
 const {packet,bundle}=fixture();bundle.teaching[0].byFamiliarity.new='Gate 48.3 is the exact teaching here.';
 assert.throws(()=>validateLocalBundle(bundle,packet),/TEACHING_EXACT_LINE_WITHHELD/);
});
test('native Composite component closure uses pair ownership; actual joins retain both contributors',()=>{
 const {fixtures}=readingDemoSession(),index=buildCompositeChartIndex(calculateComposite(fixtures.rowan,fixtures.mira));
 const input:any={facts:index.facts,activations:index.activations,graphs:index.graphs,contributions:index.composite!.facts.contributions};
 const pairFacts=index.facts.filter(f=>f.predicate==='definition-component'&&f.personIds.length===2);
 assert.ok(pairFacts.length);
 for(const f of pairFacts){const c=localFactClosure([f.id],input);assert.ok(c.facts.some(f=>f.predicate==='channel-ownership'));assert.ok(!c.facts.some(f=>f.predicate==='channel-completion'));}
 const joins=index.facts.filter(f=>f.predicate==='actual-island-join');assert.ok(joins.length);
 for(const f of joins){const c=localFactClosure([f.id],input);assert.ok(c.activationIds.length);const persons=new Set(c.activationIds.map(id=>index.activations.find(a=>a.id===id)!.personId));assert.equal(persons.size,2);}
 const lost={...input,facts:input.facts.filter((f:any)=>f.predicate!=='channel-ownership')};assert.throws(()=>localFactClosure([pairFacts[0].id],lost),/ISSUED_CHANNEL_WITNESS_MISSING/);
 const defined=index.facts.filter(f=>f.predicate==='center-state'&&(f.value as any).state==='defined');assert.ok(defined.length);
 for(const f of defined){const c=localFactClosure([f.id],input);assert.ok(c.facts.some(x=>x.predicate===(f.personIds.length===2?'channel-ownership':'channel-completion')));for(const channel of (f.value as any).completedChannelIds){const edge=index.graphs.find(g=>JSON.stringify([...g.scope.personIds].sort())===JSON.stringify([...f.personIds].sort()))!.edges.find(e=>e.channelId===channel)!;assert.ok(edge.gates.every(gate=>c.activationIds.some(id=>index.activations.find(a=>a.id===id)!.gate===gate)));}}
 const pairCenter=defined.find(f=>f.personIds.length===2)!;assert.throws(()=>localFactClosure([pairCenter.id],lost),/ISSUED_CHANNEL_WITNESS_MISSING/);
 const missing={...input,contributions:[]};assert.throws(()=>localFactClosure([joins[0].id],missing),/WITNESS_CONTRIBUTION_MISMATCH/);
});

test("explicit no-infallibility language survives; positive certainty remains blocked",()=>{
 const {packet,bundle}=fixture();bundle.claims[0].text="This interpretation does not make you infallible or make hostile conditions safe.";assert.doesNotThrow(()=>validateLocalBundle(bundle,packet));
 bundle.claims[0].text="This is not a claim that you are infallible.";assert.doesNotThrow(()=>validateLocalBundle(bundle,packet));
 for(const text of ["You are infallible.","You are not only infallible but always correct.","This guarantees safety."]){bundle.claims[0].text=text;assert.throws(()=>validateLocalBundle(bundle,packet),/UNSUPPORTED_CERTAINTY/);}
});
test('a planet label does not attribute a clause to a person with that first name',()=>{
 const {packet,bundle}=fixture();packet.model.participants.push({personId:'p2',name:'Moon Example',chartVersionId:'revision2'});packet.model.activations[0].planet='Moon';
 bundle.claims[0].text='Design Moon supplies this activation, with a conditional interpretation.';assert.doesNotThrow(()=>validateLocalBundle(bundle,packet));
 bundle.claims[0].text='Moon Example supplies this conditional interpretation.';assert.throws(()=>validateLocalBundle(bundle,packet),/PERSON_LABEL_OUTSIDE_SCOPE/);
});

test('withheld-Line notices require issued identity and never license interpretation',()=>{
 const {packet,bundle}=fixture();
 packet.records.push({id:'gate-47-line-3',gate:47,line:3});
 packet.withheld.push({recordId:'gate-47-line-3',fieldKey:'mechanical_kernel',reason:'restricted'});
 packet.model.activations.push({id:'a3',nativeIndexedId:'native3',personId:'p1',gate:47,line:3,side:'Design',planet:'Mercury',exactLineEligible:true});
 packet.model.facts.push({id:'f3',predicate:'activation',personIds:['p1'],activationIds:['a3'],value:{gate:47,line:3}});
 const t=bundle.teaching.find((t:any)=>t.concept==='lines');t.factIds=['f3'];
 for(const text of ['Gate 47.3 is identified but not interpreted because its exact teaching is unavailable.','47.3 remains an identity-only detail here.']){
  t.byFamiliarity.new=text;const result=validateLocalBundle(bundle,packet);
  const traced=result.trace.find((r:any)=>r.claimId==='teaching-lines-new');
  assert.equal(traced.withholdingDisclosures[0].meaningSupplied,false);assert.deepEqual(traced.withholdingDisclosures[0].activationIds,['a3']);
 }
 for(const text of ['Gate 47.3 means you understand everyone.','47.3 remains an identity-only detail here, so you understand everyone.','Gate 47.3 is identified but not interpreted because its exact teaching is unavailable, and proves your wisdom.']){
  t.byFamiliarity.new=text;assert.throws(()=>validateLocalBundle(bundle,packet),/TEACHING_WITHHELD_LINE_INTERPRETATION/);
 }
 t.byFamiliarity.new='47.3 remains an identity-only detail here.';t.factIds=['f1'];assert.throws(()=>validateLocalBundle(bundle,packet),/TEACHING_EXACT_LINE_WITHHELD/);
 t.factIds=['f3'];packet.model.activations[2].exactLineEligible=false;assert.throws(()=>validateLocalBundle(bundle,packet),/TEACHING_EXACT_LINE_WITHHELD/);
});

test('a natal explanation cannot name an undeclared friend; local framing keeps the natal premise',()=>{
 const {packet,bundle}=fixture();packet.model.participants.push({personId:'p2',name:'Other Friend',chartVersionId:'revision2'});
 bundle.claims[0].text='These natal routes are already connected without Other Friend.';
 assert.throws(()=>validateLocalBundle(bundle,packet),/PERSON_LABEL_OUTSIDE_SCOPE/);
 bundle.claims[0].text='These natal routes are already connected in your natal chart.';
 assert.doesNotThrow(()=>validateLocalBundle(bundle,packet));
});

test('reader feedback explains validation safely while machine codes remain diagnostic',()=>{
 for(const code of ['TEACHING_EXACT_LINE_WITHHELD','PERSON_LABEL_OUTSIDE_SCOPE','MODEL_CONSENT_REQUIRED','CACHE_ONLY_READING_UNAVAILABLE','arbitrary provider text']){
  const message=localReaderError(code);assert.ok(message.length>60);assert.ok(!message.includes(code));assert.ok(!message.includes('16.1'));
 }
 assert.match(localReaderError('PERSON_LABEL_OUTSIDE_SCOPE'),/selected people/);
 assert.match(localReaderError('TEACHING_WITHHELD_LINE_INTERPRETATION'),/Restricted meanings remain withheld/);
});
