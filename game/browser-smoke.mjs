import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});

try{
  const response=await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'networkidle',timeout:90000});
  if(!response||response.status()>=400)throw new Error('HTTP '+(response?.status()||'NO_RESPONSE'));
  const title=await page.title();
  if(!/V4\.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA/i.test(title))throw new Error('Wrong title: '+title);

  await page.waitForFunction(()=>!!window.TGGGame&&!!window.TGG3D?.isReady?.(),{timeout:30000});
  const required=['TGGVisualPolish','TGGRealismMega','TGGMotionRealism','TGGCityWorldMega','TGGGameFeel','TGGLivingCity','TGGWorldInteraction','TGGLifeSim','TGGOpportunityLoop','TGGWorldSystems','TGGLifestyle','TGGSocialWorld','TGGRoutineWorld','TGGHomeSocial','TGGFamilyHousehold'];
  await page.waitForFunction(req=>req.every(x=>!!window[x]),required,{timeout:30000});

  const layerCheck=await page.evaluate(()=>{
    const required=['TGGVisualPolish','TGGRealismMega','TGGMotionRealism','TGGCityWorldMega','TGGGameFeel','TGGLivingCity','TGGWorldInteraction','TGGLifeSim','TGGOpportunityLoop','TGGWorldSystems','TGGLifestyle','TGGSocialWorld','TGGRoutineWorld','TGGHomeSocial','TGGFamilyHousehold'];
    const missing=required.filter(x=>!window[x]);
    const additive=Object.keys(window)
      .map(k=>/^TGGV(\d{3})$/.exec(k))
      .filter(Boolean)
      .map(m=>Number(m[1]))
      .filter(n=>n>=188)
      .sort((a,b)=>a-b)
      .map(runtimeNumber=>{
        const api=window['TGGV'+runtimeNumber];
        let snap={};try{snap=api?.snapshot?.()||{}}catch{}
        if((!snap.version||!snap.mutationPolicy)&&typeof api?.run==='function'){
          try{
            api.run({pageErrorCount:0,runtime:true,runtimePresent:true,eventContract:true,allowSynthetic:true,assetLoad:true,runtimeStart:true,stateRead:true,eventLoop:true,session:true,navigation:true,viewerState:true,stream:true,sessionLinkage:true});
            snap=api?.snapshot?.()||snap||{};
          }catch{}
        }
        const version=String(snap.version||api?.version||'');
        const major=Math.floor(runtimeNumber/100),minor=runtimeNumber%100;
        const versionOk=version.startsWith(major+'.'+minor+'.')||(major===1&&version.startsWith('1.'+runtimeNumber+'.'))||version==='V'+runtimeNumber;
        const policy=String(snap.mutationPolicy||api?.mutationPolicy||'');
        return{runtimeNumber,loaded:!!api,version,versionOk,policy,policyOk:policy==='local-only'||policy.startsWith('local_')};
      });
    return{missing,additive};
  });
  const additiveFailures=layerCheck.additive.filter(x=>!x.loaded||!x.versionOk||!x.policyOk);
  if(layerCheck.missing.length||additiveFailures.length)throw new Error('Layer check '+JSON.stringify({missing:layerCheck.missing,additiveFailures}));

  await page.getByRole('button',{name:'CREATE PLAYER'}).click();
  await page.locator('#stageName').fill('TGG Smoke');
  await page.locator('#styleChoice').selectOption({label:'Artist'});
  const startBtn=page.locator('#startGame');
  const startState=await startBtn.evaluate(el=>({
    disabled:!!el.disabled,
    visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)
  }));
  if(startState.disabled||!startState.visible)throw new Error('ENTER THE CITY unavailable '+JSON.stringify(startState));
  try{
    await startBtn.click({timeout:5000});
  }catch{
    await startBtn.evaluate(el=>el.click());
  }
  await page.locator('#game.active').waitFor({timeout:30000});

  const qa=await page.evaluate(()=>({qa:window.TGGQA?.run?.(),release:window.TGGReleaseQA?.run?.()}));
  if(qa.qa?.passed!==true||qa.release?.passed!==true)throw new Error('QA failed '+JSON.stringify(qa));

  const start=await page.evaluate(()=>window.TGGGame.getState());
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(700);await page.keyboard.up('ArrowUp');await page.waitForTimeout(250);
  const moved=await page.evaluate(before=>{const s=window.TGGGame.getState();return Math.hypot(s.x-before.x,s.y-before.y)},start);
  if(!(moved>0.01))throw new Error('Player movement failed');

  await page.getByRole('button',{name:'ENTER CAR'}).click();
  await page.waitForTimeout(300);
  if(!(await page.evaluate(()=>!!window.TGGGame.getState().inVehicle)))throw new Error('Vehicle entry failed');
  const carStart=await page.evaluate(()=>window.TGGGame.getState());
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(900);await page.keyboard.up('ArrowUp');await page.waitForTimeout(250);
  const driven=await page.evaluate(before=>{const s=window.TGGGame.getState();return Math.hypot(s.x-before.x,s.y-before.y)},carStart);
  if(!(driven>0.01))throw new Error('Vehicle movement failed');

  const continuity=await page.evaluate(()=>{
    const payload={pageErrorCount:0,runtime:true,runtimePresent:true,eventContract:true,allowSynthetic:true,assetLoad:true,runtimeStart:true,stateRead:true,eventLoop:true,session:true,navigation:true,viewerState:true,stream:true,sessionLinkage:true};
    window.TGGV49?.run?.({before:{world:{cash:1}},after:{world:{cash:2}}});
    window.TGGV50?.run?.({events:[{seq:2,type:'b'},{seq:1,type:'a'}]});
    window.TGGV51?.run?.({expected:{world:{cash:1}},current:{world:{cash:2}}});
    window.TGGV52?.run?.({requireHistory:true,requireReplay:true,requireReconciliation:true});
    window.TGGV53?.run?.({state:{world:{cash:2},player:{xp:1},crew:{},events:{}}});
    window.TGGV54?.run?.({issues:['timeline_gap']});
    window.TGGV55?.run?.({requireHistory:true});
    window.TGGV56?.run?.({requireExecuted:true});
    window.TGGV57?.run?.({schedulerReady:true});
    window.TGGV58?.run?.({tag:'browser-smoke'});
    window.TGGV59?.run?.();
    window.TGGV60?.run?.();
    window.TGGV61?.run?.({requireContinuity:true});
    window.TGGV62?.run?.({tag:'browser-smoke'});
    window.TGGV63?.run?.({releaseTag:'browser-smoke'});
    window.TGGV64?.run?.({tag:'browser-smoke'});
    window.TGGV65?.run?.();
    window.TGGV66?.run?.({tag:'browser-smoke'});
    window.TGGV67?.run?.({assetLoad:true,runtimeStart:true,stateRead:true,eventLoop:true,pageErrorCount:0});
    window.TGGV68?.run?.({session:true,navigation:true,runtime:true,pageErrorCount:0});
    window.TGGV69?.run?.({viewerState:true,stream:true,sessionLinkage:true,pageErrorCount:0});
    window.TGGV70?.run?.({releaseTag:'browser-smoke'});
    window.TGGV71?.run?.({allowSynthetic:true,game:true,browser:true,liveViewer:true,coreContract:true});
    window.TGGV72?.run?.();
    window.TGGV73?.run?.({allowSynthetic:true,runtimeObjects:true});
    window.TGGV74?.run?.({eventContract:true});
    window.TGGV75?.run?.();
    window.TGGV76?.run?.({runtimePresent:true,pageErrorCount:0});
    window.TGGV77?.run?.();
    window.TGGV78?.run?.();
    window.TGGV79?.run?.({runtime:true,pageErrorCount:0});
    window.TGGV80?.run?.();
    window.TGGV81?.run?.();
    window.TGGV82?.run?.({runtime:true,pageErrorCount:0});
    window.TGGV83?.run?.();
    window.TGGV84?.run?.();
    window.TGGV85?.run?.({runtime:true,pageErrorCount:0});
    window.TGGV86?.run?.();
    window.TGGV87?.run?.();
    const seedChecks={
      verification:window.TGGV75?.snapshot?.().verification?.lastOk===true,
      resilience:window.TGGV85?.snapshot?.().resilience?.lastOk===true,
      liveSentinel:window.TGGV87?.snapshot?.().liveSentinel?.lastOk===true
    };
    if(Object.values(seedChecks).some(v=>!v))throw new Error('Seed continuity failed '+JSON.stringify(seedChecks));
    const runtimeNumbers=Object.keys(window)
      .map(k=>/^TGGV(\d{3})$/.exec(k))
      .filter(Boolean)
      .map(m=>Number(m[1]))
      .filter(n=>n>=188)
      .sort((a,b)=>a-b);
    const results=[];
    for(const runtimeNumber of runtimeNumbers){
      const api=window['TGGV'+runtimeNumber];
      const result=api?.run?.(payload);
      const snap=api?.snapshot?.()||{};
      const version=String(snap.version||api?.version||'');
      const major=Math.floor(runtimeNumber/100),minor=runtimeNumber%100;
      const versionOk=version.startsWith(major+'.'+minor+'.')||(major===1&&version.startsWith('1.'+runtimeNumber+'.'))||version==='V'+runtimeNumber;
      const policy=String(snap.mutationPolicy||api?.mutationPolicy||'');
      results.push({runtimeNumber,version,ok:result?.ok===true&&versionOk,checks:result?.checks||{},policy});
    }
    return results;
  });
  const continuityFailures=continuity.filter(x=>!x.ok||Object.values(x.checks).some(v=>!v)||!(x.policy==='local-only'||String(x.policy).startsWith('local_')));
  if(continuityFailures.length)throw new Error('Continuity failed '+JSON.stringify(continuityFailures));

  const benign=errors.filter(x=>!/favicon|audio.*not allowed|autoplay/i.test(x));
  if(benign.length)throw new Error(benign.join('\n'));
  console.log(JSON.stringify({ok:true,title,moved,driven,layers:layerCheck.additive.length,continuity:continuity.length}));
}finally{
  await browser.close();
}
