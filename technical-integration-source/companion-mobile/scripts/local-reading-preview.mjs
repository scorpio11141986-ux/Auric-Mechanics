import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
function run(args,env){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Child exit '+code)));});}
if(!process.argv.includes('--serve-only'))await run(['node_modules/expo/bin/cli','export','--platform','web','--dev','--output-dir','.local-reading-dist','--max-workers','2'],{EXPO_PUBLIC_AURIC_LOCAL_READING:'1'});
await run(['--import','./node_modules/tsx/dist/loader.mjs','server/local-reading/index.ts','--enable-local-reading'],{AURIC_LOCAL_LLM_PREVIEW:'1'});
