import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateChart,deriveStructure} from '../src/domain/calculator';
import {mapLongitude} from '../src/domain/astronomy';
import {boundaryContext,chartUncertaintyForDisplay} from '../src/domain/boundary-context';
import {runtime} from '../src/content/records';
import {consumerLineDetail,INTERNAL_MEANING_MARKER} from '../src/content/presentation';
import {contextBundle,explainConcept,localReading,localContextEnabled} from '../src/reading/local-explanation';
import {CONTEXT_TEACHING_DRAFTS,CONTEXT_SOURCE_EXCERPTS} from '../src/reading/context-teaching-content';
import {sha256} from '../src/domain/composite-hash';
import {FAMILIARITY,migrateReaderPreferences} from '../src/intelligence/reader-preferences';
import {DEFAULT_PROFILE,type Person} from '../src/domain/contracts';
const person=(id:string,date:string):Person=>{const birth:any={schema:'BirthRecordV1',id,name:'Synthetic '+id,date,localTime:'12:00',timezone:'UTC',latitude:0,longitude:0,place:'Synthetic',confidence:'exact',source:'user-entered',updatedAt:'2026-10-25T00:00:00.000Z'};return {birth,facts:calculateChart(birth)} as Person;};
const a=person('holdout-a','1985-02-03'),b=person('holdout-b','1972-01-13');
const prefs=migrateReaderPreferences(DEFAULT_PROFILE);
test('context teaching requires development, explicit flag and a loopback web host',()=>{
 const env={development:true,flag:'1',platform:'web',host:'127.0.0.1'};assert.equal(localContextEnabled(env),true);for(const patch of [{development:false},{flag:'0'},{platform:'android'},{host:'auric.example'}])assert.equal(localContextEnabled({...env,...patch}),false);
});
test('all affected frozen Line records project existing safe fields without mutating sources',()=>{
 const before=JSON.stringify(runtime),marked=runtime.gates.flatMap(g=>g.lines).filter(l=>INTERNAL_MEANING_MARKER.test(l.deep_mechanics));
 assert.equal(marked.length,336);
 for(const l of marked){const projected=consumerLineDetail(l);assert.ok(projected.text);assert.equal(INTERNAL_MEANING_MARKER.test(projected.text),false);assert.ok(projected.fields.length);assert.equal(projected.rawField,'deep_mechanics');for(const f of projected.fields)if(!INTERNAL_MEANING_MARKER.test(String((l as any)[f])))assert.ok(projected.text.includes(String((l as any)[f])));}
 const noDetriment=consumerLineDetail(runtime.gates.find(g=>g.gate_number===57)!.lines.find(l=>l.line_number===3)!).text;assert.match(noDetriment,/no detriment/);assert.match(noDetriment,/does not make intuition infallible/);
 assert.equal(JSON.stringify(runtime),before);
});
test('internal Line perturbation changes the Line without inventing structural changes',()=>{
 const chart=structuredClone(a.facts),act=chart.activations.find(v=>v.planet==='Moon')!;
 let lon=0;for(let v=0;v<360;v+=.001){const x=mapLongitude(v-(1/60+1e-8)),y=mapLongitude(v+(1/60+1e-8));if(x.gate===y.gate&&x.line!==y.line){lon=v;break;}}
 Object.assign(act,{longitude:lon,...mapLongitude(lon),boundaryRisk:true});Object.assign(chart,deriveStructure(chart.activations.map(v=>v.gate)));
 const before=JSON.stringify(chart),x=boundaryContext(chart,act);assert.equal(x.kind,'internal Line boundary');assert.deepEqual(x.changedChannels,[]);assert.deepEqual(x.changes,[]);assert.match(x.notice,/not a birth-time interval/);assert.equal(JSON.stringify(chart),before);
 chart.uncertainty=['Moon is within one arcminute of a Line boundary; affected chart structure may change.'];assert.equal(chartUncertaintyForDisplay(chart).some(v=>v.includes('affected chart structure may change')),false);
});
test('Sun Line and outer Gate perturbations report only recalculated consequences',()=>{
 const chart=structuredClone(a.facts),sun=chart.activations.find(v=>v.side==='personality'&&v.planet==='Sun')!,earth=chart.activations.find(v=>v.side==='personality'&&v.planet==='Earth')!;
 let internal=0,edge=0;for(let v=0;v<360;v+=.001){const x=mapLongitude(v-(1/60+1e-8)),y=mapLongitude(v+(1/60+1e-8));if(!internal&&x.gate===y.gate&&x.line!==y.line)internal=v;if(!edge&&x.gate!==y.gate)edge=v;}
 Object.assign(sun,{longitude:internal,...mapLongitude(internal)});Object.assign(earth,{longitude:(internal+180)%360,...mapLongitude(internal+180)});const x=boundaryContext(chart,sun);assert.ok(x.changes.includes('Profile'));assert.equal(x.changes.includes('four Sun/Earth Cross Gates'),false);
 Object.assign(sun,{longitude:edge,...mapLongitude(edge)});Object.assign(earth,{longitude:(edge+180)%360,...mapLongitude(edge+180)});const y=boundaryContext(chart,sun);assert.equal(y.kind,'Gate edge');assert.ok(y.changes.includes('four Sun/Earth Cross Gates'));for(const v of y.variants)assert.deepEqual(v.structure,deriveStructure(v.structure.channels.flatMap(c=>c.gates).concat(v.structure.hangingGates)));
});
test('local teaching binds immutable issued revisions and keeps its draft use scope separate',()=>{
 const bundle=contextBundle([a]);for(const concept of ['typeStrategy','profile','authority','centers','definition'] as const){const e=explainConcept(bundle,a.birth.id,concept,prefs);assert.equal(e.subject.personId,a.birth.id);assert.equal(e.subject.chartVersionId,`${a.birth.id}:${a.birth.updatedAt}`);assert.equal(e.consumerEligible,false);assert.equal(e.remoteModelEligible,false);assert.equal(e.sevenSubstantiveSources,'unmet');}
 for(const s of CONTEXT_SOURCE_EXCERPTS)assert.equal(s.textSha256,sha256(s.text));for(const d of CONTEXT_TEACHING_DRAFTS)assert.equal(d.editorialApproval,'pending');
 assert.throws(()=>contextBundle([a],['missing-revision']));assert.throws(()=>explainConcept(bundle,'other','profile',prefs));
 const authority=explainConcept(bundle,a.birth.id,'authority',prefs);assert.match(authority.factStatements[0],/Solar Plexus/);assert.match(authority.factStatements[1],/Sacral/);
});
test('familiarity and independent known flags retain exact facts and local findings',()=>{
 const bundle=contextBundle([a]),baseline=localReading(bundle,'deep'),facts=explainConcept(bundle,a.birth.id,'centers',prefs).factStatements;
 for(const familiarity of FAMILIARITY){const p={...prefs,familiarity,concepts:{centers:true,definition:false}};const e=explainConcept(bundle,a.birth.id,'centers',p);assert.deepEqual(e.factStatements,facts);assert.equal(e.known,true);assert.equal(explainConcept(bundle,a.birth.id,'definition',p).known,false);assert.deepEqual(localReading(bundle,'deep'),baseline);}
});
test('holdout calculations enumerate every absent Gate and remain clock/order invariant',()=>{
 const bundle=contextBundle([a]);assert.equal((bundle.discovery.coverage as any).testedSingles,64-a.facts.gates.length);assert.equal((bundle.discovery.coverage as any).testedPairs,(64-a.facts.gates.length)*(63-a.facts.gates.length)/2);
 const reversed=structuredClone(a);reversed.facts.activations.reverse();assert.deepEqual(localReading(contextBundle([reversed]),'deep'),localReading(bundle,'deep'));
 const first=contextBundle([a,b],undefined,'2026-10-25T00:00:00Z'),second=contextBundle([a,b],undefined,'2026-10-26T00:00:00Z');
 const meanings=(x:typeof first)=>localReading(x,'deep','friendship').chapters.map(c=>({title:c.title,text:c.text,relation:c.relationKey}));assert.deepEqual(meanings(first),meanings(second));assert.equal(/romantic|sexual|attraction/.test(JSON.stringify(meanings(first))),false);
});
test('unsupported local depth is honest and Standard never duplicates Quick as extra chapters',()=>{
 const bundle=contextBundle([b]),r=localReading(bundle,'deep');if(bundle.discovery.deep.length<2)assert.equal(r.plan.depthStatus,'insufficient-supported-depth');assert.equal(new Set(r.chapters.map(c=>c.relationKey)).size,r.chapters.length);assert.equal(r.providerCalls,0);
});
test('near-boundary Sun with an otherwise covered Profile withholds traditional Profile teaching',()=>{
 let found:Person|undefined;for(let day=0;day<366&&!found;day++){const date=new Date(Date.UTC(1992,0,1+day)).toISOString().slice(0,10),candidate=person('uncertain-holdout',date);if(['3/5','4/6'].includes(candidate.facts.profile)&&candidate.facts.activations.some(a=>a.planet==='Sun'&&a.boundaryRisk))found=candidate;}
 assert.ok(found,'native calculation must supply a covered uncertain Profile fixture');const e=explainConcept(contextBundle([found]),found.birth.id,'profile',prefs);assert.equal(e.meaning,null);assert.deepEqual(e.sourceIds,[]);assert.ok(e.factStatements.some(t=>t.includes('near a Line boundary')));
});
test('selected evidence resolves only to served claim dependencies; candidate facts remain separately available',()=>{
 const bundle=contextBundle([a,b]),reading=localReading(bundle,'deep','friendship'),selected=new Set(reading.claims.flatMap(c=>c.factIds));assert.deepEqual(new Set(reading.evidenceDisposition.selectedRequiredFactIds),selected);assert.ok(reading.evidenceDisposition.candidateFactIds.length>selected.size);assert.ok(reading.plan.openingClaimId);for(const t of reading.trace)for(const id of t.factIds)assert.ok(bundle.index.facts.some(f=>f.id===id));
});
test('provisional points withhold all symbolic foundation teaching and unqualified repeated exact Lines',()=>{
 assert.ok(explainConcept(contextBundle([a]),a.birth.id,'typeStrategy',prefs).meaning);
 const provisional=structuredClone(a);provisional.birth.confidence='approximate';provisional.facts=calculateChart(provisional.birth);const bundle=contextBundle([provisional]);
 for(const concept of ['typeStrategy','profile','authority','definition'] as const){const e=explainConcept(bundle,provisional.birth.id,concept,prefs);assert.equal(e.eligibility,'provisional-point');assert.equal(e.meaning,null);assert.deepEqual(e.sourceIds,[]);assert.ok(e.factStatements.every(t=>t.includes('Provisional point')));}
 assert.ok(bundle.discovery.deep.some(d=>d.relationKey==='occurrence-support-versus-route-survival'));
 for(const d of bundle.discovery.deep.filter(d=>d.relationKey==='occurrence-support-versus-route-survival'))assert.match(d.text,/exact Line uncertain; interpretation withheld/);
 assert.ok(localReading(bundle,'deep').gaps.some(g=>g.includes('Provisional point calculation')));
});
