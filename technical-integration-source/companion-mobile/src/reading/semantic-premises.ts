import type {MeaningRole} from './relationship-operations';

export type SemanticPremise={role:MeaningRole;agent:string;action:string;patient:string;sense:string;condition:string;status:'supported'|'abstained';reason:string};
/** Conservative typed admission for lexical proposals. Words nominate; a whole
 * conditional record must identify the intended action and referent. Unknown
 * senses abstain and remain available to the full-record topology operations. */
export function semanticPremise(role:MeaningRole,sentence:string,kernel:string,condition:string,process:string):SemanticPremise{
  const full=[kernel,condition,process].join(' ');
  const proposition=/\b(truth|knowing|insight|idea|concept|inspiration|understanding|awareness)\b/i;
  const care=/\b(caregiving|caretaking|custodial|custodianship|self-care|caring|care for|care follows|responsibility|helping|nurturing (?:people|children|others))\b/i;
  const abstractNourishment=proposition.test(sentence)&&/\b(nourish\w*|protect\w*|grow|mature)\b/i.test(sentence);
  const qualifiedCare=care.test(kernel+' '+condition)&&!abstractNourishment;
  const sourceAction={expression:'expression or communication',capacity:'sustaining an activity',direction:'orientation',discernment:'discrimination',continuity:'maintaining a pattern',change:'changing a pattern',care:'giving care',reliance:'receiving support',agreement:'negotiating terms',autonomy:'maintaining independence',belonging:'participating with others',timing:'waiting for appropriate conditions',testing:'testing a proposition'}[role];
  let status:SemanticPremise['status']='supported',reason='Role is constrained to the action and complete source condition; no behavioral assertion.';
  let patient=proposition.test(sentence)?'proposition or understanding':'activity or relationship described by the source';
  let sense='source-literal';
  if(!condition.trim()){status='abstained';reason='A necessary source condition is absent.';}
  if(role==='care'){
    patient=qualifiedCare?'people, responsibilities and self-care':'unspecified or abstract object';sense=qualifiedCare?'human-caretaking':'unresolved-or-figurative';
    if(!qualifiedCare){status='abstained';reason='No supported human-caretaking referent; nourishment/protection alone cannot establish it.';}
  }
  if(role==='capacity'&&abstractNourishment&&!/\b(energy|resources|capacity|fuel|power)\b/i.test(sentence)){
    status='abstained';sense='figurative-development';reason='Nourishing a proposition does not establish capacity to undertake work or give care.';
  }
  if(role==='reliance'&&!/\b(interdependence|support from|receiv(?:e|ing) help|require(?:s)? (?:help|support))\b/i.test(full)){
    status='abstained';reason='Receiving support has not been established separately from giving it.';
  }
  return {role,agent:'symbolic subject of the source; not an observed person',action:sourceAction,patient,sense,condition,status,reason};
}
