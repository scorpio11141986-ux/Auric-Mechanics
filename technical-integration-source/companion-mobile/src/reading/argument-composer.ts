import {contentHash} from '../domain/composite-hash';
import {deriveStructure} from '../domain/calculator';
import {CENTER_NAMES} from '../domain/contracts';
import type {ReadingChartIndex, IndexedChannel, IndexedActivation} from './contracts';
import {makeClaim,makeInsight,makeRule,unique,type ReadingClaim,type ReadingInsight} from './insights';
import pins from './argument-source-pins.json';

/** Bounded review-only argument grammar, not a new approved interpretation corpus.
 * Each authored paraphrase/connection is bound to named, pinned source premises.
 * No fixture ID, birth date, stored paragraph or model completion selects prose.
 * Unsupported subjects remain in the legacy candidate/context graph, not filled in.
 */
export function composeArgumentInsights(index:ReadingChartIndex,graph:{claims:ReadingClaim[];insights:ReadingInsight[]}){
 const claims=graph.claims, sources=unique(claims.flatMap(c=>c.sources));
 const scope={context:index.context,personIds:index.participants.map(p=>p.personId),chartRevisionIds:index.participants.map(p=>p.chartVersionId),worldIds:[`point:${index.indexHash}`]};
 const pair=index.context==='composite';
 const name=(id:string)=>index.participants.find(p=>p.personId===id)!.birth.name;
 const ch=(id:string)=>index.channels.find(c=>c.channelId===id&&c.complete&&c.personId===(pair?null:index.participants[0].personId));
 const label=(c:IndexedChannel)=>`Channel ${c.gates.join('–')} (${c.centers.map(x=>CENTER_NAMES[x]).join(' ↔ ')})`;
 const gate=(a:IndexedActivation)=>`Gate ${a.gate}.${a.line} (${CENTER_NAMES[a.center]} Center)`;
 const occurrence=(a:IndexedActivation)=>`${pair?name(a.personId)+"'s":'your'} ${a.side==='design'?'Design':'Personality'} ${a.planet} at ${gate(a)}`;
 const sorted=index.activations.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const find=(g:number,l:number,personId?:string)=>sorted.find(a=>a.gate===g&&a.line===l&&a.exactLineEligible&&(!personId||a.personId===personId));
 const output:ReadingInsight[]=[];
 function fact(c:IndexedChannel){return claims.find(x=>x.kind==='computed-fact'&&x.text===`${label(c)} is complete.`)!;}
 function ownership(c:IndexedChannel){return !pair?[]:claims.filter(x=>x.kind==='computed-fact'&&x.text.includes(label(c))&&x.text!==`${label(c)} is complete.`);}
 function ownershipText(c:IndexedChannel){
  const r=c.relation!,full=r.fullOwnerIds.map(name).join(' and ');
  if(r.classification==='electromagnetic')return 'Each person supplies a different endpoint; neither has the whole route natally.';
  if(r.classification==='companionship')return 'Both people already have the whole route in their own natal charts.';
  const other=r.endpointStates.filter(s=>s.state!==3).map(s=>name(s.personId)).join(' and ');
  return `${full} already has the whole route natally; ${other} supplies ${r.classification==='dominance'?'neither endpoint':'a partial contribution'}.`;
 }
 function source(record:string,key:string,activationIds:string[],routes:string[][]=[activationIds]):ReadingClaim|undefined{
  const s=sources.find(s=>s.recordId===record&&s.fieldKey===key&&s.variantId==='r4');
  const pin=(pins as Record<string,string>)[record+':'+key];
  if(!s||!pin||contentHash({text:s.text,ref:s.ref})!==pin)return;
  const c=makeClaim({kind:'sourced-symbolic',scope,propositionKey:`argument-source:${record}:${key}:${activationIds.join('|')}`,text:s.text,
   sources:[s],activationIds,factIds:[],meaningPropositionIds:[`meaning:${record}:${key}`],requiredPremiseIds:[],
   supportRoutes:routes.map(activationIds=>({factIds:[],activationIds,claimIds:[]})),rule:null,alternatives:[],qualifications:['Pinned R4 field; isolated review permission only.'],disconfirmation:[],forbiddenInferences:[]});
  if(!claims.some(x=>x.claimId===c.claimId))claims.push(c);return c;
 }
 function fields(c:IndexedChannel,keys=['mechanical_kernel','coherent_expression','distorted_expression','boundary_nonclaim']){
  const routes=c.endpointActivationIds[0].flatMap(a=>c.endpointActivationIds[1].map(b=>[a,b]));
  return keys.map(k=>source(c.channelId,k,c.endpointActivationIds.flat(),routes));
 }
 function line(a:IndexedActivation,keys=['mechanical_kernel','trigger_condition','transformational_process','boundary_nonclaim']){
  return keys.map(k=>source(`gate-${String(a.gate).padStart(2,'0')}-line-${a.line}`,k,[a.id]));
 }
 function equivalentLine(a:IndexedActivation){
  const ids=sorted.filter(b=>b.personId===a.personId&&b.gate===a.gate&&b.line===a.line&&b.exactLineEligible).map(b=>b.id);
  return ['mechanical_kernel','trigger_condition','transformational_process','boundary_nonclaim'].map(k=>source(`gate-${String(a.gate).padStart(2,'0')}-line-${a.line}`,k,ids,ids.map(id=>[id])));
 }
 function componentWitness(key:string,componentIds:string[],premises:ReadingClaim[],text:string){
  const facts=index.facts.filter(f=>f.predicate==='definition-component'&&componentIds.includes((f.value as {componentId:string}).componentId));
  if(facts.length!==unique(componentIds).length)return;
  const ids=premises.map(c=>c.claimId);
  const c=makeClaim({kind:'computed-fact',scope,propositionKey:`argument:topology:${key}`,text,factIds:facts.map(f=>f.id),activationIds:[],sources:[],meaningPropositionIds:[],requiredPremiseIds:ids,
   supportRoutes:[{factIds:facts.map(f=>f.id),activationIds:[],claimIds:ids}],rule:null,alternatives:[],qualifications:['Graph relation only; no causal or psychological conclusion.'],disconfirmation:[],forbiddenInferences:[]});claims.push(c);return c;
 }
 const ready=(p:(ReadingClaim|undefined)[]):p is ReadingClaim[]=>p.every(Boolean);
 type Sentence={key:string;text:string;support:ReadingClaim[];role:'interpretation'|'condition'|'application'|'alternative'|'mechanics'|'synthesis';relations?:string[]};
 function add(key:string,title:string,depth:'quick'|'standard'|'deep',sentences:Sentence[],priority:number){
  const roots=sentences.map(s=>{
   const ids=unique(s.support.map(c=>c.claimId));
   const c=makeClaim({kind:s.role==='application'?'reflective-prompt':'conditional-synthesis',scope,propositionKey:`argument:${key}:${s.key}`,text:s.text.charAt(0).toUpperCase()+s.text.slice(1),
    argument:{recipe:key,clauseKey:s.key,role:s.role,relationshipKeys:s.relations||[],breakBefore:s.role==='application'||s.key==='discovery'||s.key==='alternative-process'},
    factIds:unique(s.support.flatMap(c=>c.factIds)),activationIds:unique(s.support.flatMap(c=>c.activationIds)),sources:[],meaningPropositionIds:[],requiredPremiseIds:ids,
    supportRoutes:[{factIds:[],activationIds:[],claimIds:ids}],rule:makeRule('contextual-meaning',ids),
    alternatives:['An illustrative possibility, not a report of behavior; ordinary task constraints or learned habits may explain it.'],
    qualifications:['Only the stated condition licenses the proposed relationship.','No planet/side psychological modifier is inferred.'],
    disconfirmation:['If the described situation does not occur, do not apply this interpretation.','Remove any necessary source, activation or issued fact and withdraw this sentence.'],forbiddenInferences:[]});
   claims.push(c);return c;
  });
  const sectionIds=pair?(key==='thesis'?['C11']:key==='creative-join'?['C03','C05','C11','SYN-F','SYN-G']:key==='story-evidence'?['C04','C11','SYN-I']:['C03','C04','C11','SYN-I',...(['rhythm','skill'].includes(key)?['C06']:[])])
   :key==='thesis'?['I01','I13']:key==='depth-expression'?['I07','I09','I10','I13']:['I08','I13','I14',...(key==='rhythm'?['I09']:[])];
  output.push(makeInsight({propositionKey:`argument:${key}:${contentHash(scope)}`,mechanism:`argument:${key}`,claimIds:roots.map(c=>c.claimId),requiredPremiseIds:unique(roots.flatMap(c=>c.requiredPremiseIds)),
   sectionIds,relationKind:depth==='quick'?'parallel-network-contrast':depth==='deep'?'contextual-meaning':'completed-endpoint-interaction',
   discoveryDepth:depth,priority,salienceReason:'Supported argument: '+key,semanticKey:`argument:${key}`,themeKey:`argument:${key}`,themeTitle:title,
   expressedRelations:unique(sentences.flatMap(s=>s.relations||[]))}));
 }
 const rhythm=ch('channel-05-15'),story=ch('channel-11-56'),instinct=ch('channel-10-57'),skill=ch('channel-16-48'),logic=ch('channel-17-62');
 const rf=rhythm&&fields(rhythm),sf=story&&fields(story),inf=instinct&&fields(instinct),skf=skill&&fields(skill),lf=logic&&fields(logic);
 const a5=find(5,1),a15=find(15,5),a48=find(48,3),b48=find(48,6);
 const l5=a5&&line(a5),l15=a15&&line(a15),l48=a48&&line(a48),l486=b48&&line(b48);
 const anchor=pair?skill:instinct,af=pair?skf:inf;
 if(rhythm&&story&&anchor&&rf&&sf&&af&&ready(rf)&&ready(sf)&&ready(af)){
  const main=[fact(rhythm),fact(story),fact(anchor),rf[0],sf[0],af[0]];
  add('thesis','A pace, a voice, and a test of what is ready','quick',[
   {key:'organizing',role:'synthesis',support:main,text:pair
    ?`The useful question for ${name(index.participants[0].personId)} and ${name(index.participants[1].personId)} is how to make room for a workable pace, an engaging idea and a skill that still needs practice. Those are different contributions; enthusiasm in one area need not settle the others.`
    :'A useful way to read this chart is to separate a workable pace, an engaging idea and a bodily sense that something needs adjusting. You can explore all three without asking one to answer for the others.'},
   {key:'anchors',role:'interpretation',support:main,text:`${label(rhythm)} supplies the rhythm theme; ${label(story)} gives ideas a narrative outlet; ${label(anchor)} adds ${pair?'the development of skill through practice':'present-time adjustment of behavior'}.`,relations:['overview:pace-voice-readiness']},
   {key:'test',role:'application',support:[...main,...rf,...sf,...af],text:pair
    ?'In a collaboration, you could agree on a manageable rhythm, share an idea with someone who wants to hear it, and test the proposed technique before promising a result. If ordinary workload or training explains the difficulty better, use that explanation.'
    :'For example, when beginning a project, you could keep a rhythm that still works, offer the idea to a willing listener, and leave room to adjust what feels wrong without declaring that feeling infallible. If these distinctions do not fit your experience, there is no reason to force the reading.'}
  ],200);
 }
 if(rhythm&&rf&&ready(rf)&&a5&&a15&&l5&&l15&&ready(l5)&&ready(l15)){
  const structural=[fact(rhythm),...ownership(rhythm)],both=[...structural,...rf,...l5,...l15];
  add('rhythm','Keep the rhythm; reconsider the schedule','standard',[
   {key:'conclusion',role:'interpretation',support:both,text:`Consistency here can mean returning to something workable, rather than refusing to change. ${label(rhythm)} connects persistence with sensitivity to changing conditions.`,relations:['rhythm:resilience-versus-recalibration']},
   {key:'line5',role:'condition',support:[...structural,...l5],text:`With ${occurrence(a5)}, the relevant test is disruption: can a useful cadence resume after an interruption without treating the interruption as proof that the whole pattern was wrong?`},
   {key:'line15',role:'condition',support:[...structural,...l15],text:`${occurrence(a15)} poses a different test: when the environment has changed enough that yesterday's balance no longer works, adjust proportionally and stop before adjustment becomes overcompensation.`},
   {key:'scope',role:'mechanics',support:both,text:pair
    ?`${ownershipText(rhythm)} Its presence in the pair does not make either person's timing a rule for the other. The contribution describes chart structure, not who controls the relationship.`
    :'The two conditions distinguish an interruption from a changed situation. Persistence need not preserve a schedule that no longer works, and sensitivity need not mean reorganizing everything whenever someone else prefers a different pace.'},
   {key:'example',role:'application',support:both,text:pair
    ?'For example, after a missed practice session, one person could resume a familiar pattern while the other negotiates a different slot. A sustainable agreement would make room for both; repeated exhaustion or disregard for commitments would be reasons to revise it.'
    :'For example, after missing one morning of a project, you might resume the next day; after a lasting change in your working hours, you might redesign the routine. Which problem you are facing matters more than defending consistency as a virtue in itself.'},
   {key:'thesis-link',role:'synthesis',support:[...both,...(sf&&ready(sf)?sf:[])],text:'This gives the rest of the reading a practical foundation: a rhythm can make space for exploration, but it cannot decide whether an idea is accurate or a skill is ready.'}
  ],130);
 }
 if(story&&sf&&ready(sf)){
  const support=[fact(story),...ownership(story),...sf];
  add('story','Let a story open something, without making it prove everything','standard',[
   {key:'conclusion',role:'interpretation',support,text:`${label(story)} offers a way to give experience meaning through ideas and stories. Its value is the possibility it opens for a listener, rather than a promise of final answers.`,relations:['story:invited-meaning-not-proof']},
   {key:'condition',role:'condition',support,text:'That distinction matters when an experience is vivid but its meaning is still unsettled. A receptive audience makes room to explore it; the pressure to keep someone interested can instead reward exaggeration or endless novelty.'},
   {key:'ownership',role:'mechanics',support,text:pair
    ?`${ownershipText(story)} Neither person is obliged to listen indefinitely or agree with an interpretation simply because this theme is available in the pair.`
    :'This route connects the Ajna and Throat Centers: ideas have an avenue into expression. That is a mechanical connection, not proof of accuracy or a guarantee that an audience will be interested.'},
   {key:'example',role:'application',support,text:pair
    ?'During a shared project, one person might offer a story that reveals a possibility while the other asks whether this is a time to explore or a time to decide. Trying that distinction can protect curiosity without turning attention into an obligation.'
    :'When describing a difficult meeting, you might say what it suggested to you while leaving room for another account. A listener can find the story illuminating without accepting it as evidence of what everyone intended.'},
   {key:'alternative',role:'alternative',support,text:'If the account becomes more interesting as it becomes less accurate, that is a reason to slow down, not evidence that the channel is working especially well. If no one wants the story now, a different time or a shorter account may be enough.'},
   {key:'thesis-link',role:'synthesis',support,text:'Within the larger argument, this is the exploratory voice: give it room, while keeping interpretation distinct from an observed fact.'}
  ],120);
 }
 if(!pair&&instinct&&inf&&ready(inf)){
  const support=[fact(instinct),...inf];
  const shared=index.graphs[0].components.find(c=>['Sacral','G','Spleen'].every(center=>c.centerIds.includes(center as any)));
  const connection=rhythm&&shared?componentWitness('rhythm-instinct',[shared.id],[fact(rhythm),fact(instinct)],'Channels 5–15 and 10–57 meet at G in the same natal component.'):undefined;
  const discovery=connection&&rf&&ready(rf)&&l5&&l15&&ready(l5)&&ready(l15)?[connection,...support,fact(rhythm!),...rf,...l5,...l15]:undefined;
  add('instinct','Make an adjustment without performing perfection','standard',[
   {key:'conclusion',role:'interpretation',support,text:`${label(instinct)} links behavior and identity with immediate sensory awareness. Its symbolic emphasis is a responsive adjustment to what is sensed now, not a performance of being a perfectly authentic person.`,relations:['instinct:calibration-not-perfection']},
   {key:'condition',role:'condition',support,text:'If a setting or way of acting feels subtly wrong, this offers a lens for trying a modest change. It does not establish that the feeling identifies a danger, or that every impulse deserves to direct a decision.'},
   {key:'example',role:'application',support,text:'You might move to a quieter place before continuing a conversation, then check whether you can attend more easily. If nothing improves, noise may not have been the issue; fatigue, disagreement or an ordinary practical concern may explain more.'},
   {key:'alternative',role:'alternative',support,text:'The difficult possibility is to turn sensitivity into constant vigilance, or to monitor whether every movement looks correct. An unforced adjustment leaves room for feedback; perfectionism keeps demanding another correction.'},
   ...(discovery?[{key:'discovery',role:'synthesis' as const,support:discovery,text:'Here is the connection that changes the rhythm question: 5–15 and 10–57 meet at the G (Identity) Center, in the same network linking Sacral rhythm and Spleen awareness. Read with the exact 5.1 and 15.5 conditions, a proposed distinction emerges: returning to a rhythm can include changing how you enact it. If a disturbance passes, resume; if the setting remains unsuitable, a small bodily adjustment can preserve the activity instead of preserving its old form. Neither persistence alone nor sensitivity alone supplies that decision rule.',relations:['rhythm-instinct:conditional-continuity-through-adjustment']},
    {key:'discovery-test',role:'application' as const,support:discovery,text:'Suppose you still want a daily conversation, but a noisy room repeatedly makes it hard to attend. Keeping the conversation while moving rooms tests continuity through adjustment. If the difficulty persists elsewhere, revise the explanation. The shared Center is a calculated connection; the proposed cooperation between rhythm and awareness is a symbolic hypothesis, not proof of an automatic response.'}]:[])
  ],110);
 }
 if(pair&&skill&&skf&&ready(skf)&&a48&&b48&&a48.personId!==b48.personId&&skill.relation!.classification==='compromise'&&skill.relation!.fullOwnerIds.includes(b48.personId)&&!skill.relation!.fullOwnerIds.includes(a48.personId)&&l48&&l486&&ready(l48)&&ready(l486)){
  const support=[fact(skill),...ownership(skill),...skf,...l48,...l486];
  const owner=skill.relation!.fullOwnerIds.map(name).join(' and ');
  const aGraph=index.graphs.find(g=>g.scope.kind==='participant'&&g.scope.personIds[0]===a48.personId)!;
  const bGraph=index.graphs.find(g=>g.scope.kind==='participant'&&g.scope.personIds[0]===b48.personId)!;
  const aEnds=skill.centers.map(center=>aGraph.components.find(c=>c.centerIds.includes(center)));
  const bTogether=bGraph.components.find(c=>skill.centers.every(center=>c.centerIds.includes(center)));
  const topology=aEnds.every(Boolean)&&aEnds[0]!.id!==aEnds[1]!.id&&bTogether?componentWitness('asymmetric-skill',[...aEnds.map(c=>c!.id),bTogether.id],[fact(skill),...ownership(skill)],'The skill edge joins separate natal components for the partial contributor; the full owner already has both Centers connected.'):undefined;
  const equivalent=equivalentLine(b48);
  const discovery=topology&&ready(equivalent)?[topology,fact(skill),...ownership(skill),...skf,...l48,...equivalent]:undefined;
  add('skill','Make depth useful without demanding that it perform','standard',[
   {key:'conclusion',role:'interpretation',support,text:`${label(skill)} connects depth with technique developed through practice. ${owner} already has the full natal route; the other contribution does not need to imitate that person's readiness to be worth hearing.`,relations:['skill:practice-versus-premature-performance']},
   {key:'delay',role:'condition',support:[fact(skill),...l48],text:`${occurrence(a48)} describes a period in which depth may be present but unavailable, unrecognized or difficult to communicate. Anxiety that it will never be useful is part of that account; eventual successful expression is not promised.`},
   {key:'reciprocity',role:'condition',support:[fact(skill),...l486],text:`${occurrence(b48)} concerns a different condition: a mature resource being used by others. Giving can sustain it when the exchange creates real value; generosity alone does not establish depth or transformative usefulness.`},
   {key:'relation',role:'synthesis',support,text:'Read together, these are different stages and tests, not a ranking of two people. An invitation to share can be helpful without becoming a demand to demonstrate; someone who offers expertise can also check whether it is useful to the person receiving it.',relations:[`meaning-comparison:${[`${a48.personId}:48:3`,`${b48.personId}:48:6`].sort().join('|')}`]},
   ...(discovery?[{key:'discovery',role:'synthesis' as const,support:discovery,text:`The less obvious difference is what this same route adds. For ${name(a48.personId)}, the Spleen and Throat lie in separate natal networks; 16–48 connects them in the pair. For ${name(b48.personId)}, this exact route is already natal. Combining that asymmetry with 48.3's difficult availability and 48.6's test of useful exchange suggests a possible mismatch in feedback: what feels like an ordinary invitation to demonstrate for one person may arrive before the other's depth is ready to be shown. This is a proposed interaction to check, not a diagnosis of either person.`,relations:['skill:asymmetric-natal-bridge-and-feedback-readiness']},
    {key:'discovery-boundary',role:'condition' as const,support:discovery,text:`A useful experiment would distinguish an invitation to explore from a request to perform, and let the recipient choose. The graph does not make ${name(b48.personId)} more skilled or ${name(a48.personId)} dependent; practice and the actual response to feedback decide whether the hypothesis helps. This practice route is a sufficient bridge; that alone does not establish that it is the only bridge.`}]:[]),
   {key:'example',role:'application',support,text:'In a rehearsal, you could try one small piece, ask for specific feedback and agree that unfinished work need not become a polished performance today. Equally, endless preparation or unsolicited criticism can prevent the experiment from teaching either person anything.'},
   {key:'thesis-link',role:'synthesis',support,text:'This is the readiness test in the larger reading: neither a compelling story nor enthusiasm proves that a technique works. Training, observed results and the freedom to decline feedback remain relevant.'}
  ],110);
 }
 // A genuinely new relationship: two available forms of expression, not another
 // account of the story source. Eligibility depends on both distinct channels.
 if(story&&logic&&sf&&lf&&ready(sf)&&ready(lf)){
  const support=[fact(story),fact(logic),...ownership(story),...ownership(logic),...sf,...lf];
  add('story-evidence','A persuasive account and an inspectable argument do different jobs','deep',[
   {key:'new-relation',role:'synthesis',support,text:`There is a second form of expression to place beside the storytelling theme: ${label(logic)} organizes an opinion into details that someone else can inspect. Alongside ${label(story)}, it creates a useful contrast between communicating meaning and exposing an argument's premises.`,relations:['story-logic:meaning-versus-inspectable-premises']},
   {key:'condition',role:'condition',support,text:'When a story makes an idea feel persuasive, the next question can be what observations would support or overturn it. More detail is not automatically a correction: detailed language can defend a false premise just as efficiently as a true one.'},
   {key:'example',role:'application',support,text:pair
    ?'If a collaboration seems to be failing, one of you could tell the story of how it got there, then both could inspect a specific claim such as whether deadlines actually changed. A useful discussion allows the evidence to revise the story and the story to explain why the question matters.'
    :'If you conclude that a project always stalls at the same point, first describe the experience, then check the actual sequence of delays. The pattern may hold, or the records may require a different account.'},
   {key:'limit',role:'alternative',support,text:'The invitation matters for both forms of expression. A willing listener may welcome exploration or a careful explanation; neither route entitles someone to keep correcting another person who has asked to stop.'}
  ],100);
 }
 if(!pair&&a48&&l48&&ready(l48)&&story&&sf&&ready(sf)){
  const path=index.unfinishedPaths.find(p=>p.personId===a48.personId&&p.channelId==='channel-16-48'&&p.absentGate===16);
  const future=source('channel-16-48','mechanical_kernel',[a48.id]);
  const pc=path&&claims.find(c=>c.kind==='computed-fact'&&c.factIds.some(id=>index.facts.some(f=>f.id===id&&f.predicate==='unfinished-harmonic-path'&&(f.value as any).id===path.id)));
  if(path&&future&&pc){
   const before=index.participants[0].facts,after=deriveStructure([...before.gates,16]);
   const support=[pc,future,fact(story),...l48,...sf];
   const change=after.definitionIslands.length<before.definitionIslands.length?`reduce the number of connected natal networks from ${before.definitionIslands.length} to ${after.definitionIslands.length}`:'add that route without reducing the number of natal networks';
   add('depth-expression','Having a voice is different from having this depth ready','deep',[
    {key:'new-relation',role:'synthesis',support,text:`The storytelling route is complete, yet ${occurrence(a48)} belongs to an unfinished path toward Gate 16 (Throat Center). A capacity to share ideas therefore does not mean this particular depth is already available as a practiced technique.`,relations:['story-depth:available-voice-unfinished-technique']},
    {key:'hypothetical',role:'mechanics',support,text:`Adding that absent Gate to this natal chart would complete Channel 16–48 (Throat ↔ Spleen) and ${change}. This is a hypothetical change to the chart, not a requirement to find someone who supplies the missing endpoint.`},
    {key:'application',role:'application',support,text:'For example, being able to describe an ambitious piece of work need not mean you can yet execute it. A small practice test can reveal what is developing without requiring you to promise a result or dismiss the hidden work as worthless.'},
    {key:'limit',role:'alternative',support,text:'If the technique does not improve, the explanation may involve training, access or an unsuitable method. The symbolism neither guarantees eventual communication nor turns anxiety into proof of undiscovered ability.'}
   ],90);
  }
 }
 if(pair){
  const route=ch('channel-01-08'),f=route&&fields(route);
  if(route&&f&&ready(f)&&route.relation!.classification==='electromagnetic'){
   const direct=index.graphs.filter(g=>g.scope.kind==='participant').filter(g=>{const a=g.components.find(c=>c.centerIds.includes(route.centers[0])),b=g.components.find(c=>c.centerIds.includes(route.centers[1]));return a&&b&&a.id!==b.id;});
   if(direct.length){
    const jf=index.facts.filter(f=>f.predicate==='actual-island-join'||f.predicate==='definition-component');
    const joinClaim=makeClaim({kind:'computed-fact',scope,propositionKey:'argument:direct-creative-join',text:'The endpoint Centers lie in different natal components and in one combined component.',factIds:jf.map(f=>f.id),activationIds:route.endpointActivationIds.flat(),sources:[],meaningPropositionIds:[],requiredPremiseIds:[fact(route).claimId],supportRoutes:[{factIds:jf.map(f=>f.id),activationIds:route.endpointActivationIds.flat(),claimIds:[fact(route).claimId]}],rule:null,alternatives:[],qualifications:['Sufficient direct witness, not unique necessity.'],disconfirmation:[],forbiddenInferences:[]});claims.push(joinClaim);
    const support=[fact(route),joinClaim,...ownership(route),...f];
    const practice=skill&&skf&&ready(skf)?[fact(skill),...ownership(skill),...skf]:undefined;
    const contributors=route.gates.map((g,i)=>`${unique(route.endpointActivationIds[i].map(id=>name(index.activations.find(a=>a.id===id)!.personId))).join(' and ')} supplies Gate ${g} (${CENTER_NAMES[route.centers[i]]} Center)`);
    add('creative-join','A shared route that neither person carries alone','deep',[
     {key:'witness',role:'mechanics',support,text:`${contributors.join('; ')}. Together those endpoints complete ${label(route)}. For ${direct.map(g=>name(g.scope.personIds[0])).join(' and ')}, that direct G-to-Throat edge joins Centers that belong to different natal networks.`,relations:['creative-route:joint-only-direct-natal-join']},
     {key:'meaning',role:'synthesis',support,text:'The symbolic contribution is a route from distinctive creative direction toward expression. If one person brings an unusual approach and the other helps it reach an audience, it may be useful to recognize both contributions without assuming either person completes the other as a person.'},
     ...(practice?[{key:'alternative-process',role:'synthesis' as const,support:[...support,...practice],text:'This adds a choice that the practice discussion alone could not show. In 16–48, one person brings a complete natal route; in 1–8, each supplies an endpoint the other lacks. Both can connect the separated networks, but their symbolic invitations differ: developing a technique is not the same task as finding an expression for a distinctive approach. If a rehearsal turns into pressure to prove competence, you could explore how to present an unusual idea instead, without pretending that this bypasses the need for practice. Changing the collaboration changes the question, not anyone\'s worth.',relations:['creative-skill:alternative-process-and-ownership']}]:[]),
     {key:'example',role:'application',support,text:'You could try presenting one piece together, then compare what each could already do alone with what became easier in the exchange. A good result may also reflect experience or cooperation; the chart is not evidence of creative talent or an obligation to collaborate.'},
     {key:'separation',role:'mechanics',support,text:`Apart, this combined Channel is absent from both natal charts, while their own completed routes remain. Removing this particular edge invalidates this direct witness; it does not prove that every alternative connection disappears. The actual pair has ${index.composite!.facts.topology.combinedGraph.componentCount===1?'one connected network':index.composite!.facts.topology.combinedGraph.componentCount+' connected networks'}.`,relations:['separation:channel-01-08:combined-only']}
    ],90);
   }
  }
 }
 return output;
}
