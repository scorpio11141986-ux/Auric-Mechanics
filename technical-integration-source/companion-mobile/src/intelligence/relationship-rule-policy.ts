import { byId, runtime } from "../content/records";
import { inferenceDisposition } from "../content/inference-policy";
import { canonicalJson, contentHash, sha256 } from "../domain/composite-hash";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { validateRelationshipReport } from "./relationship";
import type { RelationshipReportV1 } from "./relationship-contracts";
import type { PairRuleV1, ReceiptTrustPolicyV1, RuleGateV1, RuleReviewReceiptV1, SourceFieldRefV1 } from "./relationship-phase1-contracts";

function freeze<T>(value:T):T {if(value&&typeof value==="object"){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function fields(recordId:string,names:string[]):SourceFieldRefV1[] {
 const channel=runtime.channels.find(x=>x.id===recordId) as unknown as Record<string,unknown>|undefined;
 const doc=byId.get(recordId);
 return names.map(field=>{const text=channel?.[field]??doc?.fields[field];if(typeof text!=="string")throw Error("Missing rule source field.");return {recordId,field,sha256:sha256(text)};});
}
const specs:[string,string,PairRuleV1["classification"],number|null,string,string[]][]=[
 ["C01","channel-11-56","compromise",null,"channel-11-56",["mechanical_kernel","composite_mechanics","boundary_nonclaim"]],
 ["C02","channel-18-58","electromagnetic",null,"channel-18-58",["mechanical_kernel","composite_mechanics","coherent_expression","boundary_nonclaim"]],
 ["C03","channel-30-41","electromagnetic",null,"channel-30-41",["mechanical_kernel","composite_mechanics","boundary_nonclaim"]],
 ["C04","channel-05-15","compromise",null,"channel-05-15",["mechanical_kernel","boundary_nonclaim"]],
 ["C05","channel-11-56","compromise",3,"gate-11-line-3",["mechanical_kernel","coherent_expression","boundary_nonclaim","channel_interaction"]],
 ["C06","channel-11-56","compromise",5,"gate-11-line-5",["mechanical_kernel","coherent_expression","boundary_nonclaim","channel_interaction"]],
 ["C07","channel-34-57","companionship",null,"channel-34-57",["mechanical_kernel","boundary_nonclaim"]],
];
export const PAIR_RULES:readonly PairRuleV1[]=freeze(specs.map(([id,channelId,classification,exactLine,recordId,names])=>{
 const body={schema:"PairRuleV1" as const,id,version:"CM04b-phase1-1.0.0",scope:"two-person-natal-pair" as const,channelId,classification,exactLine,sourceFields:fields(recordId,names),enabled:false as const};
 return {...body,hash:contentHash(body)};
}));
export const PHASE1_RECEIPT_POLICY:ReceiptTrustPolicyV1=freeze({trustedReceiptHashes:[],revokedReceiptHashes:[],allowedUse:"private-internal-evaluation"});

/** Integrity and explicit trust are separate: user-supplied approval-shaped JSON is never authority. */
export function validateRuleReceipt(rule:PairRuleV1,receipt:unknown,policy:ReceiptTrustPolicyV1,now:string):string[] {
 if(!receipt||typeof receipt!=="object")return ["missing-review-receipt"];
 const row=receipt as RuleReviewReceiptV1;
 let hash:string;try{hash=contentHash(row);}catch{return ["malformed-review-receipt"];}
 const reasons:string[]=[];
 if(!policy.trustedReceiptHashes.includes(hash))reasons.push("untrusted-review-receipt");
 if(policy.revokedReceiptHashes.includes(hash))reasons.push("revoked-review-receipt");
 const keys=["schema","ruleId","ruleHash","sourceFields","scope","sourceReview","inferenceReview","permissionGrant","ownerApproval","allowedUse","issuedAt","expiresAt"].sort();
 if(canonicalJson(Object.keys(row).sort())!==canonicalJson(keys)||row.schema!=="RuleReviewReceiptV1")reasons.push("malformed-review-receipt");
 if(row.ruleId!==rule.id||row.ruleHash!==rule.hash)reasons.push("rule-version-mismatch");
 if(canonicalJson(row.sourceFields??null)!==canonicalJson(rule.sourceFields))reasons.push("source-field-mismatch");
 if(row.scope!==rule.scope)reasons.push("wrong-mechanical-scope");
 if(row.allowedUse!==policy.allowedUse)reasons.push("permission-scope-mismatch");
 for(const key of ["sourceReview","inferenceReview","permissionGrant","ownerApproval"] as const)if(typeof row[key]!=="string"||!row[key].trim())reasons.push("missing-"+key);
 const start=Date.parse(row.issuedAt),end=Date.parse(row.expiresAt),at=Date.parse(now);
 if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(at)||end<=start||at<start||at>=end)reasons.push("receipt-time-invalid");
 return reasons;
}
export function candidateRuleGate(c:CompositeCalculationV1,report:RelationshipReportV1,ruleId:string,receipt?:unknown):RuleGateV1 {
 const rule=PAIR_RULES.find(x=>x.id===ruleId);if(!rule)throw Error("Unknown relationship rule.");
 const reasons=["phase1-candidate-disabled","rights-unresolved","unreviewed-pair-inference"];
 try{
  validateRelationshipReport(c,report);
  if(report.request.scope!=="A+B")reasons.push("wrong-mechanical-scope");
  if(c.facts.eligibility!=="exact-point")reasons.push("birth-time-provisional");
  const relation=c.facts.channelRelations.find(x=>x.channelId===rule.channelId);
  if(!relation?.formed||relation.classification!==rule.classification)reasons.push("wrong-channel-ownership");
  if(rule.id==="C03"&&!c.facts.topology.deltas.combinedOnlyCenterIds.includes("SolarPlexus"))reasons.push("wrong-center-context");
  if(rule.exactLine&&!c.facts.contributions.some(x=>x.gate===11&&x.line===rule.exactLine&&!x.boundaryRisk))reasons.push("unsupported-exact-line");
  for(const ref of rule.sourceFields){if(!inferenceDisposition(ref.recordId).allowed)reasons.push("quarantined-or-missing-source");const current=fields(ref.recordId,[ref.field])[0];if(current.sha256!==ref.sha256)reasons.push("source-field-mismatch");}
 }catch{reasons.push("invalid-or-stale-reading-context");}
 reasons.push(...validateRuleReceipt(rule,receipt,PHASE1_RECEIPT_POLICY,new Date().toISOString()));
 return {ruleId,eligible:false,reasons:[...new Set(reasons)],ruleHash:rule.hash};
}
