import {readingLimits,GenerationLeases} from './budgets';
/** Trusted, loopback-only development runtime. No production or paid fallback. */
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {newAttempt,ProofError,equalSecret} from './auth/protocol.mjs';
import type {LocalPacket} from './packet';
import {createProvider} from './provider';
import {SelectionGrants} from './selection';
import {validateSavedReadingRequest,savedReadingIdentity} from '../../src/reading/local-selection';
import {validateLocalBundle,requireLocal} from '../../src/reading/llm-validation';
import {checkStandardPriorities} from '../../src/reading/local-salience';
import {LOCAL_LLM_PROMPT_VERSION,type LocalReadingResult} from '../../src/reading/llm-contract';
import {publicFacts,deterministic,cacheKey,assembleResult} from './result';

const app=resolve(fileURLToPath(new URL('../../',import.meta.url))),repo=resolve(app,'../..');
requireLocal(process.argv.includes('--enable-local-reading')&&process.env.AURIC_LOCAL_LLM_PREVIEW==='1','LOCAL_READING_FEATURE_FLAG_REQUIRED');
const port=Number(process.env.AURIC_LOCAL_READING_PORT||4197),origin=`http://127.0.0.1:${port}`;
requireLocal(Number.isInteger(port)&&port>1024&&port<65536,'LOCAL_PORT_INVALID');
const staticRoot=join(app,'.local-reading-dist'),runtime=join(app,'.runtime/local-reading-p3a'),evidence=resolve(process.env.AURIC_LOCAL_READING_EVIDENCE||join(repo,'evidence/p3-a-20261024/runtime'));
requireLocal(evidence.startsWith(join(repo,'evidence')+sep),'EVIDENCE_PATH_OUTSIDE_WORKSPACE');
for(const p of [runtime,evidence])mkdirSync(p,{recursive:true});
const generations=new GenerationLeases();
const csrf=randomBytes(32).toString('base64url'),grants=new SelectionGrants();
let receiptCount=0,pending:any=null,authBusy=false,preparing=0;
const preparationQueue:(()=>void)[]=[];
function drainPreparation(){while(preparing<2&&preparationQueue.length){preparing++;preparationQueue.shift()!();}}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const save=(path:string,data:any)=>writeFileSync(path,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const errorCode=(e:unknown)=>e instanceof Error&&/^[a-z0-9_ -]{1,180}$/i.test(e.message)?e.message:'LOCAL_READING_FAILED';
const receipt=(kind:string,data:any)=>{save(join(evidence,`${stamp}-${String(++receiptCount).padStart(4,'0')}-${kind}.json`),{kind,at:new Date().toISOString(),...data});console.log(JSON.stringify({event:kind,...(data.caseId?{caseId:data.caseId}:{}),...(data.code?{code:data.code}:{})}));};
const provider=createProvider(receipt),installation=await provider.secureStore('init');
const packets=new Map<string,LocalPacket>(),selections=new Map<string,any>(),jobs=new Map<string,any>(),busy=new Set<string>();
function readCache(p:LocalPacket,model:string,effort:string):LocalReadingResult|null{
 const path=join(runtime,cacheKey(p,model,effort)+'.json');if(!existsSync(path))return null;
 try{const cached=JSON.parse(readFileSync(path,'utf8'));requireLocal(cached.model===model&&cached.effort===effort,'CACHE_MODEL_MISMATCH');return {...cached,...validateLocalBundle(cached.bundle,p),case:p.entry,facts:publicFacts(p),deterministic:deterministic(p),cacheHit:true};}
 catch(e){receipt('cache-rejected',{caseId:p.entry.id,code:errorCode(e)});return null;}
}
function prepareInWorker(request:unknown):Promise<LocalPacket>{
 return new Promise((resolveResult,reject)=>{
  const child=fork(fileURLToPath(new URL('./prepare-worker.ts',import.meta.url)),[],{execArgv:['--import',pathToFileURL(join(app,'node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  let settled=false;
  const timer=setTimeout(()=>{child.kill();reject(Error('PREPARATION_TIMEOUT'));},240_000);
  child.once('message',(message:any)=>{settled=true;clearTimeout(timer);message.packet?resolveResult(message.packet):reject(Error(message.error||'PREPARATION_FAILED'));});
  child.once('error',()=>{clearTimeout(timer);reject(Error('PREPARATION_WORKER_UNAVAILABLE'));});
  child.once('exit',()=>{clearTimeout(timer);if(!settled)reject(Error('PREPARATION_WORKER_STOPPED'));});
  child.send(request as any);
 });
}
async function prepare(clientId:string,token:string,request:unknown,identity:string){
 const state=selections.get(token);
 if(!state){preparing--;drainPreparation();return;}
 try{
  let packet=packets.get(identity);if(!packet){packet=await prepareInWorker(request);packets.set(identity,packet);}
  grants.require(clientId,token);state.packet=packet;state.state='ready';state.stage='Native chart and source evidence verified';
  receipt('selection-ready',{caseId:packet.entry.id,selectionIdentity:identity,requestDigest:packet.requestDigest,selectedSavedHashes:(request as any).participants.map((p:any)=>({personId:p.personId,chartVersionId:p.chartVersionId,factsHash:p.factsHash,transportFactsHash:p.transportFactsHash})),participants:packet.model.participants.map(p=>({personId:p.personId,chartVersionId:p.chartVersionId,snapshotHash:p.snapshotHash})),sourceAuthorization:packet.model.authorizationId});
 }catch(e){state.state='failed';state.error=errorCode(e);}finally{preparing--;drainPreparation();}
}
async function generate(clientId:string,token:string,model:string,effort:string,requestId:string,lease:ReturnType<GenerationLeases['begin']>){
 const job=jobs.get(requestId),p=selections.get(token)?.packet as LocalPacket;
 try{
  grants.require(clientId,token,true);
  await provider.connection.current();
  const cached=readCache(p,model,effort);
  if(cached){grants.require(clientId,token,true);job.result=cached;job.state='completed';job.stage='Validated saved reading';receipt('cache-served',{caseId:p.entry.id,model,effort,requestDigest:p.requestDigest});return;}
  requireLocal(process.env.AURIC_LOCAL_READING_CACHE_ONLY!=='1','CACHE_ONLY_READING_UNAVAILABLE');
  const folder=join(evidence,`${p.entry.id}-${requestId}`);mkdirSync(folder);
  save(join(folder,'packet.json'),{case:p.entry,requestDigest:p.requestDigest,packetDigest:p.packetDigest,evidence:p.evidence,withheld:p.withheld,selection:p.selection,records:p.records,readingPriorities:p.model.readingPriorities});
  save(join(folder,'model-input.json'),p.model);save(join(folder,'deterministic.json'),p.deterministic);
  job.stage='Writing the complete reading with exact source support';
  const response=await provider.generate(p,model,effort,lease.signal);
  writeFileSync(join(folder,'raw-model.txt'),response.raw,{flag:'wx'});save(join(folder,'request.json'),response.body);
  grants.require(clientId,token,true);
  let value;try{value=JSON.parse(response.raw);}catch{throw Error('MODEL_OUTPUT_NOT_JSON');}
  job.stage='Checking chart identity, evidence and depth';
  const result={...assembleResult(value,p,model,effort),usage:response.usage};
  save(join(folder,'validated-result.json'),result);
  save(join(folder,'validation.json'),{...result.validation,priorities:checkStandardPriorities(value,p),semanticAcceptance:'pending-independent-review'});
  grants.require(clientId,token,true);
  const path=join(runtime,cacheKey(p,model,effort)+'.json');if(!existsSync(path))save(path,result);
  job.result=result;job.state='completed';job.stage='Ready for review';receipt('reading-ready',{caseId:p.entry.id,requestId,model,effort,requestDigest:p.requestDigest,deepStatus:result.validation.depthStatus});
 }catch(e){job.state='failed';job.error=errorCode(e);job.stage='Model reading unavailable; deterministic reading remains available';receipt('reading-failed',{caseId:p?.entry.id,requestId,code:job.error});}finally{busy.delete(token);lease.finish();}
}
function safePath(pathname:string){const p=resolve(staticRoot,'.'+decodeURIComponent(pathname));requireLocal(p===staticRoot||p.startsWith(staticRoot+sep),'STATIC_PATH_FORBIDDEN');return p;}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
 const reply=(status:number,value:any)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 try{
  requireLocal(req.headers.host===`127.0.0.1:${port}`,'LOCAL_HOST_REJECTED');
  const u=new URL(req.url||'/',origin),prefix='/api/local-reading';
  if(req.method==='GET'&&u.pathname==='/auth/callback'){
   requireLocal(!authBusy,'AUTH_BUSY');authBusy=true;try{await provider.connection.acceptCallback(pending,u);pending=null;}finally{authBusy=false;}
   res.writeHead(303,{Location:'/?localReading=1'});res.end();return;
  }
  if(u.pathname.startsWith(prefix)){
   requireLocal(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin'||req.headers['sec-fetch-site']==='none','LOCAL_SITE_REJECTED');
   let body:any={};if(req.method==='POST'){
    requireLocal(req.headers.origin===origin,'LOCAL_ORIGIN_REJECTED');requireLocal(req.headers['content-type']?.startsWith('application/json'),'JSON_REQUIRED');
    let bytes='';for await(const chunk of req){bytes+=chunk;requireLocal(bytes.length<32768,'REQUEST_TOO_LARGE');}body=JSON.parse(bytes);
    requireLocal(equalSecret(body.csrf,csrf),'CSRF_REJECTED');
   }
   const route=u.pathname.slice(prefix.length);
   if(req.method==='GET'&&route==='/session'){
    let models:any[]=[],connected=false,error:string|null=null;
    try{await provider.connection.current();models=await provider.connection.discover();connected=true;}catch(e){error=errorCode(e);}
    reply(200,{enabled:true,connected,models,csrf,error,authorization:'S42',limits:readingLimits(),usageScope:'Reported tokens are not a subscription percentage or measured price.',planUsage:'Uses your authorized ChatGPT plan. No API-key or paid-billing fallback.'});return;
   }
   if(req.method==='POST'&&route==='/auth/start'){const saved=await provider.secureStore('load'),a=newAttempt({hostId:installation.hostId,port,registration:saved?.client_id?saved:undefined});pending=a.attempt;reply(200,{url:a.url});return;}
   if(req.method==='POST'&&route==='/auth/logout'){generations.clear();grants.clear();reply(200,await provider.connection.signOut());return;}
   if(req.method==='POST'&&route==='/selection'){
    requireLocal(Object.keys(body).every(k=>['clientId','request','csrf'].includes(k)),'UNTRUSTED_REQUEST_FIELDS');
    const request=validateSavedReadingRequest(body.request),identity=savedReadingIdentity(request);
    requireLocal(selections.size<200,'PREPARATION_BUSY');
    generations.cancelClient(body.clientId);
    const token=randomBytes(24).toString('hex');grants.issue(body.clientId,token,request);
    selections.set(token,{state:'preparing',stage:'Recomputing the selected saved chart revisions',identity});
    reply(202,{token,identity,state:'preparing'});preparationQueue.push(()=>void prepare(body.clientId,token,request,identity));setImmediate(drainPreparation);return;
   }
   const clientId=String(body.clientId||u.searchParams.get('clientId')||''),token=String(body.token||u.searchParams.get('token')||'');
   if(req.method==='POST'&&route==='/revoke'){grants.require(clientId,token);generations.cancelToken(token);grants.revoke(clientId);selections.delete(token);reply(200,{revoked:true});return;}
   if(req.method==='GET'&&route==='/selection'){
    grants.require(clientId,token);const state=selections.get(token);requireLocal(state,'UNKNOWN_SELECTION');
    if(state.state!=='ready'){reply(200,{state:state.state,stage:state.stage,error:state.error});return;}
    const p=state.packet as LocalPacket;
    reply(200,{state:'ready',stage:state.stage,case:p.entry,identity:state.identity,requestDigest:p.requestDigest,packetDigest:p.packetDigest,facts:publicFacts(p),deterministic:deterministic(p),coverage:{fields:p.evidence.length,records:p.records.length,withheld:p.withheld,limits:p.model.limitations},readingPriorities:p.model.readingPriorities});return;
   }
   if(req.method==='POST'&&route==='/generate'){
    requireLocal(Object.keys(body).every(k=>['clientId','token','model','effort','csrf','requestNonce'].includes(k)),'UNTRUSTED_REQUEST_FIELDS');
    grants.require(clientId,token,true);requireLocal(selections.get(token)?.state==='ready','SELECTION_NOT_READY');
    requireLocal(typeof body.model==='string'&&typeof body.effort==='string'&&typeof body.requestNonce==='string'&&/^[a-z\d-]{8,80}$/i.test(body.requestNonce),'INVALID_READING_REQUEST');
    requireLocal(!busy.has(token)&&busy.size<2,'READING_ALREADY_GENERATING');
    const lease=generations.begin(cacheKey(selections.get(token).packet,body.model,body.effort),clientId,token);
    const requestId=randomBytes(12).toString('hex'),job={requestId,clientId,token,requestNonce:body.requestNonce,state:'running',stage:'Queued',requestDigest:selections.get(token).packet.requestDigest};
    jobs.set(requestId,job);busy.add(token);reply(202,{requestId,requestNonce:job.requestNonce,requestDigest:job.requestDigest});setImmediate(()=>void generate(clientId,token,body.model,body.effort,requestId,lease));return;
   }
   if(req.method==='GET'&&route==='/job'){
    grants.require(clientId,token,true);const j=jobs.get(u.searchParams.get('id')||'');requireLocal(j&&j.clientId===clientId&&j.token===token,'UNKNOWN_JOB');
    const {clientId:_client,token:_token,...publicJob}=j;reply(200,publicJob);return;
   }
   if(req.method==='GET'&&route==='/explore'){
    grants.require(clientId,token);const p=selections.get(token)?.packet as LocalPacket;requireLocal(p,'SELECTION_NOT_READY');
    reply(200,{records:p.records,evidence:p.evidence,withheld:p.withheld,selection:p.selection,readingPriorities:p.model.readingPriorities});return;
   }
   reply(404,{error:'LOCAL_ROUTE_NOT_FOUND'});return;
  }
  requireLocal(req.method==='GET'||req.method==='HEAD','METHOD_NOT_ALLOWED');
  let path=safePath(u.pathname);if(u.pathname==='/'||!extname(path))path=join(staticRoot,'index.html');
  const bytes=readFileSync(path),mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){reply(400,{error:e instanceof ProofError?e.code:errorCode(e)});}
});
server.listen(port,'127.0.0.1',()=>{save(join(evidence,`server-${stamp}.json`),{pid:process.pid,url:origin,bind:'127.0.0.1',featureFlag:true,credentialsInBrowser:false,cacheOnly:process.env.AURIC_LOCAL_READING_CACHE_ONLY==='1',promptVersion:LOCAL_LLM_PROMPT_VERSION,authorization:'S42'});console.log(`Auric P3-A local reading: ${origin}`);});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
