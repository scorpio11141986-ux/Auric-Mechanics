import type {LLMDepth,LocalLLMBundle} from './llm-contract';
export function localReadingFlag(input:{development:boolean;flag:string|undefined;platform:string;host:string}){return input.development&&input.flag==='1'&&input.platform==='web'&&input.host==='127.0.0.1';}
export function localReadingClaimIds(bundle:LocalLLMBundle,depth:LLMDepth){return depth==='quick'?[...bundle.quick.claimIds]:[...bundle.standard.thesisClaimIds,...bundle.standard.chapters.flatMap(c=>c.paragraphs.flat()),...(depth==='deep'?bundle.deep.additionalChapters.flatMap(c=>c.paragraphs.flat()):[])];}
export function currentReadingResponse(active:number,response:number,currentDigest:string,responseDigest:string){return active===response&&currentDigest===responseDigest;}
