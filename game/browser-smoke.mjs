import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});

async function clickRuntimeControl(selector,label){
  const result=await page.evaluate(({selector})=>{
    const el=document.querySelector(selector);
    if(!el)return {found:false,visible:false,disabled:false,unblocked:false,clicked:false,blockedBy:null};
    el.scrollIntoView({block:'center',inline:'center'});
    const style=getComputedStyle(el);
    const rect=el.getBoundingClientRect();
    const visible=!el.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
    const disabled=!!el.disabled;
    const x=Math.max(0,Math.min(innerWidth-1,rect.left+rect.width/2));
    const y=Math.max(0,Math.min(innerHeight-1,rect.top+rect.height/2));
    const top=visible?document.elementFromPoint(x,y):null;
    const unblocked=!!top&&(top===el||el.contains(top));
    const blockedBy=unblocked?null:(top?.id||top?.closest?.('[id]')?.id||top?.tagName||null);
    if(visible&&!disabled&&unblocked)el.click();
    return {found:true,visible,disabled,unblocked,clicked:visible&&!disabled&&unblocked,blockedBy};
  },{selector});
  if(!result.found||!result.visible||result.disabled||!result.unblocked||!result.clicked){
    throw new Error(label+' runtime control unavailable '+JSON.stringify(result));
  }
}


async function clearIncomingCallOverlay(label){
  const result=await page.evaluate(()=>{
    const calls=window.TGGIncomingCalls;
    let cleared=0,guard=0;
    while(calls?.snapshot?.().current&&guard++<10){calls.declineCurrent();cleared++;}
    calls?.clearMissed?.();
    const overlay=document.getElementById('v502IncomingCall');
    return {cleared,hidden:!overlay||overlay.hidden,current:calls?.snapshot?.().current||null};
  });
  if(result.hidden!==true||result.current){
    throw new Error(label+' incoming-call overlay did not clear '+JSON.stringify(result));
  }
  return result;
}

