import { spawn } from 'node:child_process';
import fs from 'node:fs';

const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error('CHROME_BIN is required');
const port = 9222;
const url = 'http://127.0.0.1:8765/qa/nova-v1400-dsp-qa.html';
const args = [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=/tmp/nova-v1400-chrome2',
  '--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,
  url
];
const child = spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
let browserErr=''; child.stderr.on('data',d=>browserErr+=d.toString());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getPage(){
  for(let i=0;i<100;i++){
    try{
      const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page=pages.find(p=>p.type==='page' && p.url.includes('nova-v1400-dsp-qa'));
      if(page?.webSocketDebuggerUrl) return page;
    }catch{}
    await sleep(100);
  }
  throw new Error('CDP page did not appear');
}
let seq=0; const pending=new Map();
try{
  const page=await getPage();
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
  await send('Runtime.enable');
  const expr=`new Promise(resolve=>{const started=Date.now();const tick=()=>{const v=document.getElementById('qa-result')?.textContent||'';if(v.startsWith('QA_PASS::')||v.startsWith('QA_FAIL::')||Date.now()-started>20000)resolve(v);else setTimeout(tick,100);};tick();})`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  const text=r?.result?.result?.value||'';
  fs.writeFileSync('nova-v1400-dsp-qa-result.txt',text+'\n');
  console.log(text);
  ws.close();
  if(!text.startsWith('QA_PASS::')) process.exitCode=1;
} catch(e){
  console.error(e);
  console.error(browserErr.slice(-6000));
  process.exitCode=2;
} finally {
  child.kill('SIGTERM');
}
