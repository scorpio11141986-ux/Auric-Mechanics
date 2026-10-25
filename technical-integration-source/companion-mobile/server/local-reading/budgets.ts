/** Local operator controls. Bytes are a payload budget, never a token estimate. */
export function readingLimits(env:Record<string,string|undefined>=process.env){
 const integer=(key:string,fallback:number,max:number)=>{const raw=env[key];const n=raw===undefined?fallback:Number(raw);if(!Number.isSafeInteger(n)||n<16||n>max)throw Error('READING_BUDGET_INVALID');return n;};
 return {maxInputBytes:integer('AURIC_MAX_INPUT_BYTES',1_500_000,10_000_000),maxOutputTokens:integer('AURIC_MAX_OUTPUT_TOKENS',32768,131072)};
}
export type ReadingLimits=ReturnType<typeof readingLimits>;
/** One lease per exact packet/model/policy key. No shared delivery across grants. */
export class GenerationLeases {
 private active=new Map<string,{id:symbol;clientId:string;token:string;controller:AbortController}>();
 begin(key:string,clientId:string,token:string){
  if(this.active.has(key))throw Error('READING_ALREADY_GENERATING');
  if(this.active.size>=2)throw Error('READING_CAPACITY_BUSY');
  const lease={id:Symbol(),clientId,token,controller:new AbortController()};this.active.set(key,lease);
  return {signal:lease.controller.signal,finish:()=>{if(this.active.get(key)?.id===lease.id)this.active.delete(key);}};
 }
 cancelClient(clientId:string){for(const lease of this.active.values())if(lease.clientId===clientId)lease.controller.abort();}
 cancelToken(token:string){for(const lease of this.active.values())if(lease.token===token)lease.controller.abort();}
 clear(){for(const lease of this.active.values())lease.controller.abort();}
}
