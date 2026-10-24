import {relationIdentity,normalizedMeaning,conditionalResponsePair,type RelationalMeaning} from './meaning-relations';
import {recordRelationship} from './record-relationships';
import {semanticPremise,type SemanticPremise} from './semantic-premises';
import {CENTER_NAMES} from '../domain/contracts';
import {deriveStructure} from '../domain/calculator';
import {contentHash} from '../domain/composite-hash';
import type {StructureGraphV1} from '../domain/composite-contracts';
import type {ReadingChartIndex,IndexedChannel,IndexedActivation,MeaningUnit,ReadingUse,DesignPreviewCapability,MeaningVariant} from './contracts';
import {getMeaningUnit} from './catalog';
import {resolveMeaningEligibility} from './eligibility';
import {excludedReadingField} from './source-policy';
import {sanitizeReadingProse} from './realization';
import {makeClaim,makeInsight,makeRule,unique,claimRemovalCheck,sourceIdentity,type ReadingClaim,type ReadingInsight,type ClaimSource} from './insights';
import {MEANING_ROLES,RELATIONSHIP_OPERATIONS,intimateMeaning,type MeaningRole,type RelationshipOperation} from './relationship-operations';

type Options={use:ReadingUse;capability?:DesignPreviewCapability;variantId?:MeaningVariant;interests:string[]};
type Graph={claims:ReadingClaim[];insights:ReadingInsight[];units:MeaningUnit[]};
type Feature={role:MeaningRole;fieldKey:string;match:string;start:number;end:number;offsetUnit:'UTF-16-code-units';sentence:string;claimId:string;semantic:SemanticPremise};
type Node={key:string;recordId:string;label:string;kind:'channel'|'line'|'hypothetical';centers:string[];personIds:string[];activations:IndexedActivation[];facts:ReadingClaim[];fields:Record<string,ReadingClaim>;features:Feature[];channel?:IndexedChannel};
export type DiscoveryCandidate={key:string;operator:string;nodeKeys:string[];recordIds:string[];premiseClaimIds:string[];featureBindings:Feature[];interactionMechanism:string;conditions:string[];limitations:string[];counterfactual:string[];insightId:string;depth:'standard'|'deep';structuralWitness:unknown;meaning:RelationalMeaning;scope:'individual'|'pair-derived'|'natal-background'};
export type RelationalDiscoveryTrace={schema:'AuricRelationalDiscoveryV1';records:{recordId:string;binding:string;status:string;reasons:string[]}[];candidates:DiscoveryCandidate[];operatorCoverage:{operator:string;matches:number;retained:number}[];semanticRejections:{binding:string;fieldKey:string;match:string;premise:SemanticPremise}[];proposalDispositions:{key:string;reason:string;nodeKeys?:string[]}[];limits:string[]};
const clean=(text:string)=>sanitizeReadingProse(text).replace(/ in frozen F[1-5]\b/g,'').replace(/[“”]/g,'').trim();
const short=(text:string)=>{
 const s=clean(text);return /\b(no detriment|no adverse|absence of detriment)\b/i.test(s)?s:s.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
};
const end=(text:string)=>text.replace(/[.!?;]+$/,'');
const lower=(text:string)=>text.charAt(0).toLowerCase()+text.slice(1);
export function discoverRelationalInsights(index:ReadingChartIndex,graph:Graph,options:Options){
 const trace:RelationalDiscoveryTrace={schema:'AuricRelationalDiscoveryV1',records:[],candidates:[],operatorCoverage:[],semanticRejections:[],proposalDispositions:[],limits:['Role extraction is a bounded lexical hypothesis over eligible source meanings, not a semantic approval or a behavioral observation.','Every proposal requires independent editorial entailment review. Unmodelled meanings remain available, not relabelled missing content.']};
 const claims=graph.claims,output:ReadingInsight[]=[],byId=new Map(claims.map(c=>[c.claimId,c]));
 const scope={context:index.context,personIds:index.participants.map(p=>p.personId),chartRevisionIds:index.participants.map(p=>p.chartVersionId),worldIds:[`point:${index.indexHash}`]};
 const pair=index.context==='composite';
 const intimate=options.interests.some(x=>/sexual|romanti|intimacy|L0[234]/i.test(x));
 const who=(id:string)=>index.participants.find(p=>p.personId===id)!.birth.name;
 const channelLabel=(c:IndexedChannel)=>`Channel ${c.gates.join('–')} (${c.centers.map(x=>CENTER_NAMES[x]).join(' ↔ ')})`;
 const occurrence=(a:IndexedActivation)=>`${pair?who(a.personId)+"’s":'your'} ${a.side==='design'?'Design':'Personality'} ${a.planet} at Gate ${a.gate}.${a.line} (${CENTER_NAMES[a.center]} Center)`;
 function save(input:Parameters<typeof makeClaim>[0]){const c=makeClaim(input);if(!byId.has(c.claimId)){claims.push(c);byId.set(c.claimId,c);}return byId.get(c.claimId)!;}
 function fact(key:string,text:string,routes:ReadingClaim['supportRoutes'],required:string[]=[]){return save({kind:'computed-fact',scope,propositionKey:'discovery-fact:'+key,text,factIds:unique(routes.flatMap(r=>r.factIds)),activationIds:unique(routes.flatMap(r=>r.activationIds)),sources:[],meaningPropositionIds:[],requiredPremiseIds:required,supportRoutes:routes,rule:null,alternatives:[],qualifications:['Current issued mechanics only.'],disconfirmation:[],forbiddenInferences:[]});}
 const completionCache=new Map<string,ReadingClaim>();
 function completion(c:IndexedChannel){
  const key=`${c.personId||'combined'}:${c.channelId}`;if(completionCache.has(key))return completionCache.get(key)!;
  const routes=c.endpointActivationIds[0].flatMap(a=>c.endpointActivationIds[1].map(b=>({factIds:[],activationIds:[a,b],claimIds:[]})));
  const f=fact(key,`${channelLabel(c)} is complete in ${c.personId?who(c.personId)+"’s natal chart":'the combined chart'}.`,routes);completionCache.set(key,f);return f;
 }
 function gatePresence(personId:string,gate:number){
  const occurrences=index.activations.filter(a=>a.personId===personId&&a.gate===gate);
  return fact(`gate-presence:${personId}:${gate}`,`Gate ${gate} is present in ${who(personId)}’s natal chart.`,occurrences.map(a=>({factIds:[],activationIds:[a.id],claimIds:[]})));
 }
 function ownership(c:IndexedChannel){
  if(!c.relation)return [];
  // Exhaustive ownership is issued independently of pair-wide completion.
  const f=index.facts.find(f=>f.predicate==='channel-ownership'&&(f.value as any).channelId===c.channelId)!;
  const positive=[completion(c),...c.relation.fullOwnerIds.map(id=>completion(index.channels.find(n=>n.personId===id&&n.channelId===c.channelId)!)),...c.relation.endpointStates.filter(s=>s.state===1||s.state===2).map(s=>gatePresence(s.personId,c.gates[s.state===1?0:1]))];
  const premises=unique(positive.map(c=>c.claimId));
  return [fact('ownership:'+c.channelId,ownershipWords(c),[{factIds:[f.id],activationIds:[],claimIds:premises}],premises)];
 }
 function ownershipWords(c:IndexedChannel){
  if(!c.relation)return `${channelLabel(c)} is natal.`;
  const r=c.relation,full=r.fullOwnerIds.map(who).join(' and '),partial=r.endpointStates.filter(s=>s.state===1||s.state===2).map(s=>who(s.personId)).join(' and ');
  return r.classification==='companionship'?`Both people already carry ${channelLabel(c)} natally.`:r.classification==='electromagnetic'?`${channelLabel(c)} is completed only in combination: ${c.gates.map((g,i)=>unique(c.endpointActivationIds[i].map(id=>who(index.activations.find(a=>a.id===id)!.personId))).join(' and ')+` supplies Gate ${g} (${CENTER_NAMES[c.centers[i]]} Center)`).join('; ')}.`:r.classification==='compromise'?`${full} carries ${channelLabel(c)} natally; ${partial} contributes one endpoint.`:`${full} carries ${channelLabel(c)} natally; the other person supplies neither endpoint.`;
 }
 function buildNode(recordId:string,key:string,label:string,kind:Node['kind'],active:IndexedActivation[],facts:ReadingClaim[],centers:string[],channel?:IndexedChannel):Node|undefined{
  const u=getMeaningUnit(recordId,options.variantId||'r4');
  const decision=u&&resolveMeaningEligibility(u,options);
  const report=(status:string,...reasons:string[])=>trace.records.push({recordId,binding:key,status,reasons});
  if(!u){report('missing-source','RECORD_NOT_AVAILABLE');return;}
  if(!decision?.allowed){report('approval-restricted',...(decision?.reasonCodes||[]));return;}
  const keys=kind==='line'?['mechanical_kernel','trigger_condition','transformational_process','boundary_nonclaim']:['mechanical_kernel','coherent_expression','distorted_expression','boundary_nonclaim'];
  const fields=u.fields.filter(f=>keys.includes(f.fieldKey)&&typeof f.value==='string'&&f.value.trim()&&!excludedReadingField(u,f.fieldKey)&&(kind!=='line'||f.ref.granularity==='exact-line'));
  if(!fields.some(f=>f.fieldKey==='mechanical_kernel')){report('source-restricted',u.fields.some(f=>f.fieldKey==='mechanical_kernel')?'SOURCE_FIELD_EXCLUSION':'KERNEL_MISSING');return;}
  if(!fields.some(f=>f.fieldKey===(kind==='line'?'trigger_condition':'coherent_expression'))){report('missing-source','CONDITION_FIELD_UNAVAILABLE');return;}
  if(!intimate&&fields.some(f=>intimateMeaning(String(f.value)))){report('topic-not-selected','INTIMATE_SOURCE_NOT_SELECTED');return;}
  if(!graph.units.some(x=>x.recordId===u.recordId&&x.variantId===u.variantId))graph.units.push(u);
  const map:Record<string,ReadingClaim>={};
  for(const f of fields){
   const source:ClaimSource={recordId,variantId:u.variantId,fieldKey:f.fieldKey,ref:f.ref,text:String(f.value),shared:f.shared,realization:'faithful-paraphrase-with-canonical-labels'};
   // Exact-Line meaning can survive removal of a duplicate occurrence. An explicit
   // list of planet labels gets its own all-occurrences dependency when rendered.
   const routes=kind==='line'?active.map(a=>({factIds:[],activationIds:[a.id],claimIds:[]})):[{factIds:[],activationIds:[],claimIds:facts.map(f=>f.claimId)}];
   map[f.fieldKey]=save({kind:'sourced-symbolic',scope,propositionKey:`discovery-source:${key}:${f.fieldKey}`,text:String(f.value),factIds:[],activationIds:active.map(a=>a.id),sources:[source],meaningPropositionIds:[`meaning:${recordId}:${f.fieldKey}`],requiredPremiseIds:kind==='line'?[]:facts.map(f=>f.claimId),supportRoutes:routes,rule:null,alternatives:[],qualifications:['Eligible isolated review meaning; original field unchanged.'],disconfirmation:[],forbiddenInferences:[]});
  }
  const features:Feature[]=[];
  for(const [role,pattern] of Object.entries(MEANING_ROLES))for(const fieldKey of ['mechanical_kernel','transformational_process','coherent_expression']){
   const c=map[fieldKey];if(!c)continue;
   const regex=new RegExp(pattern.source,'gi');let match:RegExpExecArray|null;
   while((match=regex.exec(c.text))){
    const before=c.text.slice(Math.max(0,match.index-55),match.index).split(/[.;!?]/).at(-1)!;
    if(/\b(not|no|neither|without|rather than|cannot|can’t|can't)\b/i.test(before))continue;
    const sentences=[...c.text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)];
    const sentence=sentences.find(s=>s.index!<=match!.index&&s.index!+s[0].length>match!.index)?.[0].trim()||c.text;
    if(role==='care'&&/\b(?:support from|require(?:s)? (?:help|assistance|support)|receiv(?:e|ing)|nurturing or protective forces)\b/i.test(sentence))continue;
    const semantic=semanticPremise(role as MeaningRole,sentence,map.mechanical_kernel.text,(map.trigger_condition||map.coherent_expression).text,map.transformational_process?.text||'');
    if(semantic.status==='abstained'){trace.semanticRejections.push({binding:key,fieldKey,match:match[0],premise:semantic});continue;}
    features.push({role:role as MeaningRole,fieldKey,match:match[0],start:match.index,end:match.index+match[0].length,offsetUnit:'UTF-16-code-units',sentence,claimId:c.claimId,semantic});break;
   }
   if(features.some(f=>f.role===role))break;
  }
  report(features.length?'eligible':'eligible-unmodelled',features.length?'SOURCE_ROLES_PROPOSED':'MISSING_SYNTHESIS_ROLE');
  return {key,recordId,label,kind,centers,personIds:unique(active.map(a=>a.personId)),activations:active,facts,fields:map,features,channel};
 }
 const nodes:Node[]=[];
 for(const c of index.channels.filter(c=>c.complete&&c.personId===(pair?null:index.participants[0].personId))){
  const active=c.endpointActivationIds.flat().map(id=>index.activations.find(a=>a.id===id)!);
  const n=buildNode(c.channelId,`channel:${c.channelId}`,channelLabel(c),'channel',active,[completion(c),...ownership(c)],c.centers,c);if(n)nodes.push(n);
 }
 const groups=new Map<string,IndexedActivation[]>();
 for(const a of index.activations){
  if(!a.exactLineEligible||a.line===null){trace.records.push({recordId:`gate-${String(a.gate).padStart(2,'0')}-line-${a.calculatedLine}`,binding:a.id,status:'uncertainty-restricted',reasons:['EXACT_LINE_WITHHELD']});continue;}
  const key=`line:${a.personId}:${a.gate}:${a.line}`;groups.set(key,[...(groups.get(key)||[]),a]);
 }
 for(const [key,active]of groups){
  active.sort((a,b)=>a.id.localeCompare(b.id));const a=active[0];
  const n=buildNode(`gate-${String(a.gate).padStart(2,'0')}-line-${a.line}`,key,`${pair?who(a.personId)+"’s":'your'} Gate ${a.gate}.${a.line} (${CENTER_NAMES[a.center]} Center)`,'line',active,[],[a.center]);if(n)nodes.push(n);
 }
 const chartGraph=pair?index.composite!.facts.topology.combinedGraph:index.graphs[0];
 function topology(a:Node,b:Node){
  const shared=a.centers.filter(c=>b.centers.includes(c));
  const ca=chartGraph.components.filter(c=>a.centers.some(x=>c.centerIds.includes(x as any))),cb=chartGraph.components.filter(c=>b.centers.some(x=>c.centerIds.includes(x as any)));
  const together=ca.some(c=>cb.some(d=>c.id===d.id));
  const facts=index.facts.filter(f=>f.predicate==='definition-component'&&[...ca,...cb].some(c=>(f.value as any).componentId===c.id));
  const required=unique([...a.facts,...b.facts,a.fields.mechanical_kernel,b.fields.mechanical_kernel].map(c=>c.claimId));
  const text=a.kind==='hypothetical'||b.kind==='hypothetical'?'The completed route is hypothetical. Its Center locations are shown for comparison with the actual natal contribution; it is not an additional current definition.':shared.length?`These contributions meet at the ${shared.map(x=>CENTER_NAMES[x as keyof typeof CENTER_NAMES]).join(' and ')} Center${shared.length>1?'s':''}. This locates the contributions; it does not prove that the two experiences occur together.`:together?'Their Centers belong to the same connected network. This is a structural connection, not evidence that the described experiences occur together.':'These contributions do not lie together in one defined network. This does not establish conflict, missing ability or psychological separation.';
  const paths=a.kind!=='hypothetical'&&b.kind!=='hypothetical'&&!shared.length&&together?findPaths(chartGraph,a.centers[0],b.centers[0]):[];
  const routes=paths.length?paths.map(path=>({factIds:facts.map(f=>f.id),activationIds:[],claimIds:unique([...required,...path.map(id=>completion(index.channels.find(c=>c.channelId===id&&c.personId===(pair?null:index.participants[0].personId))!).claimId)])})):[{factIds:facts.map(f=>f.id),activationIds:[],claimIds:required}];
  const support=fact(`topology:${a.key}:${b.key}`,text,routes);
  return {support,text,shared,together,componentIds:unique([...ca,...cb].map(c=>c.id))};
 }
 function allSupport(n:Node){return unique([...n.facts,...Object.values(n.fields)]);}
 function exactBindings(n:Node){
  if(n.kind!=='line')return undefined;
  return fact('labels:'+n.key,n.activations.map(occurrence).join('; ')+'.',[{factIds:[],activationIds:n.activations.map(a=>a.id),claimIds:[]}]);
 }
 const condition=(n:Node)=>clean((n.fields.trigger_condition||n.fields.coherent_expression).text);
 const meaning=(n:Node,role:MeaningRole,structural:boolean)=>clean(structural?n.fields.mechanical_kernel.text:n.features.find(f=>f.role===role)?.sentence||n.fields.mechanical_kernel.text);
 type Proposal={op:RelationshipOperation;a:Node;b:Node;score:number;depth:'standard'|'deep';fullRecord?:boolean;structural?:{text:string;support:ReadingClaim[];witness:unknown;key:string}};
 const proposals:Proposal[]=[];
 // Full-record relational discovery is driven by issued chart relationships and
 // distinct source conditions, not membership in the lexical-role vocabulary.
 const ordered=[...nodes].sort((a,b)=>a.key.localeCompare(b.key));
 const differentConditions=(a:Node,b:Node)=>normalizedMeaning(condition(a))!==normalizedMeaning(condition(b))&&normalizedMeaning(a.fields.mechanical_kernel.text)!==normalizedMeaning(b.fields.mechanical_kernel.text);
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
  const a=ordered[i],b=ordered[j];if(a.kind!=='channel'||b.kind!=='channel'||!differentConditions(a,b))continue;
  const top=topology(a,b),kind=top.shared.length?'shared-function':top.together?'connected-processes':'separate-networks';
  proposals.push({op:recordRelationship(kind,{center:top.shared.map(c=>CENTER_NAMES[c as keyof typeof CENTER_NAMES]).join(' and ')}),a,b,score:44,depth:'standard',fullRecord:true,structural:{text:top.text,support:[top.support],witness:{sharedCenters:top.shared,sameComponent:top.together,componentIds:top.componentIds},key:kind}});
 }
 for(const route of ordered.filter(n=>n.kind==='channel')){
  const ends=route.channel!.gates.map(g=>ordered.filter(n=>n.kind==='line'&&n.activations[0].gate===g));
  for(const a of ends[0])for(const b of ends[1]){
   if(!differentConditions(a,b))continue;
   proposals.push({op:recordRelationship('endpoint-conditions',{route:route.label}),a,b,score:35,depth:'standard',fullRecord:true,structural:{text:`The completed route has this distinct whole-Channel meaning: ${clean(route.fields.mechanical_kernel.text)}`,support:allSupport(route),witness:{channelId:route.recordId,endpointKeys:[a.key,b.key],ownership:route.channel!.relation||null},key:route.key}});
  }
 }

 for(const op of RELATIONSHIP_OPERATIONS){
  const matches:Proposal[]=[];
  for(const a of nodes)for(const b of nodes){
   if(a.key===b.key||a.recordId===b.recordId||!a.features.some(f=>f.role===op.roles[0])||!b.features.some(f=>f.role===op.roles[1]))continue;
   // Do not count a Channel and its own endpoint explanation as two independent subjects.
   if(a.channel&&b.kind==='line'&&a.channel.gates.includes(b.activations[0].gate)||b.channel&&a.kind==='line'&&b.channel.gates.includes(a.activations[0].gate))continue;
   const distinctPeople=pair&&a.personIds.length===1&&b.personIds.length===1&&a.personIds[0]!==b.personIds[0];
   const score=40+Number(a.kind==='channel')*8+Number(b.kind==='channel')*8+Number(distinctPeople)*8+Number(a.centers.some(c=>b.centers.includes(c)))*6;
   matches.push({op,a,b,score,depth:'standard'});
  }
  matches.sort((x,y)=>y.score-x.score||(x.a.key+'|'+x.b.key).localeCompare(y.a.key+'|'+y.b.key));
  // Bound the candidate graph without silently equating the bound to absent evidence.
  proposals.push(...matches);trace.operatorCoverage.push({operator:op.id,matches:matches.length,retained:0});
 }
 // Exact repeated-Line contrasts are conditioned alternatives, not repetition salience.
 for(const group of index.repeatedGates){
  const lines=nodes.filter(n=>n.kind==='line'&&n.activations[0].gate===group.gate);
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
   const a=lines[i],b=lines[j];if(a.activations[0].line===b.activations[0].line||condition(a)===condition(b))continue;
   const conditional=conditionalResponsePair({kernel:a.fields.mechanical_kernel.text,condition:condition(a),process:a.fields.transformational_process?.text||''},{kernel:b.fields.mechanical_kernel.text,condition:condition(b),process:b.fields.transformational_process?.text||''});
   if(!conditional)continue;
   const op=recordRelationship('line-conditions',{});
   proposals.push({op:{...op,title:`Different conditions at Gate ${group.gate} (${CENTER_NAMES[a.activations[0].center]} Center)`},a,b,score:52,depth:'standard',fullRecord:true});
  }
 }
 // An unfinished harmonic is a native counterfactual, never an implicit partner need.
 for(const path of index.unfinishedPaths){
  const a=nodes.find(n=>n.kind==='line'&&n.personIds[0]===path.personId&&n.activations[0].gate===path.presentGate);if(!a)continue;
  const issued=index.facts.find(f=>f.predicate==='unfinished-harmonic-path'&&(f.value as any).id===path.id)!;
  const p=index.participants.find(p=>p.personId===path.personId)!,after=deriveStructure([...p.facts.gates,path.absentGate]);
  const inventory=p.facts.gates.map(g=>gatePresence(path.personId,g).claimId);
  const support=fact('hypothetical:'+path.id,`Adding the absent endpoint changes the natal graph from ${p.facts.definitionIslands.length} to ${after.definitionIslands.length} components.`,path.activationIds.map(id=>({factIds:[issued.id],activationIds:[id],claimIds:inventory})),inventory);
  const b=buildNode(path.channelId,'hypothetical:'+path.id,`hypothetical Channel ${index.channels.find(c=>c.channelId===path.channelId)!.gates.join('–')} (${path.centers.map(c=>CENTER_NAMES[c]).join(' ↔ ')})`,'hypothetical',a.activations,[support],path.centers);if(!b)continue;
  const op:RelationshipOperation={id:'unfinished-harmonic',roles:['direction','expression'],title:`What a completion would change for ${pair?who(path.personId):'this natal chart'}`,conclusion:'An active contribution and a completed route are different kinds of availability.',condition:'This comparison separates what is already present from a specifically calculated alternative.',interaction:`${pair?who(path.personId)+"’s":'Your'} existing exact-Line meaning does not disappear because its harmonic route is unfinished. Adding Gate ${path.absentGate} (${CENTER_NAMES[path.centers[path.presentGate===index.channels.find(c=>c.channelId===path.channelId)!.gates[0]?1:0]]} Center) would make that whole route available and ${after.definitionIslands.length<p.facts.definitionIslands.length?`join currently separate natal networks (${p.facts.definitionIslands.length} to ${after.definitionIslands.length})`:'leave the number of natal networks unchanged'}. The difference concerns how an existing contribution could participate in a larger process, not whether the person is complete.`,experiment:'Compare the existing contribution with the task described by the completed route. A missing route does not establish missing skill, and it is not a reason to seek a person to supply an endpoint.',alternative:'This is a hypothetical natal change. Any route already present in the actual pair is a separate fact.'};
  proposals.push({op,a,b,score:34+Number(after.definitionIslands.length<p.facts.definitionIslands.length)*5,depth:'deep',structural:{text:support.text,support:[support],witness:{path,before:p.facts.definitionIslands,after:after.definitionIslands},key:path.id}});
 }
 // Positive connection witnesses retain alternative paths; one path is not necessity.
 if(pair)for(const natal of index.graphs.filter(g=>g.scope.kind==='participant')){
  for(let i=0;i<natal.components.length;i++)for(let j=i+1;j<natal.components.length;j++){
   const paths=findPaths(chartGraph,natal.components[i].centerIds[0],natal.components[j].centerIds[0]);
   if(paths.length<2)continue;
   const first=paths[0],second=paths.find(p=>p.some(id=>!first.includes(id)));if(!second)continue;
   const a=nodes.find(n=>n.channel&&first.includes(n.recordId)&&!second.includes(n.recordId)),b=nodes.find(n=>n.channel&&second.includes(n.recordId)&&!first.includes(n.recordId));if(!a||!b)continue;
   const dependencies=(path:string[])=>path.map(id=>completion(index.channels.find(c=>c.channelId===id&&c.personId===null)!));
   const components=index.facts.filter(f=>f.predicate==='definition-component'&&[natal.components[i].id,natal.components[j].id].includes((f.value as any).componentId));
   const connected=fact(`alternate-join:${natal.scope.personIds[0]}:${i}:${j}`,'At least one enumerated path joins the two natal components.',paths.map(path=>({factIds:components.map(f=>f.id),activationIds:[],claimIds:dependencies(path).map(c=>c.claimId)})));
   const alternatives=fact(`two-paths:${natal.scope.personIds[0]}:${i}:${j}`,'Two distinct sufficient paths are available.',[{factIds:components.map(f=>f.id),activationIds:[],claimIds:unique([...dependencies(first),...dependencies(second)].map(c=>c.claimId))}]);
   const op:RelationshipOperation={id:'alternative-connectivity',roles:['direction','change'],title:'The same connection can support different kinds of exchange',conclusion:'One way of connecting the natal networks is not the only available way.',condition:'This matters when one kind of shared activity is being treated as indispensable to the connection.',interaction:`For ${who(natal.scope.personIds[0])}, two separate natal networks connect through at least two routes in the pair. The distinctive contributions below belong to different sufficient paths, so their symbolic processes are alternatives rather than interchangeable descriptions of one edge. Losing one path does not establish loss of every connection.`,experiment:'If one shared activity is unhelpful, consider an activity suited to the other contribution and compare what actually changes. A graph alternative does not promise an emotional outcome.',alternative:'The enumerated paths are sufficient witnesses, not an exhaustive ranking of relationships or a claim that another person is necessary.'};
   const shared=first.filter(id=>second.includes(id)),exclusiveA=first.filter(id=>!second.includes(id)),exclusiveB=second.filter(id=>!first.includes(id));
   const describe=(path:string[])=>path.map(id=>channelLabel(index.channels.find(c=>c.channelId===id&&c.personId===null)!)).join(' → ');
   const allEdges=unique([...first,...second]).map(id=>index.channels.find(c=>c.channelId===id&&c.personId===null)!);
   const pathMeaning=`The first complete path is ${describe(first)}. The second is ${describe(second)}. ${shared.length?`Both depend on ${describe(shared)}. Removing one of those shared Channels breaks both displayed paths; another unlisted path may still exist.`:'The displayed paths share no Channel edges. This is edge redundancy, not independence of their activation or person dependencies.'} Removing a Channel exclusive to the first path leaves the second displayed path; the converse holds for the second. ${allEdges.map(ownershipWords).join(' ')}`;
   op.interaction+=' '+pathMeaning;
   proposals.push({op,a,b,score:60,depth:'deep',structural:{text:alternatives.text,support:[connected,alternatives,...allEdges.flatMap(c=>[completion(c),...ownership(c)])],witness:{personId:natal.scope.personIds[0],paths,representativePaths:[first,second],sharedEdges:shared,exclusiveEdges:[exclusiveA,exclusiveB],connectionClaimId:connected.claimId,twoPathClaimId:alternatives.claimId},key:`${natal.scope.personIds[0]}:${i}:${j}`}});
  }
 }
 // Preserve different supported predicates for a pair; wrappers do not create novelty.
 const meaningFor=(p:Proposal):RelationalMeaning=>({predicate:p.op.id,
  arguments:[p.a,p.b].map(n=>({kernel:n.fields.mechanical_kernel.text,condition:condition(n),process:n.fields.transformational_process?.text||n.fields.coherent_expression?.text||'',expressions:{coherent:n.fields.coherent_expression?.text||null,distorted:n.fields.distorted_expression?.text||null},limitations:n.fields.boundary_nonclaim?.text||null})),
  consequence:p.structural?stableWitness(p.structural.witness):null,
  perspective:unique([...p.a.personIds,...p.b.personIds]).sort()});
 const usedRelations=new Set<string>();
 proposals.sort((a,b)=>b.score-a.score||(a.op.id+':'+a.a.key+':'+a.b.key).localeCompare(b.op.id+':'+b.a.key+':'+b.b.key));
 const distinct=proposals.filter(p=>{const k=relationIdentity(meaningFor(p)).conclusion;if(usedRelations.has(k)){trace.proposalDispositions.push({key:k,reason:'same-supported-proposition',nodeKeys:[p.a.key,p.b.key]});return false;}usedRelations.add(k);return true;});
 // Coverage-aware bounds: select the next candidate with the most unused source
 // meanings. A high-volume family cannot crowd all other records out first.
 function bound(pool:Proposal[],limit:number){const selected:Proposal[]=[],seen=new Set<string>();while(pool.length){pool.sort((a,b)=>{
  const score=(p:Proposal)=>p.score+[p.a.recordId,p.b.recordId].filter(id=>!seen.has(id)).length*14;
  return score(b)-score(a)||(a.op.id+':'+a.a.key+':'+a.b.key).localeCompare(b.op.id+':'+b.a.key+':'+b.b.key);
 });const p=pool.shift()!;if(selected.length>=limit){trace.proposalDispositions.push({key:relationIdentity(meaningFor(p)).conclusion,reason:'candidate-budget-not-missing-content',nodeKeys:[p.a.key,p.b.key]});continue;}selected.push(p);seen.add(p.a.recordId);seen.add(p.b.recordId);}return selected;}
 const bounded=[...bound(distinct.filter(p=>p.depth==='standard'),32),...bound(distinct.filter(p=>p.depth==='deep'),24)];
 for(const row of trace.operatorCoverage)row.retained=bounded.filter(p=>p.op.id===row.operator).length;
 for(const op of unique(distinct.map(p=>p.op.id)))if(!trace.operatorCoverage.some(r=>r.operator===op))trace.operatorCoverage.push({operator:op,matches:distinct.filter(p=>p.op.id===op).length,retained:bounded.filter(p=>p.op.id===op).length});
 for(const row of trace.records){if(!['eligible','eligible-unmodelled'].includes(row.status))continue;const usable=bounded.some(p=>p.a.key===row.binding||p.b.key===row.binding);if(usable){row.status='eligible';row.reasons=unique([...row.reasons.filter(r=>r!=='MISSING_SYNTHESIS_ROLE'),'FULL_RECORD_RELATIONSHIP_AVAILABLE']);}}
 for(const p of bounded){
  // One interpreted pair can witness different component joins or routes. Keep
  // those propositions distinct without introducing clock/provenance identity.
  const {a,b,op}=p,relationKey=[a.key,b.key].sort().join('|'),key=`${op.id}:${relationKey}${p.structural?':'+contentHash(stableWitness(p.structural.witness)):''}`,top=topology(a,b),meaningContract=meaningFor(p),identity=relationIdentity(meaningContract);
  const scopeKind:DiscoveryCandidate['scope']=!pair?'individual':op.id==='unfinished-harmonic'?'natal-background':unique([...a.personIds,...b.personIds]).length>=2?'pair-derived':'natal-background';
  const support=unique([...allSupport(a),...allSupport(b),top.support,...(p.structural?.support||[])]),ids=support.map(c=>c.claimId);
  const base={a:a.recordId,b:b.recordId,operator:op.id};
  const sentences:{key:string;role:string;text:string;support:ReadingClaim[]}[]=[
   {key:'discovery',role:'synthesis',text:op.conclusion+' '+op.interaction,support},
   {key:'meaning-a',role:'interpretation',text:`${a.label.charAt(0).toUpperCase()+a.label.slice(1)} describes this contribution: ${meaning(a,op.roles[0],!!p.structural||!!p.fullRecord)}`,support:allSupport(a)},
   {key:'meaning-b',role:'interpretation',text:`${b.label.charAt(0).toUpperCase()+b.label.slice(1)} supplies the other part: ${meaning(b,op.roles[1],!!p.structural||!!p.fullRecord)}`,support:allSupport(b)},
   {key:'conditions',role:'condition',text:`${op.condition} ${condition(a)} ${condition(b)}`,support},
   {key:'topology',role:'mechanics',text:top.text,support:[top.support,...a.facts,...b.facts]},
   {key:'experiment',role:'application',text:op.experiment+' '+op.alternative,support},
  ];
  if(op.id==='conditional-line-difference'){
   const aProcess=a.fields.transformational_process,bProcess=b.fields.transformational_process;
   if(!aProcess||!bProcess)continue;
   const gate=a.activations[0].gate,center=CENTER_NAMES[a.activations[0].center];
   const aCondition=condition(a),bCondition=condition(b);
   sentences.splice(0,sentences.length,
    {key:'discovery',role:'synthesis',text:`The repeated Gate ${gate} (${center} Center) contains two condition-dependent responses. The important choice is which situation is present, rather than which Line is stronger. A response that fits one branch can miss what the other branch is asking for.`,support},
    {key:'branch-a',role:'interpretation',text:`${a.label.charAt(0).toUpperCase()+a.label.slice(1)} applies when ${lower(end(aCondition))}. ${clean(aProcess.text)}`,support:allSupport(a)},
    {key:'branch-b',role:'interpretation',text:`${b.label.charAt(0).toUpperCase()+b.label.slice(1)} addresses a different condition: ${lower(bCondition)} ${clean(bProcess.text)}`,support:allSupport(b)},
    {key:'conditions',role:'synthesis',text:`Read together, the two Lines make the condition itself the deciding factor. If both situations are present, preserve both requirements instead of letting the more familiar response settle the whole question. If neither fits, the repetition alone supplies no instruction.`,support},
    {key:'experiment',role:'application',text:`Compare a situation matching the first condition with one matching the second. Name what would have to change for the other response to become appropriate. This is a proposed way to use the two symbolic accounts, not a prediction of how you behave.`,support});
  }
  // No generic assertion of reciprocal influence. Exact ownership and separately
  // supported conditions remain; directional effects require their own predicates.
  if(p.fullRecord&&p.structural&&op.id==='endpoint-conditions')sentences.splice(3,0,{key:'whole-route',role:'interpretation',text:p.structural.text,support:p.structural.support});
  const bindings=[exactBindings(a),exactBindings(b)].filter((c):c is ReadingClaim=>!!c);
  if(bindings.length)sentences.push({key:'occurrences',role:'mechanics',text:'The exact occurrences behind this comparison are '+bindings.map(c=>end(c.text)).join('; ')+'.',support:bindings});
  if(pair){const owners=[a.channel,b.channel].filter((c):c is IndexedChannel=>!!c);if(owners.length)sentences.push({key:'ownership',role:'mechanics',text:owners.map(ownershipWords).join(' '),support:owners.flatMap(c=>[completion(c),...ownership(c)])});}
  const roots=sentences.map(s=>{
   const required=unique(s.support.map(c=>c.claimId));
   return save({kind:s.role==='application'?'reflective-prompt':s.role==='mechanics'?'computed-fact':'conditional-synthesis',scope,propositionKey:`discovery:${key}:${s.key}`,text:clean(s.text),argument:{recipe:'discovery:'+op.id,clauseKey:s.key,role:s.role,relationshipKeys:s.key==='discovery'?[identity.conclusion]:[],breakBefore:['conditions','experiment','occurrences'].includes(s.key)},factIds:unique(s.support.flatMap(c=>c.factIds)),activationIds:unique(s.support.flatMap(c=>c.activationIds)),sources:[],meaningPropositionIds:[],requiredPremiseIds:required,supportRoutes:[{factIds:[],activationIds:[],claimIds:required}],rule:makeRule('contextual-meaning',required),alternatives:[op.alternative],qualifications:['Proposed combination of symbolic meanings, not established psychological causation.',op.id==='conditional-line-difference'?'Each response applies only under its own source condition; the two situations need not occur together.':'Both source conditions must be applicable.','No planet/side psychological modifier inferred.'],disconfirmation:['Withdraw this clause when any necessary meaning, condition or issued structural premise disappears.','Alternative activation routes support presence; they cannot replace a different person, exact Line or missing condition.'],forbiddenInferences:[]});
  });
  const insight=makeInsight({propositionKey:'discovery:'+key,mechanism:'discovery:'+op.id,claimIds:roots.map(c=>c.claimId),requiredPremiseIds:ids,sectionIds:pair?['C04','C05','C11','SYN-I']:['I07','I09','I13','I14'],relationKind:'contextual-meaning',discoveryDepth:p.depth,priority:p.score,salienceReason:JSON.stringify(base),semanticKey:key,themeKey:p.fullRecord&&op.id!=='conditional-line-difference'?'background-mechanism:'+op.id:identity.topic,themeTitle:op.title,expressedRelations:[identity.conclusion],discoveryMeaning:{conclusionKey:contentHash(op.id==='conditional-line-difference'?{conditionalResponses:meaningContract.arguments.map(a=>[normalizedMeaning(a.condition),normalizedMeaning(a.process)]).sort()}:p.fullRecord?{genericComparison:op.id}:{conclusion:normalizedMeaning(op.conclusion),interaction:normalizedMeaning(op.interaction)}),meaningKeys:identity.meaningKeys,consequenceKey:contentHash(meaningContract.consequence),substantiveConsequence:!!p.structural&&!p.fullRecord,predicate:op.id,scope:scopeKind}});output.push(insight);
  trace.candidates.push({key,operator:op.id,nodeKeys:[a.key,b.key],recordIds:[a.recordId,b.recordId],premiseClaimIds:ids,featureBindings:p.fullRecord?[]:[...a.features.filter(f=>f.role===op.roles[0]),...b.features.filter(f=>f.role===op.roles[1])],interactionMechanism:op.interaction,conditions:[condition(a),condition(b)],limitations:[op.alternative,...trace.limits],counterfactual:['Recalculate a valid input after changing a relevant activation; re-evaluate source roles and graph relation.','Remove a required source/condition/ownership fact; the affected clause must retract.'],insightId:insight.insightId,depth:p.depth,structuralWitness:p.structural?.witness||{sharedCenters:top.shared,sameComponent:top.together,componentIds:top.componentIds},meaning:meaningContract,scope:scopeKind});
 }
 if(pair){
  const availability={factIds:new Set(index.facts.map(f=>f.id)),activationIds:new Set(index.activations.map(a=>a.id)),sourceIdentities:new Set(claims.flatMap(c=>c.sources).map(sourceIdentity))};
  const withoutEach=index.participants.map(person=>new Set(claimRemovalCheck(claims,availability,{activationIds:index.activations.filter(a=>a.personId===person.personId).map(a=>a.id)}).validClaimIds));
  for(const i of output){const row=trace.candidates.find(c=>c.insightId===i.insightId)!;const root=i.claimIds.find(id=>byId.get(id)?.argument?.clauseKey==='discovery')!;
   const dependent=row.operator!=='unfinished-harmonic'&&withoutEach.every(valid=>!valid.has(root));
   row.scope=dependent?'pair-derived':'natal-background';i.discoveryMeaning!.scope=row.scope;
  }
 }
 return {insights:output,trace};
}

/** Enumerates bounded simple paths. No assertion of completeness or uniqueness. */
function findPaths(graph:StructureGraphV1,start:string,end:string,limit=16):string[][]{
 const found:string[][]=[];
 function visit(at:string,seen:Set<string>,path:string[]){
  if(found.length>=limit)return;
  if(at===end){found.push(path);return;}
  for(const e of graph.edges.slice().sort((a,b)=>a.channelId.localeCompare(b.channelId))){
   if(!e.centers.includes(at as any))continue;const next=e.centers.find(x=>x!==at)!;if(seen.has(next))continue;
   visit(next,new Set([...seen,next]),[...path,e.channelId]);
  }
 }
 visit(start,new Set([start]),[]);return found.sort((a,b)=>a.length-b.length||a.join('|').localeCompare(b.join('|')));
}

/** Provenance hashes and ordered presentation roles cannot affect semantic ranking. */
function stableWitness(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stableWitness);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['id','componentIds','connectionClaimId','twoPathClaimId','scope','activationIds','endpointActivationIds','requiredActivationIds'].includes(k)).map(([k,v])=>[k,stableWitness(v)]));
 return value;
}
