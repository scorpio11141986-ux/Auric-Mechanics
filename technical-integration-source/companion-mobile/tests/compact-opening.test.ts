import test from 'node:test';
import assert from 'node:assert/strict';
import {compactOpening} from '../src/reading/compact-opening';
function fixture(){
 const f={id:'f1',predicate:'channel-completion',personIds:['a'],activationIds:['a1','a2'],value:{channelId:'channel-01-08',gates:[1,8],centers:['G','Throat'],complete:true}};
 const classification={id:'f2',predicate:'natal-classification',personIds:['a'],activationIds:[],value:{definition:'Single Definition'}};
 const c=(id:string,text:string,kind:string,deps:string[]=[])=>({id,text,kind,requiredClaimIds:deps,factIds:['f1'],evidenceIds:kind==='computed-fact'?[]:['e1'],personIds:['a'],conditions:['if useful'],limitations:['conditional'],activationIds:['a1','a2']});
 const claims=[c('p','A completed synthetic Channel connects these two Centers.','computed-fact'),c('q','If these themes resonate, compare expression with your actual opportunity; neither a label nor a feeling proves the outcome.','proposed-synthesis',['p']),c('s','A different supported Standard conclusion keeps its own conditions intact.','proposed-synthesis',['p']),c('other','Unselected deeper symbolic finding must stay outside Quick.','proposed-synthesis')];
 const r:any={case:{people:[{id:'a',name:'Synthetic'}]},requestDigest:'request',packetDigest:'packet',facts:{graphs:[{id:'graph-a',componentCount:1,scope:{personIds:['a']}}]},bundle:{requestDigest:'request',packetDigest:'packet',claims,quick:{claimIds:['p','q']},standard:{thesisClaimIds:['s'],chapters:[]}},trace:claims.map(x=>({claimId:x.id,kind:x.kind,factDependencyClosure:[f],sourceFields:x.evidenceIds.map(id=>({id,recordId:'synthetic-meaning'}))}))};
 r.trace.push({claimId:'classification',kind:'computed-fact',factDependencyClosure:[classification],sourceFields:[]});r.bundle.claims.push({...c('classification','Synthetic foundation fact.','computed-fact'),factIds:['f2']});return r;
}
test('compact unit exposes exact mechanics and the full conditional consequence together',()=>{
 const r=fixture(),before=JSON.stringify(r),unit=compactOpening(r,'quick');assert.equal(unit.status,'supported');assert.match(unit.premises[0].text,/1–8 \(Identity\/G↔Throat\)/);assert.match(unit.premises[0].text,/1 defined Center group/);assert.ok(unit.factIds.includes('f1'));assert.ok(unit.factIds.includes('f2'));assert.ok(unit.evidenceIds.includes('e1'));
 assert.equal(unit.conclusion!.text,r.bundle.claims[1].text.replace('these themes','these connections'));assert.ok(unit.conclusion!.text.endsWith('proves the outcome.'));assert.equal(JSON.stringify(r),before);assert.ok(!unit.claimIds.includes('other'));
});
test('depth selects its own original conclusion; no prefix truncation or Deep promotion',()=>{
 const r=fixture(),quick=compactOpening(r,'quick'),standard=compactOpening(r,'standard'),deep=compactOpening(r,'deep');assert.equal(quick.conclusion!.claimId,'q');assert.equal(standard.conclusion!.claimId,'s');assert.equal(deep.conclusion!.originalText,r.bundle.claims[2].text);
});
test('missing necessary facts, sources, identities or claim closure withhold the unit',()=>{
 for(const mutate of [(r:any)=>r.trace.forEach((t:any)=>t.factDependencyClosure=[]),(r:any)=>r.trace.forEach((t:any)=>t.sourceFields=[]),(r:any)=>r.bundle.requestDigest='foreign',(r:any)=>r.bundle.claims[1].requiredClaimIds=['missing']]){
  const r=fixture();mutate(r);const unit=compactOpening(r,'quick');assert.equal(unit.status,'needs-full-context');assert.equal(unit.conclusion,null);
 }
});
test('redundant fact support survives through an existing dependency without duplication',()=>{
 const r=fixture();r.trace.find((t:any)=>t.claimId==='q').factDependencyClosure=[];const unit=compactOpening(r,'quick');assert.equal(unit.status,'supported');assert.equal(unit.factIds.filter(id=>id==='f1').length,1);
});
test('native pair witness remains one sufficient route with source and actor scope',()=>{
 const r=fixture(),f=r.trace[0].factDependencyClosure[0];r.case.people.push({id:'b',name:'Other synthetic'});f.predicate='channel-ownership';f.personIds=['a','b'];f.value.relation={fullOwnerIds:[],combinedOnly:true};
 const join={id:'join',predicate:'actual-island-join',personIds:['a'],activationIds:[],value:{personId:'a',witness:{edges:[{channelId:'channel-01-08'}]}}};r.trace[0].factDependencyClosure.push(join);
 const u=compactOpening(r,'quick');assert.equal(u.status,'supported');assert.match(u.premises[0].text,/One link between A’s separate Center groups/);assert.ok(u.premises[0].factIds.includes('join'));assert.match(u.premises[0].text,/1–8/);
 r.trace[0].factDependencyClosure=r.trace[0].factDependencyClosure.filter((x:any)=>x.id!=='join');const without=compactOpening(r,'quick');assert.ok(without.premises.every(p=>!p.text.includes('One link')));
});

test('a brief heading-like thesis uses a developed existing Standard synthesis',()=>{
 const r=fixture();r.bundle.claims.find((c:any)=>c.id==='s').text='Connection remains conditional.';
 const developed={...r.bundle.claims.find((c:any)=>c.id==='s'),id:'developed',text:'Together these two supported processes suggest a different choice whose conditions and limits remain explicitly preserved.'};r.bundle.claims.push(developed);r.trace.push({...r.trace.find((t:any)=>t.claimId==='s'),claimId:'developed'});r.bundle.standard.chapters=[{paragraphs:[['p','developed']]}];
 const unit=compactOpening(r,'standard');assert.equal(unit.conclusion!.claimId,'developed');assert.equal(unit.conclusion!.text,developed.text);assert.equal(compactOpening(r,'quick').conclusion!.claimId,'q');
});
