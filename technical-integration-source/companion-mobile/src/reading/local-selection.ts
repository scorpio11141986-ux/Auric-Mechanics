import type {BirthRecordV1,Person,HumanDesignFactsV1} from '../domain/contracts';
import {contentHash} from '../domain/composite-hash';
export const P3A_AUTHORIZATION='S42-P3A-LOCAL-20261024';
export const LOCAL_CONTEXTS=['self-understanding','general','friendship','creative collaboration','communication','romance'] as const;
export type SavedChartReference={personId:string;chartVersionId:string;birth:BirthRecordV1;factsHash:string;transportFactsHash:string};
/** Comparison only: the native facts and original hash remain untouched. Chrome/Node
 * can differ by a floating-point ULP. All discrete mechanics and uncertainty flags
 * remain exact; only longitude is rounded to 10 decimal degrees for transport. */
export function transportFactsHash(facts:HumanDesignFactsV1){return contentHash({...facts,activations:facts.activations.map(a=>({...a,longitude:Number(a.longitude.toFixed(10))}))});}
export type SavedReadingRequest={schema:'AuricSavedReadingRequestV1';participants:SavedChartReference[];relationshipContext:string[];authorizationId:typeof P3A_AUTHORIZATION;remoteModelConsent:boolean};
/** Only the selected birth revision crosses to the trusted loopback runtime.
 * Observations, histories, other people, account data and arbitrary extensions do not. */
export function savedChartReference(person:Person,requestedVersion?:string):SavedChartReference {
 const id=requestedVersion||person.activeChartVersionId||`${person.birth.id}:${person.birth.updatedAt}`;
 const version=person.versions?.find(v=>v.id===id);
 if(person.versions&&!version)throw Error('SAVED_REVISION_UNAVAILABLE');
 const birth=version?.birth||person.birth,facts=version?.facts||person.facts;
 if(birth.id!==person.birth.id||id!==`${birth.id}:${birth.updatedAt}`||facts.birthId!==birth.id||facts.birthUpdatedAt!==birth.updatedAt)throw Error('SAVED_REVISION_MISMATCH');
 const {schema,id:personId,name,date,localTime,timezone,latitude,longitude,place,confidence,timeWindow,utcDisambiguation,source,updatedAt,resolution,conversion}=birth;
 return {personId,chartVersionId:id,factsHash:contentHash(facts),transportFactsHash:transportFactsHash(facts),birth:{schema,id:personId,name,date,localTime,timezone,latitude,longitude,place,confidence,source,updatedAt,
  ...(timeWindow?{timeWindow}:{}),...(utcDisambiguation?{utcDisambiguation}:{}),...(resolution?{resolution}:{}),...(conversion?{conversion}:{})}};
}
export function savedReadingIdentity(request:SavedReadingRequest){return contentHash(request);}
export function validateSavedReadingRequest(value:unknown):SavedReadingRequest {
 const r=value as SavedReadingRequest;
 const allowed=['schema','participants','relationshipContext','authorizationId','remoteModelConsent'];
 if(!r||typeof r!=='object'||Object.keys(r).some(k=>!allowed.includes(k))||r.schema!=='AuricSavedReadingRequestV1'||r.authorizationId!==P3A_AUTHORIZATION)throw Error('LOCAL_AUTHORIZATION_REQUIRED');
 if(typeof r.remoteModelConsent!=='boolean')throw Error('MODEL_CONSENT_REQUIRED');
 if(!Array.isArray(r.participants)||![1,2].includes(r.participants.length))throw Error('PARTICIPANT_COUNT');
 const ids=new Set<string>();
 for(const p of r.participants){
  if(!p||Object.keys(p).some(k=>!['personId','chartVersionId','birth','factsHash','transportFactsHash'].includes(k))||typeof p.personId!=='string'||p.personId.length>160||!p.personId||ids.has(p.personId)||typeof p.factsHash!=='string'||!/^[a-f\d]{64}$/.test(p.factsHash)||typeof p.transportFactsHash!=='string'||!/^[a-f\d]{64}$/.test(p.transportFactsHash))throw Error('SAVED_PERSON_IDENTITY');
  ids.add(p.personId);
  if(!p.birth||p.birth.id!==p.personId||p.chartVersionId!==`${p.personId}:${p.birth.updatedAt}`||p.birth.source!=='user-entered')throw Error('SAVED_REVISION_MISMATCH');
  if(Object.keys(p.birth).some(k=>!['schema','id','name','date','localTime','timezone','latitude','longitude','place','confidence','timeWindow','utcDisambiguation','source','updatedAt','resolution','conversion'].includes(k)))throw Error('UNTRUSTED_BIRTH_FIELDS');
  for(const [key,keys] of [['resolution',['status','originalPlace','resolvedPlace','coordinateSource','sourceVersion','resolvedAt','timezoneOverride']],['conversion',['utc','offsetMinutes','timezone','runtime','databaseVersion']]] as const){const nested=p.birth[key];if(nested&&(typeof nested!=='object'||Object.keys(nested).some(k=>!(keys as readonly string[]).includes(k))))throw Error('UNTRUSTED_BIRTH_FIELDS');}
  if(!['exact','approximate'].includes(p.birth.confidence)||p.birth.timeWindow)throw Error('TIME_WINDOW_READING_UNAVAILABLE');
 }
 if(!Array.isArray(r.relationshipContext)||!r.relationshipContext.length||r.relationshipContext.length>3||r.relationshipContext.some(c=>!LOCAL_CONTEXTS.includes(c as any)))throw Error('RELATIONSHIP_CONTEXT_INVALID');
 if(r.participants.length===1&&(r.relationshipContext.length!==1||r.relationshipContext[0]!=='self-understanding'))throw Error('INDIVIDUAL_CONTEXT_INVALID');
 if(r.participants.length===2&&r.relationshipContext.includes('self-understanding'))throw Error('COMPOSITE_CONTEXT_REQUIRED');
 if(r.relationshipContext.includes('friendship')&&r.relationshipContext.includes('romance'))throw Error('CONFLICTING_RELATIONSHIP_CONTEXT');
 return r;
}
