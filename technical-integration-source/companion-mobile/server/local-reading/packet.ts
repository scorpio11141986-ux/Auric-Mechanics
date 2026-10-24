import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareBirthRecord} from '../../src/domain/birth';
import {calculateChart} from '../../src/domain/calculator';
import {createParticipantSnapshot,calculateComposite} from '../../src/domain/composite';
import {runtime} from '../../src/content/records';
import {loadLocalReviewCatalogue} from '../../src/reading/catalog';
import {issueDesignPreviewScope,resolveMeaningEligibility} from '../../src/reading/eligibility';
import {excludedReadingField} from '../../src/reading/source-policy';
import {buildNatalChartIndex,buildCompositeChartIndex} from '../../src/reading/chart-index';
import {generateReading,validateReadingForRender,type ReadingInput} from '../../src/reading/planner';
import {migrateReaderPreferences} from '../../src/intelligence/reader-preferences';
import {DEFAULT_PROFILE} from '../../src/domain/contracts';
import type {LocalReadingCase} from '../../src/reading/llm-contract';
import type {ParticipantSnapshotV1} from '../../src/domain/composite-contracts';
import {localReadingPriorities} from '../../src/reading/local-salience';

export const AUTHORIZATION_ID='OWNER-BOUNDED-LOCAL-LLM-20261023';
export const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const app=resolve(fileURLToPath(new URL('../../',import.meta.url))),repo=resolve(app,'../..'),workspace=resolve(repo,'../..');
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
export const CASES:LocalReadingCase[]=[];
export type LocalPacket=ReturnType<typeof buildParticipantPacket>;
let catalogue:any;
export function buildPacket(_caseId:string):ReturnType<typeof buildParticipantPacket>{throw Error('PRIVATE_PROOF_CASES_NOT_INCLUDED_IN_PUBLIC_EXPORT');}
/** Shared compiler. The active saved-person route never resolves a person by name or fixture ID. */
export function buildParticipantPacket(people:ParticipantSnapshotV1[],entry:LocalReadingCase,authorizationId:string){
 // Stable fixture clock is provenance only, never an insight ranking input.
 const pair=people.length===2?calculateComposite(people[0],people[1],{computedAt:'2026-10-23T00:00:00.000Z'}):null;
 const index=pair?buildCompositeChartIndex(pair):buildNatalChartIndex(people[0]);
 if(!catalogue)catalogue=loadLocalReviewCatalogue(readFileSync(join(repo,'reading-research/reading-catalogue.design.json'),'utf8'));
 const cohort=new Set(index.activations.flatMap(a=>[`gate-${String(a.gate).padStart(2,'0')}`,`gate-${String(a.gate).padStart(2,'0')}-line-${a.calculatedLine}`]));
 for(const c of runtime.channels)if(c.gates.some(g=>index.activations.some(a=>a.gate===g))){cohort.add(c.id);for(const g of c.gates)cohort.add(`gate-${String(g).padStart(2,'0')}`);}
 const capability=issueDesignPreviewScope({cohort:[...cohort],variantIds:['r4']});
 const raw=readFileSync(join(app,'assets/app1_runtime.min.json')),source=json(join(app,'assets/app1_runtime.min.json'));
 const artifactHash=hash(raw);if(artifactHash!=='706fe411dbedf0ca51714aca7b879021cbee613d6a53d140bc238aa0dc0ccb70')throw Error('R4_PIN_MISMATCH');
 const pointer=(p:string)=>p.split('/').slice(1).reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],source);
 const evidence:any[]=[],withheld:any[]=[],records:any[]=[],selection:any[]=[];
 for(const unit of catalogue.units.filter((u:any)=>u.variantId==='r4'&&cohort.has(u.recordId))){
  const acts=index.activations.filter(a=>unit.kind==='channel'?unit.gates.includes(a.gate):a.gate===unit.gate&&(unit.kind!=='exact-line'||a.exactLineEligible&&a.line===unit.line));
  if(!acts.length){selection.push({recordId:unit.recordId,reason:'NO_ELIGIBLE_ACTUAL_OCCURRENCE'});continue;}
  const eligibility=resolveMeaningEligibility(unit,{use:'isolated-design-preview',capability});
  if(!eligibility.allowed){withheld.push({recordId:unit.recordId,reasons:eligibility.reasonCodes});continue;}
  const record={id:unit.recordId,kind:unit.kind,gate:unit.gate,line:unit.line,gates:unit.gates,activationIds:acts.map(a=>a.id),centers:unit.centers,issueFlags:unit.issueFlags,internalModelUse:{allowed:true,authorizationId},publicConsumerUse:{allowed:false,status:unit.publicationStatus},originalSourceReviewState:unit.sourceStatus};records.push(record);
  for(const f of unit.fields){
   if(typeof f.value!=='string'||!f.value.trim())continue;
   if(excludedReadingField(unit,f.fieldKey)){withheld.push({recordId:unit.recordId,fieldKey:f.fieldKey,reason:'DISPUTED_FIELD_OR_EXISTING_SOURCE_POLICY'});continue;}
   if(f.purpose==='identity'||f.purpose==='metadata'||/(?:\.|^)(legacy_field|granularity|boundary_ref|source5_evidence_completeness)$/.test(f.fieldKey)){selection.push({recordId:unit.recordId,fieldKey:f.fieldKey,reason:'METADATA_NOT_PROSE_PREMISE'});continue;}
   if(f.ref.artifactSha256!==artifactHash||pointer(f.ref.jsonPointer)!==f.value||hash(f.value)!==f.ref.valueSha256)throw Error('SOURCE_FIELD_MISMATCH');
   if(/ignore\s+(all\s+)?(previous|prior)\s+instructions|(?:system|developer)\s*message\s*:|send\s+(?:your\s+)?(?:api\s*)?(?:key|token|password)/iu.test(f.value))throw Error('SOURCE_INJECTION_REVIEW_REQUIRED');
   evidence.push({id:`e${String(evidence.length+1).padStart(4,'0')}`,recordId:unit.recordId,fieldKey:f.fieldKey,text:f.value,textSha256:hash(f.value),scope:f.ref.granularity,exactLineMeaning:unit.kind==='exact-line'&&!f.shared&&f.ref.granularity==='exact-line',shared:f.shared,activationIds:acts.map(a=>a.id),ref:f.ref});
  }
 }
 const preferences={...migrateReaderPreferences(DEFAULT_PROFILE),interests:entry.relationshipContext};
 const deterministic:any={};
 for(const depth of ['quick','standard','deep'] as const){const input:ReadingInput={...(pair?{composite:pair}:{issuedSnapshot:people[0]}),preferences:{...preferences,depth},depth,disclosure:'full',selection:{kind:'whole'},view:pair?'combined':'natal',use:'isolated-design-preview',capability,variantId:'r4',composition:'relational-discovery-v1',inputAssurance:'recorded-exact-minute-not-independently-verified'};const r=generateReading(input);validateReadingForRender(r,input);deterministic[depth]=r;}
 const alias=new Map(index.activations.map((a,i)=>[a.id,`a${String(i+1).padStart(2,'0')}`]));
 const replace=(v:any):any=>Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):typeof v==='string'?alias.get(v)||v:v;
 const texts:Record<string,string>={},fieldKeys:Record<string,string>={},textIds=new Map<string,string>(),keyIds=new Map<string,string>();
 const compact=evidence.map(e=>{if(!textIds.has(e.text)){const id=`t${textIds.size+1}`;textIds.set(e.text,id);texts[id]=e.text;}if(!keyIds.has(e.fieldKey)){const id=`k${keyIds.size+1}`;keyIds.set(e.fieldKey,id);fieldKeys[id]=e.fieldKey;}return {id:e.id,record:e.recordId,field:keyIds.get(e.fieldKey),text:textIds.get(e.text),scope:e.scope,exactLineMeaning:e.exactLineMeaning,shared:e.shared};});
 const model={schema:'AuricLocalLLMInputV1',case:entry,authorizationId,sourceUse:'Every evidence field is expressly authorized for this internal model test. Publication/consumer approval is separate and remains false. Withheld fields are absent from evidence. Use conditional symbolism; do not infer observed psychology or fixing poles from actual planets.',corpus:{catalogueHash:catalogue.catalogueHash,r4Sha256:artifactHash},
  participants:people.map(p=>({personId:p.personId,name:p.birth.name,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash,type:p.facts.type,strategy:p.facts.strategy,authority:p.facts.authority,profile:p.facts.profile,definition:p.facts.definition})),
  activations:index.activations.map(a=>({...replace(a),nativeIndexedId:a.id})),
  facts:index.facts.map((f,i)=>({...replace(f),id:`f${String(i+1).padStart(3,'0')}`,issuedFactId:f.id})),graphs:replace(index.graphs),channels:replace(index.channels),centers:replace(index.centers),unfinishedPaths:replace(index.unfinishedPaths),contributions:index.composite?.facts.contributions||[],
  records:replace(records),evidence:compact,texts,fieldKeys,withheld,
  limitations:['Recorded birth minutes are not independently verified. Exact-Line eligibility is per activation; never interpret an uncertain calculatedLine.','No dedicated Type/Profile/Authority/planetary-role/side-modifier teaching corpus is provided. Retain calculated facts; do not invent teaching.','Traditional carriers, authored source applications and your proposed synthesis are distinct.','The relationship context is an explicit selection. Friendship must contain no romantic, sexual or attraction interpretation.','Repeated occurrences preserve alternative support, not multiplied definition. One sufficient path is not necessarily unique.']};
 const prioritized={...model,readingPriorities:localReadingPriorities(model)};
 const packetDigest=hash(JSON.stringify(prioritized)),requestDigest=hash(JSON.stringify({schema:'local-bundle-2',packetDigest,context:entry.relationshipContext,authorization:authorizationId}));
 return {entry,index,evidence,withheld,selection,records,model:{...prioritized,packetDigest,requestDigest},packetDigest,requestDigest,deterministic};
}
