import type { BridgeAnalysisV1 } from '../domain/bridges-contracts';
import { contentHash } from '../domain/composite-hash';

export type BridgeReaderState={scrollY:number};
export type BridgeExplorerState={contextKey:string;generation:number;running:boolean;result:BridgeAnalysisV1|null;selectedId:string|null;history:string[];level:'compact'|'expanded'|'full';readers:Record<string,BridgeReaderState>;fullEntry:null|{selectedId:string|null;level:'compact'|'expanded';readers:Record<string,BridgeReaderState>};notice:string|null};
export const bridgeResultContextKey=(r:BridgeAnalysisV1)=>r.baseline?contentHash(r.baseline.context):null;
export const initialBridgeExplorer=(contextKey:string):BridgeExplorerState=>({contextKey,generation:0,running:false,result:null,selectedId:null,history:[],level:'compact',readers:{},fullEntry:null,notice:null});
export type BridgeExplorerAction=
 |{type:'reset';contextKey:string;generation?:number}|{type:'start';generation?:number}|{type:'cancel';generation?:number}
 |{type:'result';generation:number;result:BridgeAnalysisV1}|{type:'select';id:string}
 |{type:'level';level:'compact'|'expanded'}|{type:'full'}|{type:'return'}|{type:'back'}
 |{type:'scroll';id:string;scrollY:number};
export function bridgeExplorerReducer(s:BridgeExplorerState,a:BridgeExplorerAction):BridgeExplorerState{
  switch(a.type){
    case 'reset':return {...initialBridgeExplorer(a.contextKey),generation:a.generation??s.generation+1};
    case 'start':return {...s,generation:a.generation??s.generation+1,running:true,result:null,selectedId:null,history:[],notice:null};
    case 'cancel':return {...s,generation:a.generation??s.generation+1,running:false,notice:'Search cancelled. No late result will replace the current context.'};
    case 'result':{
      if(a.generation!==s.generation||!s.running)return s;
      if(a.result.baseline&&(a.result.baseline.basis!=='validated-pinned-natal'||bridgeResultContextKey(a.result)!==s.contextKey))return {...s,running:false,result:null,notice:'Result withheld: calculation context changed.'};
      return {...s,running:false,result:a.result,selectedId:a.result.alternatives[0]?.id||null,level:'compact',history:[],fullEntry:null};
    }
    case 'select':return !s.result?.alternatives.some(x=>x.id===a.id)||a.id===s.selectedId?s:{...s,selectedId:a.id,level:s.level==='full'?'full':'compact',history:s.level==='full'&&s.selectedId?[...s.history,s.selectedId]:s.history};
    case 'level':return s.level==='full'?s:{...s,level:a.level};
    case 'full':return s.level==='full'||!s.selectedId?s:{...s,level:'full',history:[],fullEntry:{selectedId:s.selectedId,level:s.level,readers:JSON.parse(JSON.stringify(s.readers))}};
    case 'return':return {...s,selectedId:s.fullEntry?.selectedId||s.selectedId,level:s.fullEntry?.level||'compact',readers:{...s.readers,...s.fullEntry?.readers},fullEntry:null,history:[]};
    case 'back':return s.level!=='full'?s:s.history.length?{...s,selectedId:s.history.at(-1)!,history:s.history.slice(0,-1)}:bridgeExplorerReducer(s,{type:'return'});
    case 'scroll':return !s.result?.alternatives.some(x=>x.id===a.id)||!Number.isFinite(a.scrollY)||a.scrollY<0?s:{...s,readers:{...s.readers,[a.id]:{scrollY:a.scrollY}}};
  }
}
