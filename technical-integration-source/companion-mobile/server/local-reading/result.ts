import {hash,type LocalPacket} from './packet';
import {validateLocalBundle} from '../../src/reading/llm-validation';
import {LOCAL_LLM_PROMPT_VERSION,type LocalReadingResult} from '../../src/reading/llm-contract';
export const VALIDATOR_VERSION='local-contract-p3a-8';
export function publicFacts(p:LocalPacket){return {people:p.index.participants.map(part=>({personId:part.personId,name:part.birth.name,chartVersionId:part.chartVersionId,snapshotHash:part.snapshotHash,type:part.facts.type,strategy:part.facts.strategy,authority:part.facts.authority,profile:part.facts.profile,definition:part.facts.definition,chart:part.facts})),composite:p.index.composite?{facts:p.index.composite.facts,displayParticipantIds:p.index.composite.displayParticipantIds}:null,activations:p.model.activations,graphs:p.index.graphs,channels:p.index.channels,centers:p.index.centers,unfinishedPaths:p.index.unfinishedPaths};}
export function deterministic(p:LocalPacket){return Object.fromEntries(Object.entries(p.deterministic).map(([depth,r]:[string,any])=>[depth,{paragraphs:r.paragraphs,depthStatus:r.plan.depthStatus}])) as LocalReadingResult['deterministic'];}
export function cacheKey(p:LocalPacket,model:string,effort:string){return hash(JSON.stringify({request:p.requestDigest,packet:p.packetDigest,model,effort,prompt:LOCAL_LLM_PROMPT_VERSION,validator:VALIDATOR_VERSION}));}
export function assembleResult(value:unknown,p:LocalPacket,model:string,effort:string,generatedAt=new Date().toISOString()):LocalReadingResult{
 return {case:p.entry,...validateLocalBundle(value,p),requestDigest:p.requestDigest,packetDigest:p.packetDigest,model,effort,generatedAt,facts:publicFacts(p),deterministic:deterministic(p)};
}
