import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});

try{
  const response=await page.goto('http://127.0.0.1:8766/live-viewer/',{waitUntil:'networkidle',timeout:30000});
  if(!response||response.status()>=400)throw new Error('HTTP '+(response?.status()||'NO_RESPONSE'));
  const title=await page.title();
  if(title!=='TGG Live Viewer')throw new Error('Wrong LiveViewer title: '+title);

  const required=['refresh','conn','token','connect','launch','action','certs','certList','sessions','status','worker','flow','count','stream'];
  const missing=await page.evaluate(ids=>ids.filter(id=>!document.getElementById(id)),required);
  if(missing.length)throw new Error('Missing LiveViewer controls: '+missing.join(', '));

  const body=await page.locator('body').innerText();
  for(const text of ['TGG LIVE VIEWER','TGG-owned browser control room','Certification Pipeline','Browser Sessions','Launch Browser Certification']){
    if(!body.includes(text))throw new Error('Missing LiveViewer text: '+text);
  }

  const launchState=await page.locator('#launch').evaluate(el=>({
    disabled:!!el.disabled,
    visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length),
    bound:typeof el.onclick==='function'
  }));
  if(launchState.disabled||!launchState.visible||!launchState.bound)throw new Error('LiveViewer launch control unavailable '+JSON.stringify(launchState));
  const launchResult=await page.evaluate(()=>{
    const el=document.getElementById('launch');
    const action=document.getElementById('action');
    if(!el||typeof el.onclick!=='function')return{bound:false,action:action?.textContent||''};
    el.click();
    return{bound:true,action:action?.textContent||''};
  });
  if(!launchResult.bound||!/Enter your real TGG session token first/i.test(launchResult.action))throw new Error('Real-session guard failed: '+JSON.stringify(launchResult));
  const guard=launchResult.action;

  const source=await page.content();
  if(!source.includes("source:'tgg-live-viewer'")||!source.includes("real_user_session:true"))throw new Error('LiveViewer certification evidence wiring missing');

  const benign=errors.filter(x=>!/favicon/i.test(x));
  if(benign.length)throw new Error(benign.join('\n'));

  console.log(JSON.stringify({ok:true,title,controls:required.length,realSessionGuard:true,certificationSource:'tgg-live-viewer'}));
}finally{
  await browser.close();
}
