import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateChart} from '../src/domain/calculator';
import {savedChartReference,validateSavedReadingRequest,savedReadingIdentity,transportFactsHash,P3A_AUTHORIZATION,type SavedReadingRequest} from '../src/reading/local-selection';
import {SelectionGrants,prepareSavedReading} from '../server/local-reading/selection';
import {localReadingPriorities,checkStandardPriorities} from '../src/reading/local-salience';
import {readingDemoFixtures,zeroNetworkReadingFixture} from '../src/reading/demo-fixtures';
import {buildCompositeChartIndex} from '../src/reading/chart-index';
import {runtime} from '../src/content/records';

const birth:any={schema:'BirthRecordV1',id:'unlisted-person-7',name:'Same [name]',date:'1985-02-03',localTime:'12:00',timezone:'UTC',latitude:0,longitude:0,place:'Synthetic',confidence:'exact',source:'user-entered',updatedAt:'2026-10-24T00:00:00.000Z'};
let person:any;
function request():SavedReadingRequest{person ||= {birth,facts:calculateChart(birth),history:[{secret:'not sent'}],observations:[{text:'private note'}]};return {schema:'AuricSavedReadingRequestV1',participants:[savedChartReference(person)],relationshipContext:['self-understanding'],authorizationId:P3A_AUTHORIZATION,remoteModelConsent:true};}
test('unlisted saved person uses exact native revision and no histories or observations',()=>{
 const r=request();assert.equal(JSON.stringify(r).includes('private note'),false);assert.equal(JSON.stringify(r).includes('not sent'),false);
 const p=prepareSavedReading(r);assert.equal(p.model.participants[0].personId,birth.id);assert.equal(p.model.participants[0].chartVersionId,`${birth.id}:${birth.updatedAt}`);
 assert.equal(p.model.authorizationId,P3A_AUTHORIZATION);assert.equal(JSON.stringify(p.model).includes(birth.date),false);
 const forged=structuredClone(r);forged.participants[0].transportFactsHash='a'.repeat(64);assert.throws(()=>prepareSavedReading(forged),/SAVED_FACTS_MISMATCH/);
});
test('transport comparison tolerates numerical ULP only; discrete mechanics and native facts stay intact',()=>{
 request();const original=structuredClone(person.facts),ulp=structuredClone(original);ulp.activations[0].longitude+=1e-13;
 assert.equal(transportFactsHash(original),transportFactsHash(ulp));
 for(const key of ['gate','line','boundaryRisk']){const changed=structuredClone(original);changed.activations[0][key]=key==='boundaryRisk'?!changed.activations[0][key]:changed.activations[0][key]+1;assert.notEqual(transportFactsHash(original),transportFactsHash(changed));}
 const changed=structuredClone(original);changed.activations[0].longitude+=1e-5;assert.notEqual(transportFactsHash(original),transportFactsHash(changed));assert.deepEqual(person.facts,original);
});
test('identity binds ID, chart revision, context and consent; same names never select a person',()=>{
 const r=request(),second=structuredClone(r);second.participants[0].personId='unlisted-person-8';second.participants[0].birth.id='unlisted-person-8';second.participants[0].chartVersionId=`unlisted-person-8:${birth.updatedAt}`;
 assert.notEqual(savedReadingIdentity(r),savedReadingIdentity(second));assert.equal(validateSavedReadingRequest(second),second);
 for(const edit of [(v:any)=>v.participants[0].chartVersionId='old',(v:any)=>v.participants[0].birth.notes='injection',(v:any)=>v.participants[0].birth.resolution={secret:'extra'},(v:any)=>v.participants[0].birth.confidence='unknown',(v:any)=>v.authorizationId='S39']){const changed=structuredClone(r);edit(changed);assert.throws(()=>validateSavedReadingRequest(changed));}
 assert.throws(()=>savedChartReference({...person,versions:[{id:'different',birth,facts:person.facts}]}),/SAVED_REVISION_UNAVAILABLE/);
});
test('grant replacement, revocation, consent and expiry fail closed per tab',()=>{
 let clock=0;const g=new SelectionGrants(()=>clock),client='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',r=request();
 g.issue(client,'first',r);assert.equal(g.require(client,'first',true),r);g.issue(client,'second',{...r,remoteModelConsent:false});
 assert.throws(()=>g.require(client,'first'),/STALE_OR_REVOKED/);assert.throws(()=>g.require(client,'second',true),/MODEL_CONSENT/);
 g.revoke(client);assert.throws(()=>g.require(client,'second'),/STALE_OR_REVOKED/);g.issue(client,'third',r);clock=3_600_001;assert.throws(()=>g.require(client,'third'),/STALE_OR_REVOKED/);
});
function indexed(pair:any){const index=buildCompositeChartIndex(pair);return {participants:index.composite!.inputs,records:runtime.channels,facts:index.facts};}
test('general native priorities use full witness paths and source eligibility, independent of names or clock',()=>{
 const {pair}=readingDemoFixtures(),model=indexed(pair),priorities=localReadingPriorities(model);assert.ok(priorities.some(p=>p.kind==='island-join'));
 assert.deepEqual(localReadingPriorities({...model,computedAt:'2099-01-01',participants:model.participants.map((p:any)=>({...p,name:'Renamed'}))}),priorities);
 assert.deepEqual(localReadingPriorities({...model,records:[]}),[]);
 const withoutJoin={...model,facts:model.facts.filter(f=>f.predicate!=='actual-island-join')};assert.equal(localReadingPriorities(withoutJoin).some(p=>p.kind==='island-join'),false);
 assert.deepEqual(localReadingPriorities(indexed(zeroNetworkReadingFixture())),[]);
 // A graph-wide inventory or unselected claim cannot satisfy served Standard.
 const packet:any={model:{readingPriorities:priorities},evidence:[]};
 const checks=checkStandardPriorities({claims:[],standard:{thesisClaimIds:[],chapters:[]}},packet);assert.ok(checks.every(p=>p.status==='missing'));
});
test('human Channel numbers do not need source-record zero padding; every required endpoint remains necessary',()=>{
 const priority={id:'root',kind:'new-center',factIds:['pair','a','b'],channelIds:['channel-09-52'],sourceRecordIds:['channel-09-52'],requiredInStandard:true};
 const packet:any={model:{readingPriorities:[priority]},evidence:[{id:'meaning',recordId:'channel-09-52'}]};
 const claim={id:'c',text:'Channel 9–52 has this supported meaning.',kind:'source-interpretation',factIds:['pair','a','b'],evidenceIds:['meaning'],requiredClaimIds:[]};
 const bundle={claims:[claim],standard:{thesisClaimIds:['c'],chapters:[]}};
 assert.equal(checkStandardPriorities(bundle,packet)[0].status,'referenced');claim.text='Channel 9–53 has this meaning.';assert.equal(checkStandardPriorities(bundle,packet)[0].status,'missing');
});
