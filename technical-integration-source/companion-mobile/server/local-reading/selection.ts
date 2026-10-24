import {calculateChart} from '../../src/domain/calculator';
import {createParticipantSnapshot} from '../../src/domain/composite';
import {validateSavedReadingRequest,savedReadingIdentity,transportFactsHash,P3A_AUTHORIZATION,type SavedReadingRequest} from '../../src/reading/local-selection';
import {buildParticipantPacket} from './packet';

/** Recompute in trusted runtime. No supplied activation, approval, notes or history is accepted. */
export function prepareSavedReading(value:unknown){
 const request=validateSavedReadingRequest(value);
 const people=request.participants.map(p=>{
  const facts=calculateChart(p.birth);
  if(transportFactsHash(facts)!==p.transportFactsHash)throw Error('SAVED_FACTS_MISMATCH');
  return createParticipantSnapshot({origin:'application-calculated',personId:p.personId,chartVersionId:p.chartVersionId,birth:p.birth,facts});
 });
 const id='saved-'+savedReadingIdentity(request);
 const entry={id,title:people.map(p=>p.birth.name).join(' + ')+(people.length===1?' — Individual':''),context:people.length===1?'individual' as const:'composite' as const,relationshipContext:request.relationshipContext,people:people.map(p=>({id:p.personId,name:p.birth.name}))};
 return buildParticipantPacket(people,entry,P3A_AUTHORIZATION);
}

/** Selection grants are local-session capabilities. A different revision or revoke
 * invalidates jobs and caches for that UI session without affecting other tabs. */
export class SelectionGrants {
 private active=new Map<string,{token:string;request:SavedReadingRequest;expiresAt:number}>();
 constructor(private now=()=>Date.now()){}
 issue(clientId:string,token:string,request:SavedReadingRequest){
  if(!/^[a-f\d-]{16,80}$/i.test(clientId)||!token)throw Error('LOCAL_SESSION_ID_REQUIRED');
  validateSavedReadingRequest(request);this.active.set(clientId,{token,request,expiresAt:this.now()+60*60*1000});
 }
 require(clientId:string,token:string,remote=false){
  const grant=this.active.get(clientId);
  if(!grant||grant.token!==token||grant.expiresAt<=this.now())throw Error('STALE_OR_REVOKED_SELECTION');
  if(remote&&!grant.request.remoteModelConsent)throw Error('MODEL_CONSENT_REQUIRED');
  return grant.request;
 }
 revoke(clientId:string){this.active.delete(clientId);}
 clear(){this.active.clear();}
}
