// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {readingLimits,GenerationLeases} from '../server/local-reading/budgets';
import {buildProviderRequest,INSTRUCTIONS,createProvider} from '../server/local-reading/provider';
import {responseUsage,consumeStream} from '../server/local-reading/auth/protocol.mjs';
const stream=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
test('usage distinguishes absent, zero, cached, reasoning and optional write counters',()=>{
 assert.equal(responseUsage(null).status,'unavailable');assert.equal(responseUsage(null).totalTokens,null);
 const u=responseUsage({input_tokens:120,input_tokens_details:{cached_tokens:80},output_tokens:50,output_tokens_details:{reasoning_tokens:30},total_tokens:170});assert.equal(u.cachedInputTokens,80);assert.equal(u.reasoningTokens,30);assert.equal(u.cacheWriteTokens,null);assert.equal(u.subscriptionAllowancePercent,null);
 assert.equal(responseUsage({input_tokens:0}).inputTokens,0);assert.equal(responseUsage({input_tokens:-1,output_tokens:1.5}).status,'unavailable');assert.equal(responseUsage({input_tokens_details:{cache_write_tokens:8}}).cacheWriteTokens,8);
});
test('SSE completion retains actual usage; incomplete still fails with its reported usage',async()=>{
 const usage={input_tokens:90,output_tokens:40,total_tokens:130};const delta={type:'response.output_text.delta',delta:'test'};
 const result=await consumeStream(stream([delta,{type:'response.completed',response:{id:'test',status:'completed',usage}}]));assert.equal(result.usage.totalTokens,130);
 await assert.rejects(consumeStream(stream([delta,{type:'response.incomplete',response:{usage}}])),e=>e.code==='STREAM_INCOMPLETE'&&e.usage.outputTokens===40);
 assert.equal((await consumeStream(stream([delta,{type:'response.completed',response:{id:'test',status:'completed'}}]))).usage.status,'unavailable');
});
test('UTF8 input budget includes system instructions and rejects before provider requests',async()=>{
 const packet={model:{text:'é'.repeat(100)}};const bytes=Buffer.byteLength(INSTRUCTIONS+JSON.stringify(packet.model));
 const body=buildProviderRequest(packet,'model','xhigh',{maxInputBytes:bytes,maxOutputTokens:512});assert.equal(body.max_output_tokens,512);assert.equal(body.model,'model');assert.equal(body.reasoning.effort,'xhigh');assert.equal(body.store,false);
 assert.throws(()=>buildProviderRequest(packet,'model','xhigh',{maxInputBytes:bytes-1,maxOutputTokens:512}),/INPUT_BUDGET/);
 const provider=createProvider(()=>assert.fail('Preflight rejection must not send a request'));const old=process.env.AURIC_MAX_INPUT_BYTES;process.env.AURIC_MAX_INPUT_BYTES='16';try{await assert.rejects(provider.generate(packet,'model','xhigh'),/INPUT_BUDGET/);}finally{if(old===undefined)delete process.env.AURIC_MAX_INPUT_BYTES;else process.env.AURIC_MAX_INPUT_BYTES=old;}
 assert.throws(()=>readingLimits({AURIC_MAX_OUTPUT_TOKENS:'NaN'}),/BUDGET_INVALID/);
});
test('leases deduplicate exact generation keys across grants; revoke and replacement abort in flight',()=>{
 const leases=new GenerationLeases(),a=leases.begin('same-packet','a','token-a');assert.throws(()=>leases.begin('same-packet','b','token-b'),/ALREADY_GENERATING/);
 const b=leases.begin('another','b','token-b');assert.throws(()=>leases.begin('third','c','token-c'),/CAPACITY_BUSY/);leases.cancelToken('token-a');assert.equal(a.signal.aborted,true);assert.equal(b.signal.aborted,false);a.finish();
 const c=leases.begin('same-packet','c','token-c');a.finish();assert.throws(()=>leases.begin('same-packet','a','new'),/ALREADY_GENERATING/);leases.cancelClient('c');assert.equal(c.signal.aborted,true);leases.clear();assert.equal(b.signal.aborted,true);b.finish();c.finish();assert.ok(leases.begin('same-packet','a','new'));
});
test('provider transport receives cancellation, uses capped request, and records unknown spent usage honestly',async()=>{
 const receipts=[],provider=createProvider((kind,data)=>receipts.push({kind,...data})),controller=new AbortController();let sent;
 provider.connection.discover=async()=>[{slug:'mock-model',reasoningEfforts:['xhigh']}];provider.connection.current=async()=>({access_token:'synthetic-not-a-real-token'});
 provider.connection.request=async(url,options)=>{sent=JSON.parse(options.body);assert.equal(options.signal.aborted,false);return await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('synthetic-abort')),{once:true});controller.abort();});};
 await assert.rejects(provider.generate({model:{facts:[]},entry:{id:'synthetic'},requestDigest:'test',packetDigest:'test'},'mock-model','xhigh',controller.signal),/GENERATION_CANCELLED/);
 assert.equal(sent.max_output_tokens,readingLimits().maxOutputTokens);assert.equal(receipts.at(-1).usage.status,'unavailable');assert.equal(receipts.at(-1).spentUsageNotRefunded,true);
});