async function inspectInteractControl(){
  return page.evaluate(()=>{
    const refresh=window.TGG3D?.refreshInteractionState?.(window.TGGGame?.getState?.())||null;
    const el=window.TGG3D?.ensureInteractButton?.()||document.getElementById('interact3dBtn');
    const runtime=window.TGG3D?.interactionRuntimeStatus?.()||null;
    return {
      exists:!!el,
      disabled:el?!!el.disabled:true,
      text:el?String(el.textContent||'').trim():'',
      worldBeatReady:!!el?.classList?.contains('world-beat-ready'),
      meetupReady:!!el?.classList?.contains('meetup-ready'),
      encounterReady:!!el?.classList?.contains('encounter-ready'),
      streetMissionReady:!!el?.classList?.contains('street-mission-ready'),
      storyReady:!!el?.classList?.contains('story-ready'),
      refresh,
      runtime
    };
  });
}

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

  const gameplayMega=await page.evaluate(()=>{
    const story=window.TGGStoryMissions;
    const world=window.TGGWorldDepth;
    const api={
      story:!!story,
      missionCheckpoint:typeof story?.missionCheckpoint==='function',
      resumeMission:typeof story?.resumeMission==='function',
      routeGuide:typeof story?.routeGuide==='function',
      missionEvidence:typeof story?.missionEvidence==='function',
      world:!!world,
      beatNavigation:typeof world?.beatNavigation==='function'
    };
    const checkpoint=story?.missionCheckpoint?.('BROWSER-SMOKE')||null;
    const missionOps=story?.missionOps?.()||null;
    const guide=story?.routeGuide?.()||null;
    const beat=world?.spawnBeat?.(true)||null;
    const nav=world?.beatNavigation?.()||null;
    const cityNav=window.TGGNavigation?.getTarget?.()||null;
    const guard=world?.completeBeat?.()||null;
    const worldStatus=world?.getStatus?.()||null;
    return {api,checkpoint,missionOps,guide,beat,nav,cityNav,guard,worldStatus};
  });
  const gameplayFeatures=gameplayMega.worldStatus?.features||[];
  const gameplayApiOk=Object.values(gameplayMega.api).every(Boolean);
  const target=gameplayMega.beat?.target;
  if(!gameplayApiOk||
     gameplayMega.checkpoint?.reason!=='BROWSER-SMOKE'||
     gameplayMega.missionOps?.checkpoint?.reason!=='BROWSER-SMOKE'||
     !gameplayMega.guide?.objective||
     !target||!Number.isFinite(Number(target.x))||!Number.isFinite(Number(target.y))||
     !gameplayMega.nav||gameplayMega.nav.arrived!==false||!(gameplayMega.nav.meters>0)||
     gameplayMega.cityNav?.worldBeat!==true||!(gameplayMega.cityNav?.meters>0)||!/WORLD/i.test(String(gameplayMega.cityNav?.label||''))||
     gameplayMega.guard?.status!=='travel_required'||
     !['physical-world-beat-routing','arrival-gated-world-beat-completion','heading-aware-world-navigation'].every(x=>gameplayFeatures.includes(x))){
    throw new Error('V4.60/Mission Ops gameplay contract failed '+JSON.stringify(gameplayMega));
  }

  const worldInteractionRoute=await page.evaluate(()=>{
    const start={...window.TGGGame.getState()};
    const nav=window.TGGWorldDepth?.beatNavigation?.();
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        const ok=window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0);
        if(!ok)return false;
      }
      return false;
    };
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    const arrived=window.TGGWorldDepth?.beatNavigation?.()||null;
    return {start,routed,arrived,state:{...window.TGGGame.getState()}};
  });
  if(!worldInteractionRoute.routed||worldInteractionRoute.arrived?.arrived!==true){
    throw new Error('World beat physical route failed '+JSON.stringify(worldInteractionRoute));
  }
  await page.waitForTimeout(180);
  const interactState=await inspectInteractControl();
  if(!interactState.exists||interactState.disabled||!interactState.worldBeatReady||!/^DO\s+/i.test(interactState.text)){
    throw new Error('World beat contextual INTERACT unavailable '+JSON.stringify(interactState));
  }
  await page.evaluate(()=>{
    const el=document.getElementById('interact3dBtn');
    if(!el||el.disabled||!el.classList.contains('world-beat-ready'))throw new Error('World beat interaction runtime unavailable');
    el.click();
  });
  await page.waitForTimeout(180);
  const worldInteractionResult=await page.evaluate(start=>{
    const status=window.TGGWorldDepth?.getStatus?.()||{};
    const history=Array.isArray(status.history)?status.history:[];
    const completed=[...history].reverse().find(x=>x?.type==='complete')||null;
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    const current={...window.TGGGame.getState()};
    return {activeBeat:status.activeBeat,completed,restored,current};
  },worldInteractionRoute.start);
  if(worldInteractionResult.activeBeat||
     !worldInteractionResult.completed||
     !worldInteractionResult.restored||
     Math.hypot(worldInteractionResult.current.x-worldInteractionRoute.start.x,worldInteractionResult.current.y-worldInteractionRoute.start.y)>.05){
    throw new Error('World beat physical INTERACT completion failed '+JSON.stringify(worldInteractionResult));
  }

  await page.waitForFunction(()=>!!window.TGGNPCRelations&&!!window.TGGV497,{timeout:15000});
  const relationOpen=await page.evaluate(()=>{
    const before=window.TGGNPCRelations.relationship('DJ V');
    const opened=window.TGGNPCRelations.interact('DJ V');
    const panel=document.getElementById('v497NpcChoice');
    return {
      before,
      opened,
      panelVisible:!!panel&&!panel.hidden,
      run:window.TGGV497.run()
    };
  });
  if(!relationOpen.opened?.ok||relationOpen.opened?.status!=='choice_required'||!relationOpen.panelVisible||
     relationOpen.run?.ok!==true||relationOpen.before?.propertyLevel<1){
    throw new Error('V4.97 NPC relation choice open failed '+JSON.stringify(relationOpen));
  }
  await clickRuntimeControl('#v497NpcChoice [data-v497-choice="loyal"]','V4.97 loyal choice');
  await page.waitForTimeout(120);
  const relationResolved=await page.evaluate(before=>{
    const snap=window.TGGNPCRelations.snapshot();
    const after=window.TGGNPCRelations.relationship('DJ V');
    const world=window.TGGWorldDepth?.getStatus?.()||{};
    return {snap,after,worldChoice:world.lastNpcChoice,beforeAffinity:before?.relation?.affinity||0};
  },relationOpen.before);
  if(relationResolved.snap?.pending||
     relationResolved.snap?.lastResolved?.name!=='DJ V'||
     relationResolved.snap?.lastResolved?.choice!=='loyal'||
     !(relationResolved.after?.relation?.affinity>relationResolved.beforeAffinity)||
     relationResolved.snap?.lastResolved?.propertyLevel<1||
     relationResolved.worldChoice?.name!=='DJ V'||
     relationResolved.worldChoice?.approach!=='loyal'){
    throw new Error('V4.97 NPC relation choice resolve failed '+JSON.stringify(relationResolved));
  }

  await page.waitForFunction(()=>!!window.TGGNPCFavors&&!!window.TGGV498,{timeout:15000});
  const favorReady=await page.evaluate(()=>{
    const availability=window.TGGNPCFavors.availability('DJ V');
    const run=window.TGGV498.run();
    const dock=document.getElementById('v498FavorDock');
    return {availability,run,dockVisible:!!dock&&!dock.hidden};
  });
  if(favorReady.run?.ok!==true||!favorReady.availability?.ready||!favorReady.dockVisible||
     favorReady.availability?.beat!=='park-cypher'){
    throw new Error('V4.98 NPC favor readiness failed '+JSON.stringify(favorReady));
  }
  await clickRuntimeControl('#v498FavorList [data-v498-favor="DJ V"]','V4.98 DJ V favor');
  await page.waitForTimeout(120);
  const favorResult=await page.evaluate(()=>({
    favor:window.TGGNPCFavors.snapshot(),
    world:window.TGGWorldDepth?.getStatus?.()||{},
    nav:window.TGGWorldDepth?.beatNavigation?.()||null
  }));
  if(favorResult.favor?.lastFavor?.name!=='DJ V'||
     favorResult.favor?.lastFavor?.beat!=='park-cypher'||
     favorResult.world?.activeBeat?.id!=='park-cypher'||
     favorResult.world?.activeBeat?.source!=='npc-favor'||
     !favorResult.nav||!(favorResult.nav.meters>=0)){
    throw new Error('V4.98 NPC favor routing failed '+JSON.stringify(favorResult));
  }

  await page.waitForFunction(()=>!!window.TGGContactConsequences&&!!window.TGGV499,{timeout:15000});
  const obligationOpen=await page.evaluate(()=>({
    run:window.TGGV499.run(),
    snap:window.TGGContactConsequences.snapshot()
  }));
  const djObligation=obligationOpen.snap?.active?.find(x=>x.name==='DJ V'&&x.beat==='park-cypher');
  if(obligationOpen.run?.ok!==true||!djObligation||obligationOpen.snap?.contacts?.['DJ V']?.debt<1){
    throw new Error('V4.99 NPC obligation open failed '+JSON.stringify(obligationOpen));
  }
  const favorPhysicalRoute=await page.evaluate(()=>{
    const start={...window.TGGGame.getState()};
    const nav=window.TGGWorldDepth?.beatNavigation?.();
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    return {start,routed,arrived:window.TGGWorldDepth?.beatNavigation?.()||null};
  });
  if(!favorPhysicalRoute.routed||favorPhysicalRoute.arrived?.arrived!==true){
    throw new Error('V4.99 favor physical route failed '+JSON.stringify(favorPhysicalRoute));
  }
  await page.waitForTimeout(180);
  const favorInteract=await inspectInteractControl();
  if(!favorInteract.exists||favorInteract.disabled||!favorInteract.worldBeatReady||!/^DO\s+/i.test(favorInteract.text)){
    throw new Error('V4.99 favor INTERACT unavailable '+JSON.stringify(favorInteract));
  }
  await page.evaluate(()=>{
    const el=document.getElementById('interact3dBtn');
    if(!el||el.disabled)throw new Error('V4.99 favor interact runtime unavailable');
    el.click();
  });
  await page.waitForTimeout(160);
  const obligationResolved=await page.evaluate(start=>{
    const contact=window.TGGContactConsequences.snapshot();
    const relation=window.TGGNPCRelations.relationship('DJ V');
    const world=window.TGGWorldDepth?.getStatus?.()||{};
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {contact,relation,world,restored,current:{...window.TGGGame.getState()}};
  },favorPhysicalRoute.start);
  if(obligationResolved.contact?.lastOutcome?.type!=='favor-complete'||
     obligationResolved.contact?.lastOutcome?.name!=='DJ V'||
     obligationResolved.contact?.contacts?.['DJ V']?.debt!==0||
     obligationResolved.contact?.contacts?.['DJ V']?.completed<1||
     !(obligationResolved.relation?.relation?.affinity>relationResolved.after.relation.affinity)||
     obligationResolved.world?.activeBeat||
     !obligationResolved.restored||
     Math.hypot(obligationResolved.current.x-favorPhysicalRoute.start.x,obligationResolved.current.y-favorPhysicalRoute.start.y)>.05){
    throw new Error('V4.99 favor outcome failed '+JSON.stringify(obligationResolved));
  }

  await page.waitForFunction(()=>!!window.TGGCareerContracts&&!!window.TGGV500,{timeout:15000});
  const contractReady=await page.evaluate(()=>({
    run:window.TGGV500.run(),
    recommendation:window.TGGCareerContracts.recommendContract(),
    button:(()=>{const b=document.getElementById('v500ContractStart');return b?{disabled:!!b.disabled,text:String(b.textContent||'').trim()}:null})()
  }));
  if(contractReady.run?.ok!==true||
     contractReady.recommendation?.id!=='dj-showcase'||
     contractReady.recommendation?.sponsor!=='DJ V'||
     contractReady.button?.disabled||
     contractReady.button?.text!=='START CONTRACT'){
    throw new Error('V5.00 career contract recommendation failed '+JSON.stringify(contractReady));
  }
  const contractInterruption=await page.evaluate(()=>{
    const calls=window.TGGIncomingCalls;
    let cleared=0,guard=0;
    while(calls?.snapshot?.().current&&guard++<10){
      calls.declineCurrent();
      cleared++;
    }
    calls?.clearMissed?.();
    const overlay=document.getElementById('v502IncomingCall');
    const button=document.getElementById('v500ContractStart');
    return {
      cleared,
      overlayHidden:!overlay||overlay.hidden,
      button:button?{disabled:!!button.disabled,text:String(button.textContent||'').trim()}:null
    };
  });
  if(contractInterruption.overlayHidden!==true||
     contractInterruption.button?.disabled||
     contractInterruption.button?.text!=='START CONTRACT'){
    throw new Error('V5.00 incoming-call interruption did not clear '+JSON.stringify(contractInterruption));
  }
  await clickRuntimeControl('#v500ContractStart','V5.00 start contract');
  await page.waitForTimeout(120);
  const contractStarted=await page.evaluate(()=>({
    contract:window.TGGCareerContracts.snapshot(),
    world:window.TGGWorldDepth?.getStatus?.()||{},
    nav:window.TGGWorldDepth?.beatNavigation?.()||null
  }));
  if(contractStarted.contract?.active?.id!=='dj-showcase'||
     contractStarted.contract?.active?.sponsor!=='DJ V'||
     contractStarted.world?.activeBeat?.source!=='career-contract'||
     contractStarted.world?.activeBeat?.npcName!=='DJ V'||
     contractStarted.world?.activeBeat?.id!=='park-cypher'||
     !contractStarted.nav||!(contractStarted.nav.meters>=0)){
    throw new Error('V5.00 career contract start failed '+JSON.stringify(contractStarted));
  }

  const contractPhysicalRoute=await page.evaluate(()=>{
    const start={...window.TGGGame.getState()};
    const nav=window.TGGWorldDepth?.beatNavigation?.();
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    return {start,routed,arrived:window.TGGWorldDepth?.beatNavigation?.()||null};
  });
  if(!contractPhysicalRoute.routed||contractPhysicalRoute.arrived?.arrived!==true){
    throw new Error('V5.00 contract physical route failed '+JSON.stringify(contractPhysicalRoute));
  }
  await page.waitForTimeout(180);
  const contractInteract=await inspectInteractControl();
  if(!contractInteract.exists||contractInteract.disabled||!contractInteract.worldBeatReady||!/^DO\s+/i.test(contractInteract.text)){
    throw new Error('V5.00 contract INTERACT unavailable '+JSON.stringify(contractInteract));
  }
  await page.evaluate(()=>{
    const el=document.getElementById('interact3dBtn');
    if(!el||el.disabled)throw new Error('V5.00 contract interact runtime unavailable');
    el.click();
  });
  await page.waitForTimeout(160);
  const contractResolved=await page.evaluate(start=>{
    const contract=window.TGGCareerContracts.snapshot();
    const relation=window.TGGNPCRelations.relationship('DJ V');
    const world=window.TGGWorldDepth?.getStatus?.()||{};
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {contract,relation,world,restored,current:{...window.TGGGame.getState()}};
  },contractPhysicalRoute.start);
  const completedContract=[...(contractResolved.contract?.history||[])].reverse().find(x=>x?.type==='complete'&&x?.id==='dj-showcase');
  if(contractResolved.contract?.active||
     contractResolved.contract?.completed<1||
     !completedContract||
     !(contractResolved.relation?.relation?.affinity>obligationResolved.relation.relation.affinity)||
     contractResolved.world?.activeBeat||
     !contractResolved.restored||
     Math.hypot(contractResolved.current.x-contractPhysicalRoute.start.x,contractResolved.current.y-contractPhysicalRoute.start.y)>.05){
    throw new Error('V5.00 career contract outcome failed '+JSON.stringify(contractResolved));
  }

  await page.waitForFunction(()=>!!window.TGGPhone&&!!window.TGGV501,{timeout:15000});
  const phoneRun=await page.evaluate(()=>window.TGGV501.run());
  if(phoneRun?.ok!==true)throw new Error('V5.01 phone runtime failed '+JSON.stringify(phoneRun));
  await clearIncomingCallOverlay('V5.01 phone open');
  await clickRuntimeControl('#v501PhoneBtn','V5.01 phone open');
  await page.waitForTimeout(80);
  const phoneState=await page.evaluate(()=>({
    snap:window.TGGPhone.snapshot(),
    hidden:document.getElementById('v501Phone')?.hidden,
    cards:document.querySelectorAll('#v501Contacts .v501-contact').length,
    dj:(()=>{const d=window.TGGPhone.contactData('DJ V');return d})()
  }));
  if(phoneState.hidden!==false||
     phoneState.cards!==4||
     phoneState.snap?.open!==true||
     !(phoneState.dj?.affinity>=contractResolved.relation.relation.affinity)){
    throw new Error('V5.01 phone UI failed '+JSON.stringify(phoneState));
  }
  await clickRuntimeControl('#v501PhoneClose','V5.01 phone close');
  const phoneClosed=await page.evaluate(()=>({snap:window.TGGPhone.snapshot(),hidden:document.getElementById('v501Phone')?.hidden}));
  if(phoneClosed.hidden!==true||phoneClosed.snap?.open!==false){
    throw new Error('V5.01 phone close failed '+JSON.stringify(phoneClosed));
  }

  await page.waitForFunction(()=>!!window.TGGIncomingCalls&&!!window.TGGV502,{timeout:15000});
  const incomingOpen=await page.evaluate(()=>{
    let guard=0;
    while(window.TGGIncomingCalls.snapshot().current&&guard++<10)window.TGGIncomingCalls.declineCurrent();
    window.TGGIncomingCalls.clearMissed();
    const before=window.TGGNPCRelations.relationship('Kane');
    const run=window.TGGV502.run();
    const queued=window.TGGIncomingCalls.queueCall('Kane','studio check-in','relationship',{});
    const snap=window.TGGIncomingCalls.snapshot();
    const root=document.getElementById('v502IncomingCall');
    return {before,run,queued,snap,visible:!!root&&!root.hidden,caller:document.getElementById('v502Caller')?.textContent||''};
  });
  if(incomingOpen.run?.ok!==true||
     incomingOpen.queued?.status!=='ringing'||
     incomingOpen.snap?.current?.name!=='Kane'||
     incomingOpen.visible!==true||
     incomingOpen.caller!=='Kane'){
    throw new Error('V5.02 incoming call ring failed '+JSON.stringify(incomingOpen));
  }
  await clickRuntimeControl('#v502Accept','V5.02 incoming call accept');
  await page.waitForTimeout(100);
  const incomingAccepted=await page.evaluate(()=>({
    calls:window.TGGIncomingCalls.snapshot(),
    choiceVisible:document.getElementById('v497NpcChoice')?.hidden===false,
    pending:window.TGGNPCRelations.snapshot()?.pending||null
  }));
  if(incomingAccepted.calls?.lastResult?.type!=='accepted'||
     incomingAccepted.calls?.lastResult?.call?.name!=='Kane'||
     incomingAccepted.calls?.lastResult?.routed?.kind!=='relationship'||
     incomingAccepted.calls?.lastResult?.routed?.success!==true||
     !incomingAccepted.choiceVisible||
     incomingAccepted.pending?.name!=='Kane'){
    throw new Error('V5.02 incoming call accept routing failed '+JSON.stringify(incomingAccepted));
  }
  await clickRuntimeControl('#v497NpcChoice [data-v497-choice="professional"]','V4.97 professional choice');
  await page.waitForTimeout(100);
  const incomingResolved=await page.evaluate(before=>({
    calls:window.TGGIncomingCalls.snapshot(),
    after:window.TGGNPCRelations.relationship('Kane'),
    callHidden:document.getElementById('v502IncomingCall')?.hidden,
    choiceHidden:document.getElementById('v497NpcChoice')?.hidden
  }),incomingOpen.before);
  if(incomingResolved.calls?.accepted<1||
     incomingResolved.callHidden!==true||
     incomingResolved.choiceHidden!==true||
     !(incomingResolved.after?.relation?.affinity>incomingOpen.before?.relation?.affinity)){
    throw new Error('V5.02 incoming call conversation failed '+JSON.stringify(incomingResolved));
  }

  await page.waitForFunction(()=>!!window.TGGMessages&&!!window.TGGV503,{timeout:15000});
  const messageQueued=await page.evaluate(()=>{
    const run=window.TGGV503.run();
    const before=window.TGGMessages.snapshot();
    const sent=window.TGGMessages.sendMessage('M','Meet me downtown. We need to talk about the next move.','career',{source:'browser-smoke'});
    const after=window.TGGMessages.snapshot();
    return {run,before,sent,after};
  });
  if(messageQueued.run?.ok!==true||
     messageQueued.sent?.status!=='delivered'||
     !(messageQueued.after?.unread?.M>messageQueued.before?.unread?.M)){
    throw new Error('V5.03 system message delivery failed '+JSON.stringify(messageQueued));
  }
  await clickRuntimeControl('#v501PhoneBtn','V5.01 phone open');
  await page.waitForTimeout(80);
  const messageAction=page.locator('#v501Contacts [data-v501-message="M"]');
  if(await messageAction.count()!==1)throw new Error('V5.03 MESSAGE action missing from TGG Phone');
  await clickRuntimeControl('#v501Contacts [data-v501-message="M"]','V5.03 M message action');
  await page.waitForTimeout(80);
  const threadOpen=await page.evaluate(()=>({
    snap:window.TGGMessages.snapshot(),
    hidden:document.getElementById('v503Messages')?.hidden,
    title:document.getElementById('v503Title')?.textContent||'',
    bubbles:document.querySelectorAll('#v503Conversation .v503-msg').length
  }));
  if(threadOpen.hidden!==false||
     threadOpen.snap?.active!=='M'||
     threadOpen.snap?.unread?.M!==0||
     !/^M\s+•\s+MESSAGES/.test(threadOpen.title)||
     threadOpen.bubbles<1){
    throw new Error('V5.03 thread open failed '+JSON.stringify(threadOpen));
  }
  await clickRuntimeControl('#v503Messages [data-v503-reply="LOCKED IN"]','V5.03 locked-in reply');
  await page.waitForTimeout(80);
  const messageReply=await page.evaluate(()=>{
    const snap=window.TGGMessages.snapshot();
    const thread=snap.threads?.M||[];
    return {snap,last:thread[thread.length-1]||null};
  });
  if(messageReply.last?.direction!=='out'||messageReply.last?.text!=='LOCKED IN'){
    throw new Error('V5.03 quick reply persistence failed '+JSON.stringify(messageReply));
  }
  await clickRuntimeControl('#v503Close','V5.03 messages close');
  const messagesClosed=await page.evaluate(()=>({snap:window.TGGMessages.snapshot(),hidden:document.getElementById('v503Messages')?.hidden}));
  if(messagesClosed.hidden!==true||messagesClosed.snap?.active!==null){
    throw new Error('V5.03 messages close failed '+JSON.stringify(messagesClosed));
  }

  await page.waitForFunction(()=>!!window.TGGMeetups&&!!window.TGGV504,{timeout:15000});
  const meetupCreated=await page.evaluate(()=>{
    const run=window.TGGV504.run();
    const before=window.TGGNPCRelations.relationship('Kane');
    const message=window.TGGMessages.sendMessage('Kane','Meet me at the studio. I sent the location.','location',{target:{x:24,y:37,radius:7,color:'#ff8a3d'}});
    const meetup=window.TGGMeetups.snapshot();
    const nav=window.TGGNavigation?.getTarget?.()||null;
    return {run,before,message,meetup,nav};
  });
  if(meetupCreated.run?.ok!==true||
     meetupCreated.message?.status!=='delivered'||
     meetupCreated.meetup?.active?.name!=='Kane'||
     meetupCreated.meetup?.navigation?.arrived!==false||
     meetupCreated.nav?.meetup!==true||
     !/MEETUP/i.test(String(meetupCreated.nav?.label||''))){
    throw new Error('V5.04 location meetup creation failed '+JSON.stringify(meetupCreated));
  }
  const meetupRoute=await page.evaluate(()=>{
    const start={...window.TGGGame.getState()};
    const nav=window.TGGMeetups.navigationTarget();
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    return {start,routed,arrived:window.TGGMeetups.navigationTarget()};
  });
  if(!meetupRoute.routed||meetupRoute.arrived?.arrived!==true){
    throw new Error('V5.04 physical meetup route failed '+JSON.stringify(meetupRoute));
  }
  await page.waitForTimeout(160);
  const meetupInteract=await inspectInteractControl();
  if(!meetupInteract.exists||meetupInteract.disabled||!meetupInteract.meetupReady||!/^MEET\s+KANE/i.test(meetupInteract.text)){
    throw new Error('V5.04 meetup INTERACT unavailable '+JSON.stringify(meetupInteract));
  }
  await page.evaluate(()=>document.getElementById('interact3dBtn')?.click());
  await page.waitForTimeout(120);
  const meetupResolved=await page.evaluate(start=>{
    const meetup=window.TGGMeetups.snapshot();
    const relation=window.TGGNPCRelations.relationship('Kane');
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {meetup,relation,restored,current:{...window.TGGGame.getState()}};
  },meetupRoute.start);
  if(meetupResolved.meetup?.active||
     meetupResolved.meetup?.lastCompleted?.name!=='Kane'||
     meetupResolved.meetup?.completed<1||
     !(meetupResolved.relation?.relation?.affinity>meetupCreated.before?.relation?.affinity)||
     !meetupResolved.restored||
     Math.hypot(meetupResolved.current.x-meetupRoute.start.x,meetupResolved.current.y-meetupRoute.start.y)>.05){
    throw new Error('V5.04 meetup completion failed '+JSON.stringify(meetupResolved));
  }

  await page.waitForFunction(()=>!!window.TGGCallSessions&&!!window.TGGV505,{timeout:15000});
  const callSessionQueued=await page.evaluate(()=>{
    let guard=0;
    while(window.TGGIncomingCalls.snapshot().current&&guard++<10)window.TGGIncomingCalls.declineCurrent();
    window.TGGIncomingCalls.clearMissed();
    const run=window.TGGV505.run();
    const queued=window.TGGIncomingCalls.queueCall('M','manager check-in','relationship',{});
    return {run,queued,calls:window.TGGIncomingCalls.snapshot()};
  });
  if(callSessionQueued.run?.ok!==true||
     callSessionQueued.queued?.status!=='ringing'||
     callSessionQueued.calls?.current?.name!=='M'){
    throw new Error('V5.05 call session queue failed '+JSON.stringify(callSessionQueued));
  }
  await clickRuntimeControl('#v502Accept','V5.02 incoming call accept');
  await page.waitForTimeout(100);
  const callSessionActive=await page.evaluate(()=>({
    session:window.TGGCallSessions.snapshot(),
    hudHidden:document.getElementById('v505CallSession')?.hidden,
    pending:window.TGGNPCRelations.snapshot()?.pending||null
  }));
  if(callSessionActive.session?.active?.name!=='M'||
     callSessionActive.hudHidden!==false||
     callSessionActive.pending?.name!=='M'){
    throw new Error('V5.05 active call HUD failed '+JSON.stringify(callSessionActive));
  }
  await clickRuntimeControl('#v505Mute','V5.05 mute');
  await clickRuntimeControl('#v505Speaker','V5.05 speaker');
  const callControls=await page.evaluate(()=>window.TGGCallSessions.snapshot());
  if(callControls.active?.muted!==true||callControls.active?.speaker!==true){
    throw new Error('V5.05 call controls failed '+JSON.stringify(callControls));
  }
  await clickRuntimeControl('#v497NpcChoice [data-v497-choice="professional"]','V4.97 professional choice');
  await page.waitForTimeout(80);
  await clickRuntimeControl('#v505End','V5.05 call end');
  await page.waitForTimeout(80);
  const callSessionEnded=await page.evaluate(()=>{
    const session=window.TGGCallSessions.snapshot();
    const messages=window.TGGMessages.snapshot();
    const thread=messages.threads?.M||[];
    const follow=[...thread].reverse().find(x=>x?.kind==='call-follow-up')||null;
    return {session,follow,hudHidden:document.getElementById('v505CallSession')?.hidden};
  });
  if(callSessionEnded.session?.active||
     callSessionEnded.session?.lastEnded?.name!=='M'||
     callSessionEnded.session?.completed<1||
     callSessionEnded.hudHidden!==true||
     callSessionEnded.follow?.direction!=='in'){
    throw new Error('V5.05 call end/follow-up failed '+JSON.stringify(callSessionEnded));
  }

  await page.waitForFunction(()=>!!window.TGGStreetEncounters&&!!window.TGGV506,{timeout:15000});
  const encounterPrep=await page.evaluate(()=>{
    let guard=0;
    while(window.TGGIncomingCalls?.snapshot?.().current&&guard++<10)window.TGGIncomingCalls.declineCurrent();
    window.TGGIncomingCalls?.clearMissed?.();
    window.TGGMeetups?.cancelMeetup?.('browser-smoke-prep');
    window.TGGNPCRelations?.closeChoice?.();
    const stepAxis=(axis,target)=>{
      let n=0;
      while(n++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    let beatCleanup=null;
    const beatNav=window.TGGWorldDepth?.beatNavigation?.();
    if(beatNav){
      const routed=stepAxis('y',50)&&stepAxis('x',beatNav.x)&&stepAxis('y',beatNav.y);
      const completed=routed?window.TGGWorldDepth?.completeBeat?.():null;
      beatCleanup={routed,completed,remaining:window.TGGWorldDepth?.getStatus?.().activeBeat||null};
    }
    const run=window.TGGV506.run();
    const before=window.TGGNPCRelations.relationship('Rico Flame');
    const spawned=window.TGGStreetEncounters.spawnEncounter('Rico Flame',{source:'browser-smoke',force:true});
    const nav=window.TGGStreetEncounters.navigationTarget();
    const cityNav=window.TGGNavigation?.getTarget?.()||null;
    return {run,before,spawned,nav,cityNav,beatCleanup};
  });
  if(encounterPrep.run?.ok!==true||
     encounterPrep.spawned?.status!=='routed'||
     encounterPrep.nav?.name!=='Rico Flame'||
     !(encounterPrep.nav?.meters>=0)||
     encounterPrep.cityNav?.encounter!==true||
     !/STREET/i.test(String(encounterPrep.cityNav?.label||''))||
     encounterPrep.beatCleanup?.remaining){
    throw new Error('V5.06 street encounter spawn/navigation failed '+JSON.stringify(encounterPrep));
  }

  const encounterRoute=await page.evaluate(()=>{
    const start={...window.TGGGame.getState()};
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    let routed=true,nav=null;
    for(let pass=0;pass<8;pass++){
      nav=window.TGGStreetEncounters.navigationTarget();
      if(!nav||nav.arrived)break;
      routed=routed&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
      if(!routed)break;
    }
    nav=window.TGGStreetEncounters.navigationTarget();
    return {start,routed,arrived:nav,state:{...window.TGGGame.getState()}};
  });
  if(!encounterRoute.routed||encounterRoute.arrived?.arrived!==true){
    throw new Error('V5.06 physical street encounter route failed '+JSON.stringify(encounterRoute));
  }
  await page.waitForTimeout(160);
  const encounterInteract=await inspectInteractControl();
  if(!encounterInteract.exists||encounterInteract.disabled||!encounterInteract.encounterReady||
     !/^TALK TO RICO FLAME\s+•\s+STREET/i.test(encounterInteract.text)){
    throw new Error('V5.06 street encounter INTERACT unavailable '+JSON.stringify(encounterInteract));
  }
  await clickRuntimeControl('#interact3dBtn','V5.06 street encounter interact');
  await page.waitForTimeout(100);
  const encounterConversation=await page.evaluate(()=>({
    encounter:window.TGGStreetEncounters.snapshot(),
    pending:window.TGGNPCRelations.snapshot()?.pending||null,
    choiceHidden:document.getElementById('v497NpcChoice')?.hidden
  }));
  if(encounterConversation.encounter?.active?.status!=='conversation'||
     encounterConversation.pending?.name!=='Rico Flame'||
     encounterConversation.choiceHidden!==false){
    throw new Error('V5.06 street encounter conversation failed '+JSON.stringify(encounterConversation));
  }
  await clickRuntimeControl('#v497NpcChoice [data-v497-choice="street"]','V5.06 Rico street choice');
  await page.waitForTimeout(120);
  const encounterResolved=await page.evaluate(start=>{
    const snap=window.TGGStreetEncounters.snapshot();
    const relation=window.TGGNPCRelations.relationship('Rico Flame');
    const meetup=window.TGGMeetups.snapshot();
    const messages=window.TGGMessages.snapshot();
    const thread=messages.threads?.['Rico Flame']||[];
    const handoffMessage=[...thread].reverse().find(x=>x?.kind==='street-handoff')||null;
    const cleanup=null;
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {snap,relation,meetup,handoffMessage,cleanup,restored,current:{...window.TGGGame.getState()}};
  },encounterRoute.start);
  if(encounterResolved.snap?.active||
     encounterResolved.snap?.lastCompleted?.name!=='Rico Flame'||
     encounterResolved.snap?.lastCompleted?.choice!=='street'||
     encounterResolved.snap?.lastCompleted?.handoff?.kind!=='meetup'||
     encounterResolved.snap?.lastCompleted?.handoff?.success!==true||
     encounterResolved.meetup?.active?.name!=='Rico Flame'||
     encounterResolved.meetup?.active?.source!=='street-encounter-handoff'||
     encounterResolved.handoffMessage?.direction!=='in'||
     !(encounterResolved.relation?.relation?.affinity>encounterPrep.before?.relation?.affinity)||
     !encounterResolved.restored||
     Math.hypot(encounterResolved.current.x-encounterRoute.start.x,encounterResolved.current.y-encounterRoute.start.y)>.05){
    throw new Error('V5.06 street encounter handoff failed '+JSON.stringify(encounterResolved));
  }

  await page.waitForFunction(()=>!!window.TGGStreetMissions&&!!window.TGGV507,{timeout:15000});
  const streetMissionPrep=await page.evaluate(()=>{
    const run=window.TGGV507.run();
    const start={...window.TGGGame.getState()};
    const beforeRelation=window.TGGNPCRelations.relationship('Rico Flame');
    const beforeGame={...window.TGGGame.getState()};
    const meetup=window.TGGMeetups.snapshot();
    const nav=window.TGGMeetups.navigationTarget();
    return {run,start,beforeRelation,beforeGame,meetup,nav};
  });
  if(streetMissionPrep.run?.ok!==true||
     streetMissionPrep.meetup?.active?.name!=='Rico Flame'||
     streetMissionPrep.meetup?.active?.source!=='street-encounter-handoff'||
     !streetMissionPrep.nav){
    throw new Error('V5.07 mission launch meetup missing '+JSON.stringify(streetMissionPrep));
  }

  const streetMeetupRoute=await page.evaluate(()=>{
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const nav=window.TGGMeetups.navigationTarget();
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    return {routed,nav:window.TGGMeetups.navigationTarget(),state:{...window.TGGGame.getState()}};
  });
  if(!streetMeetupRoute.routed||streetMeetupRoute.nav?.arrived!==true){
    throw new Error('V5.07 follow-up meetup route failed '+JSON.stringify(streetMeetupRoute));
  }
  await page.waitForTimeout(140);
  const streetMeetupInteract=await inspectInteractControl();
  if(!streetMeetupInteract.exists||streetMeetupInteract.disabled||!streetMeetupInteract.meetupReady||!/^MEET\s+RICO FLAME/i.test(streetMeetupInteract.text)){
    throw new Error('V5.07 follow-up meetup INTERACT unavailable '+JSON.stringify(streetMeetupInteract));
  }
  await clickRuntimeControl('#interact3dBtn','V5.07 follow-up meetup interact');
  await page.waitForTimeout(120);

  const streetMissionStarted=await page.evaluate(()=>({
    mission:window.TGGStreetMissions.snapshot(),
    nav:window.TGGNavigation?.getTarget?.()||null,
    relation:window.TGGNPCRelations.relationship('Rico Flame'),
    meetup:window.TGGMeetups.snapshot(),
    messages:window.TGGMessages.snapshot()
  }));
  if(streetMissionStarted.meetup?.active||
     streetMissionStarted.mission?.active?.name!=='Rico Flame'||
     streetMissionStarted.mission?.active?.title!=='RICO STREET PUSH'||
     streetMissionStarted.mission?.active?.stageIndex!==0||
     streetMissionStarted.nav?.streetMission!==true||
     !/MISSION/i.test(String(streetMissionStarted.nav?.label||''))||
     !(streetMissionStarted.relation?.relation?.affinity>streetMissionPrep.beforeRelation?.relation?.affinity)){
    throw new Error('V5.07 mission auto-start failed '+JSON.stringify(streetMissionStarted));
  }

  const routeStreetMissionStage=async(label)=>{
    const routed=await page.evaluate(()=>{
      const stepAxis=(axis,target)=>{
        let guard=0;
        while(guard++<220){
          const s=window.TGGGame.getState();
          const current=Number(s[axis])||0;
          const delta=Number(target)-current;
          if(Math.abs(delta)<=0.01)return true;
          const step=Math.max(-1,Math.min(1,delta));
          if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
        }
        return false;
      };
      const nav=window.TGGStreetMissions.navigationTarget();
      const ok=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
      return {ok,nav:window.TGGStreetMissions.navigationTarget(),state:{...window.TGGGame.getState()}};
    });
    if(!routed.ok||routed.nav?.arrived!==true)throw new Error(label+' physical route failed '+JSON.stringify(routed));
    await page.waitForTimeout(140);
    const interact=await inspectInteractControl();
    if(!interact.exists||interact.disabled||!interact.streetMissionReady||!/^DO\s+/i.test(interact.text)){
      throw new Error(label+' INTERACT unavailable '+JSON.stringify(interact));
    }
    await clickRuntimeControl('#interact3dBtn',label+' interact');
    await page.waitForTimeout(120);
    return routed;
  };

  const streetStageOneRoute=await routeStreetMissionStage('V5.07 stage 1');
  const streetStageOne=await page.evaluate(()=>({
    mission:window.TGGStreetMissions.snapshot(),
    nav:window.TGGNavigation?.getTarget?.()||null
  }));
  if(streetStageOne.mission?.active?.stageIndex!==1||
     streetStageOne.mission?.navigation?.stageIndex!==1||
     streetStageOne.nav?.streetMission!==true){
    throw new Error('V5.07 stage 1 advancement failed '+JSON.stringify(streetStageOne));
  }

  const streetStageTwoRoute=await routeStreetMissionStage('V5.07 stage 2');
  const streetMissionResolved=await page.evaluate(start=>{
    const mission=window.TGGStreetMissions.snapshot();
    const relation=window.TGGNPCRelations.relationship('Rico Flame');
    const messages=window.TGGMessages.snapshot();
    const thread=messages.threads?.['Rico Flame']||[];
    const completionMessage=[...thread].reverse().find(x=>x?.kind==='street-mission-complete')||null;
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {
      mission,relation,completionMessage,restored,current:{...window.TGGGame.getState()},
      meetup:window.TGGMeetups.snapshot(),encounter:window.TGGStreetEncounters.snapshot()
    };
  },streetMissionPrep.start);
  if(streetMissionResolved.mission?.active||
     streetMissionResolved.mission?.lastCompleted?.name!=='Rico Flame'||
     streetMissionResolved.mission?.lastCompleted?.title!=='RICO STREET PUSH'||
     streetMissionResolved.mission?.lastCompleted?.reward?.cash!==210||
     streetMissionResolved.mission?.lastCompleted?.reward?.xp!==54||
     streetMissionResolved.mission?.completed<1||
     streetMissionResolved.completionMessage?.direction!=='in'||
     !(streetMissionResolved.relation?.relation?.affinity>streetMissionStarted.relation?.relation?.affinity)||
     streetMissionResolved.meetup?.active||
     streetMissionResolved.encounter?.active||
     !streetMissionResolved.restored||
     Math.hypot(streetMissionResolved.current.x-streetMissionPrep.start.x,streetMissionResolved.current.y-streetMissionPrep.start.y)>.05){
    throw new Error('V5.07 mission completion failed '+JSON.stringify(streetMissionResolved));
  }

  await page.waitForFunction(()=>!!window.TGGMissionAftermath&&!!window.TGGV508,{timeout:15000});
  const aftermathReady=await page.evaluate(()=>({
    run:window.TGGV508.run(),
    aftermath:window.TGGMissionAftermath.snapshot(),
    world:window.TGGWorldDepth.getStatus(),
    beat:window.TGGWorldDepth.beatNavigation(),
    nav:window.TGGNavigation?.getTarget?.()||null,
    messages:window.TGGMessages.snapshot(),
    start:{...window.TGGGame.getState()}
  }));
  const aftermathThread=aftermathReady.messages?.threads?.['Rico Flame']||[];
  const aftermathMessage=[...aftermathThread].reverse().find(x=>x?.kind==='mission-aftermath')||null;
  if(aftermathReady.run?.ok!==true||
     aftermathReady.aftermath?.lastAftermath?.name!=='Rico Flame'||
     aftermathReady.aftermath?.lastAftermath?.district!=='MIXTAPE AVE'||
     aftermathReady.aftermath?.lastAftermath?.choice!=='street'||
     !(aftermathReady.aftermath?.lastAftermath?.repDelta>0)||
     !(aftermathReady.aftermath?.districtRep?.['MIXTAPE AVE']>0)||
     aftermathReady.aftermath?.lastAftermath?.followup?.id!=='brand-meeting'||
     aftermathReady.aftermath?.lastAftermath?.followup?.success!==true||
     aftermathReady.world?.activeBeat?.id!=='brand-meeting'||
     aftermathReady.beat?.beatId!=='brand-meeting'||
     aftermathReady.nav?.worldBeat!==true||
     aftermathMessage?.direction!=='in'){
    throw new Error('V5.08 mission aftermath creation failed '+JSON.stringify({aftermathReady,aftermathMessage}));
  }

  const aftermathRoute=await page.evaluate(()=>{
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const nav=window.TGGWorldDepth.beatNavigation();
    const routed=!!nav&&stepAxis('y',50)&&stepAxis('x',nav.x)&&stepAxis('y',nav.y);
    return {routed,nav:window.TGGWorldDepth.beatNavigation(),state:{...window.TGGGame.getState()}};
  });
  if(!aftermathRoute.routed||aftermathRoute.nav?.arrived!==true){
    throw new Error('V5.08 follow-up world route failed '+JSON.stringify(aftermathRoute));
  }
  await page.waitForTimeout(140);
  const aftermathInteract=await inspectInteractControl();
  if(!aftermathInteract.exists||aftermathInteract.disabled||!aftermathInteract.worldBeatReady||!/^DO\s+BRAND MEETING/i.test(aftermathInteract.text)){
    throw new Error('V5.08 follow-up INTERACT unavailable '+JSON.stringify(aftermathInteract));
  }
  await clickRuntimeControl('#interact3dBtn','V5.08 aftermath brand meeting interact');
  await page.waitForTimeout(120);

  const aftermathResolved=await page.evaluate(start=>{
    const world=window.TGGWorldDepth.getStatus();
    const aftermath=window.TGGMissionAftermath.snapshot();
    const completed=[...(world.history||[])].reverse().find(x=>x?.type==='complete'&&x?.id==='brand-meeting')||null;
    const stepAxis=(axis,target)=>{
      let guard=0;
      while(guard++<220){
        const s=window.TGGGame.getState();
        const current=Number(s[axis])||0;
        const delta=Number(target)-current;
        if(Math.abs(delta)<=0.01)return true;
        const step=Math.max(-1,Math.min(1,delta));
        if(!window.TGGGame.move(axis==='x'?step:0,axis==='y'?step:0))return false;
      }
      return false;
    };
    const restored=stepAxis('y',50)&&stepAxis('x',start.x)&&stepAxis('y',start.y);
    return {world,aftermath,completed,restored,current:{...window.TGGGame.getState()}};
  },aftermathReady.start);
  if(aftermathResolved.world?.activeBeat||
     aftermathResolved.completed?.source!=='street-mission-aftermath'||
     aftermathResolved.completed?.npcName!=='Rico Flame'||
     aftermathResolved.aftermath?.completed<1||
     aftermathResolved.aftermath?.contactStreaks?.['Rico Flame']<1||
     !aftermathResolved.restored||
     Math.hypot(aftermathResolved.current.x-aftermathReady.start.x,aftermathResolved.current.y-aftermathReady.start.y)>.05){
    throw new Error('V5.08 aftermath follow-up completion failed '+JSON.stringify(aftermathResolved));
  }

  await page.waitForFunction(()=>!!window.TGGDistrictReactions&&!!window.TGGV509,{timeout:15000});
  const districtReaction=await page.evaluate(()=>({
    run:window.TGGV509.run(),
    reaction:window.TGGDistrictReactions.snapshot(),
    relation:window.TGGNPCRelations.relationship('Rico Flame'),
    messages:window.TGGMessages.snapshot()
  }));
  const districtThread=districtReaction.messages?.threads?.['Rico Flame']||[];
  const districtMessage=[...districtThread].reverse().find(x=>x?.kind==='district-reaction')||null;
  if(districtReaction.run?.ok!==true||
     districtReaction.reaction?.lastReaction?.name!=='Rico Flame'||
     districtReaction.reaction?.lastReaction?.district!=='MIXTAPE AVE'||
     districtReaction.reaction?.lastReaction?.tier==='UNKNOWN'||
     !(districtReaction.reaction?.districts?.['MIXTAPE AVE']?.rep>0)||
     districtReaction.reaction?.completed<1||
     districtMessage?.direction!=='in'){
    throw new Error('V5.09 district reaction failed '+JSON.stringify({districtReaction,districtMessage}));
  }

  await clearIncomingCallOverlay('pre keyboard movement');
  await page.evaluate(()=>{
    window.TGGNPCRelations?.closeChoice?.();
    window.TGGGame?.show?.('game');
    const active=document.activeElement;
    active?.blur?.();
    document.body.tabIndex=-1;
    document.body.focus({preventScroll:true});
  });
  let moved=0;
  let moveKey='';
  for(const key of ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']){
    const before=await page.evaluate(()=>({...window.TGGGame.getState()}));
    await page.keyboard.down(key);
    try{
      await page.waitForFunction(prev=>{
        const s=window.TGGGame.getState();
        const walk=window.TGGGame.getWalkingState?.()||{};
        return Math.hypot(s.x-prev.x,s.y-prev.y)>.01||Math.hypot(Number(walk.inputX)||0,Number(walk.inputY)||0)>.05;
      },before,{timeout:1400});
    }catch{}
    await page.waitForTimeout(220);
    await page.keyboard.up(key);
    await page.waitForTimeout(140);
    const delta=await page.evaluate(prev=>{const s=window.TGGGame.getState();return Math.hypot(s.x-prev.x,s.y-prev.y)},before);
    if(delta>moved){moved=delta;moveKey=key}
    if(moved>0.01)break;
  }
  if(!(moved>0.01)){
    const diagnostics=await page.evaluate(()=>({
      state:window.TGGGame.getState(),
      walking:window.TGGGame.getWalkingState?.(),
      screen:window.TGGGame.getActiveScreen?.(),
      activeElement:{tag:document.activeElement?.tagName||null,id:document.activeElement?.id||null},
      incoming:window.TGGIncomingCalls?.snapshot?.().current||null,
      encounter:window.TGGStreetEncounters?.snapshot?.().active||null,
      meetup:window.TGGMeetups?.snapshot?.().active||null
    }));
    throw new Error('Player movement failed '+JSON.stringify(diagnostics));
  }

  await clearIncomingCallOverlay('pre vehicle entry');
  await clickRuntimeControl('#vehicleBtn','Vehicle entry');
  await page.waitForTimeout(300);
  if(!(await page.evaluate(()=>!!window.TGGGame.getState().inVehicle)))throw new Error('Vehicle entry failed');
  const handlingContract=await page.evaluate(()=>({
    camera:window.TGG3D?.getCameraMode?.(),
    drive:window.TGGGame?.getDriveTuning?.(),
    walk:window.TGGGame?.getWalkTuning?.(),
    positionValid:window.TGG3D?.canMovePercent?.(window.TGGGame.getState().x,window.TGGGame.getState().y,true)
  }));
  if(handlingContract.camera!=='chase'||handlingContract.positionValid!==true||
     !(handlingContract.drive?.highSpeedSteer<handlingContract.drive?.lowSpeedSteer)||
     !(handlingContract.drive?.throttleResponse>0)||!(handlingContract.drive?.collisionSlide>0)||
     !(handlingContract.walk?.sprintSpeed>handlingContract.walk?.walkSpeed)){
    throw new Error('Handling contract failed '+JSON.stringify(handlingContract));
  }
  let driven=0;
  let driveAttempt='';
  const apiAttempts=[
    {name:'api-forward',control:'forward'},
    {name:'api-reverse',control:'reverse'},
    {name:'api-right-forward',steer:'right',control:'forward'},
    {name:'api-left-forward',steer:'left',control:'forward'}
  ];
  for(const attempt of apiAttempts){
    const before=await page.evaluate(()=>window.TGGGame.getState());
    const accepted=await page.evaluate(a=>{
      if(a.steer)window.TGGGame.driveVehicle(a.steer);
      return window.TGGGame.driveVehicle(a.control);
    },attempt);
    if(!accepted)continue;
    await page.waitForTimeout(650);
    const delta=await page.evaluate(prev=>{const s=window.TGGGame.getState();return Math.hypot(s.x-prev.x,s.y-prev.y)},before);
    if(delta>driven){driven=delta;driveAttempt=attempt.name}
    if(driven>0.01)break;
  }
  if(!(driven>0.01)){
    const keyAttempts=[['ArrowUp'],['ArrowDown'],['ArrowRight','ArrowUp'],['ArrowLeft','ArrowUp']];
    for(const keys of keyAttempts){
      const before=await page.evaluate(()=>window.TGGGame.getState());
      for(const key of keys)await page.keyboard.down(key);
      await page.waitForTimeout(700);
      for(const key of [...keys].reverse())await page.keyboard.up(key);
      await page.waitForTimeout(220);
      const delta=await page.evaluate(prev=>{const s=window.TGGGame.getState();return Math.hypot(s.x-prev.x,s.y-prev.y)},before);
      if(delta>driven){driven=delta;driveAttempt='keys:'+keys.join('+')}
      if(driven>0.01)break;
    }
  }
  if(!(driven>0.01)){
    const diagnostics=await page.evaluate(()=>({state:window.TGGGame.getState(),driving:window.TGGGame.getDrivingState?.(),screen:window.TGGGame.getActiveScreen?.()}));
    throw new Error('Vehicle movement failed across public driving API and key paths '+JSON.stringify(diagnostics));
  }

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
  console.log(JSON.stringify({ok:true,title,moved,moveKey,driven,driveAttempt,camera:handlingContract.camera,layers:layerCheck.additive.length,continuity:continuity.length,missionOps:true,worldRouteMeters:gameplayMega.nav.meters,cityNavWorldBeat:gameplayMega.cityNav.worldBeat,worldTravelGuard:gameplayMega.guard.status,worldInteract:worldInteractionResult.completed?.id||true,npcChoice:relationResolved.snap.lastResolved.choice,npcAffinity:relationResolved.after.relation.affinity,npcFavor:favorResult.favor.lastFavor.beat,favorOutcome:obligationResolved.contact.lastOutcome.type,contactAffinity:obligationResolved.relation.relation.affinity,careerContract:contractStarted.contract.active.id,contractOutcome:completedContract.id,contractAffinity:contractResolved.relation.relation.affinity,phoneContacts:phoneState.cards,incomingCall:incomingAccepted.calls.lastResult.call.name,messageThread:messageReply.last.name,messageReply:messageReply.last.text,meetupContact:meetupResolved.meetup.lastCompleted.name,callSession:callSessionEnded.session.lastEnded.name,districtReaction:districtReaction.reaction.lastReaction.tier}));
}finally{
  await browser.close();
}
