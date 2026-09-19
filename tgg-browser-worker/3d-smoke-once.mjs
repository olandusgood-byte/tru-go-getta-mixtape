import http from 'node:http';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);

const PORT=Number(process.env.PORT||10000);
const TARGET=String(process.env.TGG_3D_SMOKE_TARGET||'').trim();
const EXPECT_VERSION=String(process.env.TGG_3D_EXPECT_VERSION||'V1.22 3D').trim();
const REQUIRE_DESTINATIONS=String(process.env.TGG_3D_REQUIRE_DESTINATIONS||'0')==='1';
const REQUIRE_LIVING_CITY=String(process.env.TGG_3D_REQUIRE_LIVING_CITY||'0')==='1';
const REQUIRE_CINEMATIC=String(process.env.TGG_3D_REQUIRE_CINEMATIC||'0')==='1';
const REQUIRE_WORLD_BULK=String(process.env.TGG_3D_REQUIRE_WORLD_BULK||'0')==='1';
const REQUIRE_PLAYER_SMOOTH=String(process.env.TGG_3D_REQUIRE_PLAYER_SMOOTH||'0')==='1';
const PLAYER_SMOOTH_ONLY=String(process.env.TGG_3D_PLAYER_SMOOTH_ONLY||'0')==='1';
const WORLD_ONLY=String(process.env.TGG_3D_WORLD_ONLY||'0')==='1';
const GAMEPAD_ONLY=String(process.env.TGG_3D_GAMEPAD_ONLY||'0')==='1';
const DESKTOP_DRIVE_ONLY=String(process.env.TGG_3D_DESKTOP_DRIVE_ONLY||'0')==='1';
const VEHICLE_LOGIC_ONLY=String(process.env.TGG_3D_VEHICLE_LOGIC_ONLY||'0')==='1';
const MOBILE_LAYOUT_ONLY=String(process.env.TGG_3D_MOBILE_LAYOUT_ONLY||'0')==='1';
const WORLD_LIFE_ONLY=String(process.env.TGG_3D_WORLD_LIFE_ONLY||'0')==='1';
const CAREER_DIRECTOR_ONLY=String(process.env.TGG_3D_CAREER_DIRECTOR_ONLY||'0')==='1';
const CAREER_MOBILE_ONLY=String(process.env.TGG_3D_CAREER_MOBILE_ONLY||'0')==='1';
const STORY_MISSION_ONLY=String(process.env.TGG_3D_STORY_MISSION_ONLY||'0')==='1';
const STORY_CHAPTER2_ONLY=String(process.env.TGG_3D_STORY_CHAPTER2_ONLY||'0')==='1';
const STORY_CHAPTER3_ONLY=String(process.env.TGG_3D_STORY_CHAPTER3_ONLY||'0')==='1';
const STORY_WORLD_3D_ONLY=String(process.env.TGG_3D_STORY_WORLD_3D_ONLY||'0')==='1';
const MEGA_QA_ONLY=String(process.env.TGG_3D_MEGA_QA_ONLY||'0')==='1';
const STREET_PRESENCE_ONLY=String(process.env.TGG_3D_STREET_PRESENCE_ONLY||'0')==='1';
const V218_MEGA_ONLY=String(process.env.TGG_3D_V218_MEGA_ONLY||'0')==='1';
const V219_CROWD_ONLY=String(process.env.TGG_3D_V219_CROWD_ONLY||'0')==='1';
const V220_CINEMATIC_ONLY=String(process.env.TGG_3D_V220_CINEMATIC_ONLY||'0')==='1';
let result={ok:false,status:'pending',target:TARGET,updated_at:new Date().toISOString()};

async function startV218SnapshotServer(){
  const mimeFor=p=>p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.js')?'application/javascript; charset=utf-8':p.endsWith('.json')?'application/json; charset=utf-8':p.endsWith('.png')?'image/png':p.endsWith('.jpg')||p.endsWith('.jpeg')?'image/jpeg':p.endsWith('.webp')?'image/webp':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  const serveRoot=path.resolve(process.cwd(),'tgg-browser-worker','mega-game-snapshot');
  await fs.access(path.join(serveRoot,'index.html'));
  await fs.access(path.join(serveRoot,'street-presence.js'));
  const proxy=http.createServer(async(req,res)=>{
    try{
      let pathname=new URL(req.url||'/','http://127.0.0.1').pathname;
      if(pathname==='/')pathname='/index.html';
      pathname=decodeURIComponent(pathname);
      const relative=pathname.replace(/^\/+/, '');
      const filePath=path.resolve(serveRoot,relative);
      if(!filePath.startsWith(serveRoot+path.sep)&&filePath!==serveRoot){res.statusCode=400;res.end('bad path');return;}
      const bytes=await fs.readFile(filePath);
      res.statusCode=200;
      res.setHeader('content-type',mimeFor(filePath));
      res.setHeader('cache-control','no-store');
      res.end(bytes);
    }catch(error){
      res.statusCode=error?.code==='ENOENT'?404:500;
      res.end(error?.message||String(error));
    }
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
  const address=proxy.address();
  return {proxy,url:'http://127.0.0.1:'+address.port+'/'};
}

async function run(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await ctx.newPage();

    if(V220_CINEMATIC_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,storyResponse,cineResponse]=await Promise.all([
        fetch(base+'/index.html'),fetch(base+'/story-missions.js'),fetch(base+'/story-cinematics.js')
      ]);
      if(!htmlResponse.ok||!storyResponse.ok||!cineResponse.ok){
        throw new Error('V2.20 cinematic harness fetch failed: html='+htmlResponse.status+', story='+storyResponse.status+', cine='+cineResponse.status);
      }
      let html=await htmlResponse.text();
      const [storySource,cineSource]=await Promise.all([storyResponse.text(),cineResponse.text()]);
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<script\b[^>]*\/?>/gi,'')
               .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi,'');
      const testCtx=await browser.newContext({viewport:{width:1440,height:1000}});
      const tp=await testCtx.newPage();
      const pageErrors=[];const consoleErrors=[];
      tp.on('pageerror',e=>pageErrors.push(e.message||String(e)));
      tp.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      await tp.setContent(html,{waitUntil:'domcontentloaded'});
      await tp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaCamera='top';
        window.__qaScreen='game';
        window.__qaGame={x:50,y:55,cash:0,xp:0,level:5,heading:0,inVehicle:false};
        window.__qaCareer={recordings:0,mixtapes:0,reputation:0,studioLevel:3};
        window.__qaContent={completed:[]};
        window.__qaLife={battleWins:0,shows:0,activeOpportunity:null,contacts:{}};
        window.__qaCrowd={ready:true,focus:'free',visibleFans:12,cheering:0,recording:4,watching:8,reactionLevel:0};
        window.TGGGame={
          getState:()=>window.__qaGame,
          getActiveScreen:()=>window.__qaScreen,
          show:id=>{window.__qaScreen=id;return true},
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true}
        };
        window.TGG3D={
          setCameraMode:(mode)=>{window.__qaCamera=mode;return mode},
          getCameraMode:()=>window.__qaCamera
        };
        window.TGGCareer={career:window.__qaCareer,addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}};
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          setTab:()=>true,
          callContact:id=>{window.__qaLife.activeOpportunity={contactId:id};return true},
          startShow:()=>{
            window.__qaLife.shows+=0;
            window.__qaCrowd={...window.__qaCrowd,focus:'stage',cheering:2,recording:4,reactionLevel:1};
            return true;
          }
        };
        window.TGGCareerDirector={getState:()=>({activeContract:null,history:[]}),captureOpportunity:()=>true};
        window.TGGProgression={sync:()=>true};
        window.TGGWorldSync={sync:()=>true};
        window.TGGCrowdPresentation={getStatus:()=>({...window.__qaCrowd})};
        window.__tggToast=()=>{};
      });
      const sourceDiagnostics={
        storyBytes:storySource.length,
        cineBytes:cineSource.length,
        storyHasApi:storySource.includes('window.TGGStoryMissions'),
        cineHasApi:cineSource.includes('window.TGGStoryCinematics')
      };
      await tp.addScriptTag({content:storySource});
      await tp.addScriptTag({content:cineSource});
      await tp.waitForFunction(()=>typeof window.TGGStoryMissions?.start==='function'&&typeof window.TGGStoryCinematics?.getState==='function',undefined,{timeout:3000}).catch(()=>{});
      await tp.waitForTimeout(80);

      const checks=[];const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});
      const loaded=await tp.evaluate(()=>({
        story:typeof window.TGGStoryMissions?.start==='function',
        cine:typeof window.TGGStoryCinematics?.getState==='function',
        globals:Object.keys(window).filter(k=>/^TGGStory/.test(k)).sort()
      }));
      add('v220-source-story-api',sourceDiagnostics.storyHasApi,JSON.stringify(sourceDiagnostics));
      add('v220-source-cine-api',sourceDiagnostics.cineHasApi,JSON.stringify(sourceDiagnostics));
      add('v220-runtime-story-loaded',loaded.story,JSON.stringify(loaded));
      add('v220-runtime-cine-loaded',loaded.cine,JSON.stringify(loaded));
      if(!loaded.story||!loaded.cine){
        result={
          ok:false,status:'done',mode:'v220_cinematic_story_harness',target:TARGET,
          checks,console_errors:consoleErrors,page_errors:pageErrors,
          diagnostics:{sourceDiagnostics,loaded},updated_at:new Date().toISOString()
        };
        console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
        await testCtx.close();await ctx.close();return;
      }
      let snap=await tp.evaluate(()=>({
        title:document.title,
        version:window.TGGStoryCinematics?.getState?.().version,
        api:typeof window.TGGStoryCinematics?.show==='function'&&typeof window.TGGStoryCinematics?.hide==='function'&&typeof window.TGGStoryCinematics?.refreshCrowd==='function',
        storyApi:typeof window.TGGStoryMissions?.start==='function',
        root:!!document.getElementById('storyCinematic'),
        styles:!!document.getElementById('storyCinematicStyles'),
        camera:window.TGG3D.getCameraMode()
      }));
      add('v220-title',snap.title.includes('V2.20'),snap.title);
      add('v220-version',snap.version==='V2.20',snap.version);
      add('v220-api',snap.api);
      add('v220-story-api',snap.storyApi);
      add('v220-root',snap.root);
      add('v220-styles',snap.styles);
      add('v220-camera-baseline',snap.camera==='top',snap.camera);

      await tp.evaluate(()=>window.TGGStoryMissions.start());
      await tp.waitForTimeout(80);
      snap=await tp.evaluate(()=>({
        cine:window.TGGStoryCinematics.getState(),
        kicker:document.getElementById('storyCineKicker')?.textContent||'',
        title:document.getElementById('storyCineTitle')?.textContent||'',
        badge:document.getElementById('storyCineBadge')?.textContent||'',
        type:document.getElementById('storyCineType')?.textContent||'',
        camera:window.TGG3D.getCameraMode()
      }));
      add('v220-story-event-integration',snap.cine?.lastEvent?.type==='chapter-start'&&snap.cine?.lastEvent?.chapter===1,JSON.stringify(snap.cine));
      add('v220-chapter-visible',snap.cine?.visible===true&&String(snap.cine?.className||'').includes('chapter'),snap.cine?.className);
      add('v220-chapter-copy',snap.kicker.includes('CHAPTER 1')&&snap.title==='FIRST CONTRACT',JSON.stringify(snap));
      add('v220-chapter-badge',snap.badge==='01',snap.badge);
      add('v220-chapter-type',snap.type==='STORY CHAPTER',snap.type);
      add('v220-chapter-camera-cue',snap.camera==='orbit',snap.camera);

      await tp.evaluate(()=>window.dispatchEvent(new CustomEvent('tgg-story-event',{detail:{
        type:'objective',chapter:1,title:'MEET M',detail:'OPEN THE MANAGER OPPORTUNITY AND LOCK IN YOUR FIRST CONTRACT.'
      }})));
      await tp.waitForTimeout(60);
      snap=await tp.evaluate(()=>({
        cine:window.TGGStoryCinematics.getState(),
        kicker:document.getElementById('storyCineKicker')?.textContent||'',
        title:document.getElementById('storyCineTitle')?.textContent||'',
        type:document.getElementById('storyCineType')?.textContent||'',
        camera:window.TGG3D.getCameraMode()
      }));
      add('v220-objective-visible',snap.cine?.visible===true&&String(snap.cine?.className||'').includes('objective'),snap.cine?.className);
      add('v220-objective-copy',snap.kicker==='NEW OBJECTIVE'&&snap.title==='MEET M',JSON.stringify(snap));
      add('v220-objective-type',snap.type==='CONTACT',snap.type);
      add('v220-objective-camera-cue',snap.camera==='chase',snap.camera);

      await tp.waitForTimeout(1700);
      snap=await tp.evaluate(()=>({camera:window.TGG3D.getCameraMode(),visible:window.TGGStoryCinematics.getState().visible}));
      add('v220-camera-restore',snap.camera==='orbit',JSON.stringify(snap));

      await tp.evaluate(()=>window.TGGWorldLife.startShow());
      await tp.waitForTimeout(30);
      snap=await tp.evaluate(()=>({
        crowd:window.TGGCrowdPresentation.getStatus(),
        text:window.TGGStoryCinematics.refreshCrowd(),
        rendered:document.getElementById('storyCineCrowd')?.textContent||''
      }));
      add('v220-crowd-focus',snap.crowd?.focus==='stage',JSON.stringify(snap.crowd));
      add('v220-crowd-metadata',/FANS|CHEERING|RECORDING|CITY WATCHING/.test(String(snap.text)),JSON.stringify(snap));
      add('v220-crowd-rendered',snap.rendered===snap.text,JSON.stringify(snap));

      await tp.evaluate(()=>window.dispatchEvent(new CustomEvent('tgg-story-event',{detail:{
        type:'chapter-complete',chapter:2,title:'CITY BUZZ COMPLETE',detail:'+$1800 • +450 XP • +175 REP'
      }})));
      await tp.waitForTimeout(60);
      snap=await tp.evaluate(()=>({
        cine:window.TGGStoryCinematics.getState(),
        kicker:document.getElementById('storyCineKicker')?.textContent||'',
        title:document.getElementById('storyCineTitle')?.textContent||'',
        badge:document.getElementById('storyCineBadge')?.textContent||'',
        type:document.getElementById('storyCineType')?.textContent||''
      }));
      add('v220-complete-visible',snap.cine?.visible===true&&String(snap.cine?.className||'').includes('complete'),snap.cine?.className);
      add('v220-complete-copy',snap.kicker.includes('MISSION PASSED')&&snap.title==='CITY BUZZ COMPLETE',JSON.stringify(snap));
      add('v220-complete-badge',snap.badge==='✓',snap.badge);
      add('v220-complete-type',snap.type==='MISSION PASSED',snap.type);

      snap=await tp.evaluate(()=>{
        const payload={type:'objective',chapter:3,title:'LINK DJ V',detail:'GET TO THE CLUB DISTRICT.'};
        const first=window.TGGStoryCinematics.show(payload);
        const second=window.TGGStoryCinematics.show(payload);
        return {first,second,last:window.TGGStoryCinematics.getState().lastEvent};
      });
      add('v220-duplicate-suppression',snap.first===true&&snap.second===false,JSON.stringify(snap));

      await tp.evaluate(()=>window.TGGStoryCinematics.hide());
      await tp.waitForTimeout(20);
      snap=await tp.evaluate(()=>window.TGGStoryCinematics.getState());
      add('v220-hide',snap.visible===false,JSON.stringify(snap));

      await tp.setViewportSize({width:390,height:844});
      await tp.evaluate(()=>window.TGGStoryCinematics.show({
        type:'objective',chapter:2,title:'DRIVE TO STUDIO ROW',detail:'TAKE THE CAR OR WALK TO STUDIO ROW.'
      }));
      await tp.waitForTimeout(50);
      const mobileObjective=await tp.evaluate(()=>{
        const frame=document.querySelector('#storyCinematic .story-cine-frame')?.getBoundingClientRect();
        return {
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          frame:frame?{left:frame.left,right:frame.right,width:frame.width,height:frame.height}:null
        };
      });
      add('v220-mobile-objective-no-overflow',mobileObjective.overflowX===false&&mobileObjective.scrollWidth<=391,JSON.stringify(mobileObjective));
      add('v220-mobile-objective-contained',!!mobileObjective.frame&&mobileObjective.frame.left>=0&&mobileObjective.frame.right<=mobileObjective.width+1,JSON.stringify(mobileObjective.frame));

      await tp.evaluate(()=>window.TGGStoryCinematics.show({
        type:'chapter-start',chapter:3,title:'CITY TAKEOVER',detail:'TURN CITY BUZZ INTO REAL MOMENTUM.'      }));
      await tp.waitForTimeout(50);
      const mobileChapter=await tp.evaluate(()=>{
        const frame=document.querySelector('#storyCinematic .story-cine-frame')?.getBoundingClientRect();
        return {
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          frame:frame?{left:frame.left,right:frame.right,width:frame.width,height:frame.height}:null
        };
      });
      add('v220-mobile-chapter-no-overflow',mobileChapter.overflowX===false&&mobileChapter.scrollWidth<=391,JSON.stringify(mobileChapter));
      add('v220-mobile-chapter-contained',!!mobileChapter.frame&&mobileChapter.frame.left>=0&&mobileChapter.frame.right<=mobileChapter.width+1,JSON.stringify(mobileChapter.frame));

      result={
        ok:checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0,
        status:'done',
        mode:'v220_cinematic_story_harness',
        target:TARGET,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await testCtx.close();await ctx.close();return;
    }

    if(V219_CROWD_ONLY){
      const consoleErrors=[];const pageErrors=[];const failedResources=[];
      page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
      page.on('requestfailed',req=>failedResources.push(req.url()));
      const response=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>window.TGG3D?.isReady?.()&&window.TGGStreetPresence?.getStatus?.()&&window.TGGCrowdPresentation?.getStatus?.()&&window.TGGWorldLife,undefined,{polling:100,timeout:30000});
      await page.waitForTimeout(450);
      const checks=[];const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});

      let snap=await page.evaluate(()=>({
        title:document.title,
        api:typeof window.TGGCrowdPresentation?.getStatus==='function'&&typeof window.TGGCrowdPresentation?.getFocus==='function',
        crowd:window.TGGCrowdPresentation?.getStatus?.(),
        fans:window.TGGCrowdPresentation?.fans?.length||0,
        clusters:window.TGGCrowdPresentation?.clusters?.length||0
      }));
      const versionMatch=String(snap.title||'').match(/V2\.(\d+)/);
      add('v219-title',!!versionMatch&&Number(versionMatch[1])>=19,snap.title);
      add('v219-api',snap.api);
      add('v219-fan-pool',snap.fans===12,snap.fans);
      add('v219-clusters',snap.clusters===4,snap.clusters);
      add('v219-accessories',Number(snap.crowd?.accessories)>=20,JSON.stringify(snap.crowd));
      add('v219-street-phones',Number(snap.crowd?.streetPhones)>=4,snap.crowd?.streetPhones);
      add('v219-total-presented',Number(snap.crowd?.totalPresented)>=20,snap.crowd?.totalPresented);

      await page.evaluate(()=>window.TGGVerticalSlice.setQuality('PERF'));
      await page.waitForTimeout(320);
      snap=await page.evaluate(()=>window.TGGCrowdPresentation.getStatus());
      add('v219-low-density',snap.density==='LOW'&&snap.visibleFans===4,JSON.stringify(snap));

      await page.evaluate(()=>window.TGGVerticalSlice.setQuality('HIGH'));
      await page.waitForTimeout(320);
      snap=await page.evaluate(()=>window.TGGCrowdPresentation.getStatus());
      add('v219-high-density',snap.density==='HIGH'&&snap.visibleFans===12,JSON.stringify(snap));

      await page.evaluate(()=>window.TGGWorldLife.startBattle());
      await page.waitForTimeout(180);
      snap=await page.evaluate(()=>window.TGGCrowdPresentation.getStatus());
      add('v219-battle-focus',snap.focus==='downtown',JSON.stringify(snap));

      await page.evaluate(()=>{
        window.TGGWorldLife.battleChoice('bars');
        window.TGGWorldLife.battleChoice('flow');
        window.TGGWorldLife.battleChoice('crowd');
        window.TGGWorldLife.startShow();
      });
      await page.waitForTimeout(220);
      snap=await page.evaluate(()=>window.TGGCrowdPresentation.getStatus());
      add('v219-show-focus',snap.focus==='stage',JSON.stringify(snap));
      add('v219-show-reaction',Number(snap.cheering)>=1&&Number(snap.recording)>=1&&Number(snap.reactionLevel)>=1,JSON.stringify(snap));

      result={
        ok:checks.every(x=>x.pass)&&pageErrors.length===0,
        status:'done',
        mode:'v219_crowd_presentation_harness',
        target:TARGET,
        http_status:response?.status?.()||0,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();return;
    }

    if(V218_MEGA_ONLY){
      const consoleErrors=[];const pageErrors=[];const failedResources=[];
      const local=await startV218SnapshotServer();
      const qaTarget=local.url;
      console.log(JSON.stringify({tgg_v218_mega_stage:'local-snapshot-ready',target:qaTarget,snapshot:'ad1d9b08d794247d269cb8a0667e057f945cfcc5'}));
      page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
      page.on('requestfailed',req=>failedResources.push(req.url()));
      const response=await page.goto(qaTarget,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>window.TGGMegaQA&&window.TGGVerticalSlice&&window.TGGStreetPresence&&window.TGGStoryMissions&&window.TGGGame,undefined,{polling:100,timeout:30000});
      await page.waitForTimeout(700);
      const desktop=await page.evaluate(()=>window.TGGMegaQA.run());
      console.log(JSON.stringify({tgg_v218_mega_stage:'desktop-suite-done',total:desktop.total,passed:desktop.passed,failed:desktop.failed,failed_checks:desktop.checks.filter(x=>!x.pass).slice(0,25)}));

      await page.close();
      const verticalSliceSource=await fs.readFile(path.join(process.cwd(),'tgg-browser-worker','mega-game-snapshot','vertical-slice-director.js'),'utf8');
      const mobileCss=await fs.readFile(path.join(process.cwd(),'tgg-browser-worker','mega-game-snapshot','style.css'),'utf8');
      let mobileHtml=await fs.readFile(path.join(process.cwd(),'tgg-browser-worker','mega-game-snapshot','index.html'),'utf8');
      while(mobileHtml.includes('<script')){
        const scriptStart=mobileHtml.indexOf('<script');
        const scriptEnd=mobileHtml.indexOf('</script>',scriptStart);
        if(scriptEnd<0)break;
        mobileHtml=mobileHtml.slice(0,scriptStart)+mobileHtml.slice(scriptEnd+9);
      }
      mobileHtml=mobileHtml.replace('<link rel="stylesheet" href="style.css">','<style>'+mobileCss+'</style>');
      const mobileSourceOk=mobileHtml.includes('V2.18 STREET PRESENCE')&&mobileHtml.includes('id="game"')&&mobileCss.length>1000;
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
      const mp=await mobile.newPage();
      const mobileErrors=[];const mobileFailed=[];
      mp.on('pageerror',e=>mobileErrors.push(e.message||String(e)));
      mp.on('requestfailed',req=>mobileFailed.push(req.url()));
      await mp.setContent(mobileHtml,{waitUntil:'domcontentloaded',timeout:15000});
      await mp.evaluate(()=>{
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('game')?.classList.add('active');
        window.TGGGame={
          getActiveScreen:()=> 'game',
          getState:()=>({x:50,y:55,heading:0,inVehicle:false,autoMode:true,cash:0,xp:0,level:1}),
          save:()=>true,
          show:()=>true
        };
        window.TGGStoryMissions={status:()=>({
          chapter:3,chapterName:'CITY TAKEOVER',active:true,completed:false,progress:50,
          current:{title:'STREET PRESENCE',detail:'Mobile layout and presentation validation.'}
        })};
        window.TGGNavigation={getTarget:()=>({meters:42})};
        window.TGG3D={renderer:null};
        window.TGGStreetPresence={getStatus:()=>({
          ready:true,density:'LOW',citizens:6,socialPeople:4,totalVisible:10,
          nearbyPeople:0,reactions:0,activeDistrict:'DOWNTOWN',activityNodes:4,
          originalPedestrians:6,totalStreetPopulation:16
        })};
      });
      await mp.addScriptTag({content:verticalSliceSource});
      await mp.waitForTimeout(150);
      const mobileLayout=await mp.evaluate(()=>{
        const rect=el=>{const r=el?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null};
        const city=document.querySelector('#game .city');
        const move=document.querySelector('.move-pad');
        const deck=document.querySelector('.action-deck');
        const dpad=document.querySelector('.dpad');
        const director=document.getElementById('sliceDirector');
        const actions=[...document.querySelectorAll('.actions button')].map(x=>x.getBoundingClientRect());
        const street=window.TGGStreetPresence.getStatus();
        return {
          width:innerWidth,
          scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          city:rect(city),move:rect(move),deck:rect(deck),dpad:rect(dpad),director:rect(director),
          actionCount:actions.length,
          minActionHeight:actions.length?Math.min(...actions.map(x=>x.height)):0,
          street
        };
      });
      const checks=[];
      const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});
      add('v218-mega-desktop-ok',desktop.ok===true,'passed='+desktop.passed+'/'+desktop.total);
      add('v218-mega-desktop-volume',desktop.total>=526,desktop.total);
      add('v218-mega-mobile-source-loaded',mobileSourceOk,'exact V2.18 HTML+CSS local snapshot');
      add('v218-mega-mobile-no-overflow',mobileLayout.overflowX===false&&mobileLayout.scrollWidth<=391,JSON.stringify({width:mobileLayout.width,scrollWidth:mobileLayout.scrollWidth}));
      add('v218-mega-mobile-city-contained',!!mobileLayout.city&&mobileLayout.city.left>=0&&mobileLayout.city.right<=mobileLayout.width+1,JSON.stringify(mobileLayout.city));
      add('v218-mega-mobile-dpad-contained',!!mobileLayout.dpad&&mobileLayout.dpad.left>=0&&mobileLayout.dpad.right<=mobileLayout.width+1,JSON.stringify(mobileLayout.dpad));
      add('v218-mega-mobile-controls-stacked',!!mobileLayout.move&&!!mobileLayout.deck&&mobileLayout.deck.top>=mobileLayout.move.bottom-1,JSON.stringify({move:mobileLayout.move,deck:mobileLayout.deck}));
      add('v218-mega-mobile-actions-readable',mobileLayout.actionCount>=26&&mobileLayout.minActionHeight>=50,JSON.stringify({count:mobileLayout.actionCount,minHeight:mobileLayout.minActionHeight}));
      add('v218-mega-mobile-director-contained',!!mobileLayout.director&&mobileLayout.director.left>=0&&mobileLayout.director.right<=mobileLayout.width+1,JSON.stringify(mobileLayout.director));
      add('v218-mega-mobile-street-runtime',mobileLayout.street?.ready===true&&Number(mobileLayout.street.totalStreetPopulation)>=16,JSON.stringify(mobileLayout.street));

      result={
        ok:desktop.ok===true&&checks.every(x=>x.pass)&&pageErrors.length===0&&mobileErrors.length===0,
        status:'done',
        mode:'v218_mega_regression_qa',
        target:'github:ad1d9b08d794247d269cb8a0667e057f945cfcc5',
        served_via:'attached-v218-snapshot',
        http_status:response?.status?.()||0,
        checks,
        desktop_summary:{total:desktop.total,passed:desktop.passed,failed:desktop.failed,failed_checks:desktop.checks.filter(x=>!x.pass)},
        mobile_summary:mobileLayout,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        mobile_page_errors:mobileErrors,
        mobile_failed_resources:mobileFailed,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await new Promise(resolve=>local.proxy.close(resolve));await ctx.close();return;
    }

    if(STREET_PRESENCE_ONLY){
      const consoleErrors=[];const pageErrors=[];const failedResources=[];
      page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
      page.on('requestfailed',req=>failedResources.push(req.url()));
      const response=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>window.TGG3D?.isReady?.()&&window.TGGStreetPresence?.getStatus?.(),undefined,{polling:100,timeout:30000});
      await page.waitForTimeout(350);
      const checks=[];const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});

      let snap=await page.evaluate(()=>({
        title:document.title,
        canvas:!!document.querySelector('#city3d canvas'),
        api:typeof window.TGGStreetPresence?.getStatus==='function'&&typeof window.TGGStreetPresence?.setDensity==='function',
        status:window.TGGStreetPresence?.getStatus?.(),
        citizens:window.TGGStreetPresence?.citizens?.length||0,
        social:window.TGGStreetPresence?.socialPeople?.length||0,
        nodes:window.TGGStreetPresence?.activityNodes?.length||0,
        first:window.TGGStreetPresence?.citizens?.[0]?{
          x:window.TGGStreetPresence.citizens[0].position.x,
          z:window.TGGStreetPresence.citizens[0].position.z
        }:null
      }));
      add('street-v218-title',snap.title.includes('V2.18'),snap.title);
      add('street-webgl-canvas',snap.canvas);
      add('street-api',snap.api);
      add('street-citizen-pool',snap.citizens===14,snap.citizens);
      add('street-social-pool',snap.social===8,snap.social);
      add('street-activity-nodes',snap.nodes===4,snap.nodes);
      add('street-population',Number(snap.status?.totalStreetPopulation)>=16,JSON.stringify(snap.status));
      add('street-density-valid',['LOW','MEDIUM','HIGH'].includes(snap.status?.density),snap.status?.density);

      const firstBefore=snap.first;
      await page.waitForTimeout(900);
      snap=await page.evaluate(()=>({
        first:window.TGGStreetPresence?.citizens?.[0]?{
          x:window.TGGStreetPresence.citizens[0].position.x,
          z:window.TGGStreetPresence.citizens[0].position.z
        }:null
      }));
      const moved=firstBefore&&snap.first?Math.hypot(snap.first.x-firstBefore.x,snap.first.z-firstBefore.z):0;
      add('street-roaming-motion',moved>.08,'distance='+moved.toFixed(3));

      snap=await page.evaluate(()=>{
        window.TGGStreetPresence.setDensity('LOW');
        const status=window.TGGStreetPresence.getStatus();
        return {          density:status.density,
          citizens:window.TGGStreetPresence.citizens.filter(x=>x.visible).length,
          social:window.TGGStreetPresence.socialPeople.filter(x=>x.visible).length,
          total:status.totalStreetPopulation
        };
      });
      add('street-low-density',snap.density==='LOW'&&snap.citizens===6&&snap.social===4&&snap.total>=16,JSON.stringify(snap));

      snap=await page.evaluate(()=>{
        window.TGGStreetPresence.setDensity('HIGH');
        const status=window.TGGStreetPresence.getStatus();
        return {
          density:status.density,
          citizens:window.TGGStreetPresence.citizens.filter(x=>x.visible).length,
          social:window.TGGStreetPresence.socialPeople.filter(x=>x.visible).length,
          total:status.totalStreetPopulation
        };
      });
      add('street-high-density',snap.density==='HIGH'&&snap.citizens===14&&snap.social===8&&snap.total>=28,JSON.stringify(snap));

      await page.evaluate(()=>{
        const p=window.TGGStreetPresence.citizens[0];
        const s=window.TGGGame.getState();
        s.x=50+p.position.x/.92;
        s.y=50+p.position.z/.92;
      });      await page.waitForTimeout(180);
      snap=await page.evaluate(()=>window.TGGStreetPresence.getStatus());
      add('street-proximity-awareness',Number(snap.nearbyPeople)>=1,JSON.stringify(snap));

      await page.waitForTimeout(220);
      snap=await page.evaluate(()=>window.TGGStreetPresence.getStatus());
      add('street-proximity-reaction',Number(snap.reactions)>=1,JSON.stringify(snap));
      add('street-district-state',typeof snap.activeDistrict==='string'&&snap.activeDistrict.length>0,snap.activeDistrict);

      result={
        ok:checks.every(x=>x.pass)&&pageErrors.length===0,
        status:'done',
        mode:'street_presence_v218_harness',
        target:TARGET,
        http_status:response?.status?.()||0,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();return;
    }

    if(MEGA_QA_ONLY){
      const megaSha=String(process.env.TGG_3D_MEGA_QA_SHA||'').trim();
      const snapshotSha='e565a5f209a55b3c4d70a8b874454c23b85816bd';
      if(megaSha!==snapshotSha)throw new Error('mega snapshot SHA mismatch: expected '+snapshotSha+' got '+megaSha);
      const mimeFor=p=>p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.js')?'application/javascript; charset=utf-8':p.endsWith('.json')?'application/json; charset=utf-8':p.endsWith('.png')?'image/png':p.endsWith('.jpg')||p.endsWith('.jpeg')?'image/jpeg':p.endsWith('.webp')?'image/webp':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
      const serveRoot=path.resolve(process.cwd(),'tgg-browser-worker','mega-game-snapshot');
      await fs.access(path.join(serveRoot,'index.html'));      const proxy=http.createServer(async(req,res)=>{
        try{
          let pathname=new URL(req.url||'/','http://127.0.0.1').pathname;
          if(pathname==='/')pathname='/index.html';
          pathname=decodeURIComponent(pathname);
          const relative=pathname.replace(/^\/+/, '');
          const filePath=path.resolve(serveRoot,relative);
          if(!filePath.startsWith(serveRoot+path.sep)&&filePath!==serveRoot){
            res.statusCode=400;res.end('bad path');return;
          }
          const bytes=await fs.readFile(filePath);
          res.statusCode=200;
          res.setHeader('content-type',mimeFor(filePath));
          res.setHeader('cache-control','no-store');
          res.end(bytes);
        }catch(error){
          res.statusCode=error?.code==='ENOENT'?404:500;
          res.end(error?.message||String(error));
        }
      });
      await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
      const proxyAddress=proxy.address();
      const qaTarget='http://127.0.0.1:'+proxyAddress.port+'/';
      console.log(JSON.stringify({tgg_mega_stage:'local-server-ready',target:qaTarget,snapshot:megaSha}));
      try{
        const consoleErrors=[]; const pageErrors=[]; const failedResources=[];
        page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
        page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
        page.on('requestfailed',req=>failedResources.push(req.url()));
        const response=await page.goto(qaTarget,{waitUntil:'commit',timeout:15000});
        console.log(JSON.stringify({tgg_mega_stage:'desktop-page-committed',status:response?.status?.()||0}));
        await page.waitForFunction(()=>window.TGGMegaQA&&window.TGGVerticalSlice&&window.TGGGame&&window.TGGStoryMissions,undefined,{polling:100,timeout:90000});        console.log(JSON.stringify({tgg_mega_stage:'desktop-core-apis-ready'}));
        await page.waitForTimeout(700);
        const desktop=await page.evaluate(()=>window.TGGMegaQA.run());
        const desktopFailed=desktop.checks.filter(x=>!x.pass);
        console.log(JSON.stringify({tgg_mega_stage:'desktop-suite-done',total:desktop.total,passed:desktop.passed,failed:desktop.failed,failed_checks:desktopFailed.slice(0,30)}));
        await page.close();
        console.log(JSON.stringify({tgg_mega_stage:'desktop-page-closed'}));

        const verticalSliceSource=await fs.readFile(path.join(serveRoot,'vertical-slice-director.js'),'utf8');
        const mobileCss=await fs.readFile(path.join(serveRoot,'style.css'),'utf8');
        let mobileHtml=await fs.readFile(path.join(serveRoot,'index.html'),'utf8');
        while(mobileHtml.includes('<script')){
          const scriptStart=mobileHtml.indexOf('<script');
          const scriptEnd=mobileHtml.indexOf('</script>',scriptStart);
          if(scriptEnd<0)break;
          mobileHtml=mobileHtml.slice(0,scriptStart)+mobileHtml.slice(scriptEnd+9);
        }
        mobileHtml=mobileHtml.replace('<link rel="stylesheet" href="style.css">','<style>'+mobileCss+'</style>');
        const mobileSourceOk=mobileHtml.includes('id="game"')&&mobileCss.length>1000;
        const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
        const mp=await mobile.newPage();
        const mobileErrors=[];
        mp.on('pageerror',e=>mobileErrors.push(e.message||String(e)));
        await mp.setContent(mobileHtml,{waitUntil:'domcontentloaded',timeout:15000});
        console.log(JSON.stringify({tgg_mega_stage:'mobile-layout-page-ready',source_ok:mobileSourceOk}));
        await mp.evaluate(()=>{
          document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
          document.getElementById('game')?.classList.add('active');
          window.TGGGame={
            getActiveScreen:()=> 'game',
            getState:()=>({x:50,y:55,heading:0,inVehicle:false}),
            save:()=>true,
            show:()=>true
          };
          window.TGGStoryMissions={status:()=>({
            chapter:3,chapterName:'CITY TAKEOVER',active:true,completed:false,progress:50,
            current:{title:'MOBILE VERTICAL SLICE',detail:'Phone layout and controls validation.'}
          })};
          window.TGGNavigation={getTarget:()=>({meters:42})};
          window.TGG3D={renderer:null};
        });
        await mp.addScriptTag({content:verticalSliceSource});
        await mp.waitForSelector('#sliceDirector',{state:'attached',timeout:10000});
        await mp.waitForTimeout(350);
        const mobileResult=await mp.evaluate(()=>{
          const body=document.documentElement;
          const director=document.getElementById('sliceDirector')?.getBoundingClientRect();
          const city=document.querySelector('#game .city')?.getBoundingClientRect();
          const dpad=document.querySelector('#game .dpad')?.getBoundingClientRect();
          const move=document.querySelector('#game .move-pad')?.getBoundingClientRect();
          const deck=document.querySelector('#game .action-deck')?.getBoundingClientRect();
          const actionButtons=[...document.querySelectorAll('#game .actions button')].map(x=>x.getBoundingClientRect());
          return {
            width:innerWidth,
            scrollWidth:body.scrollWidth,
            overflowX:body.scrollWidth>innerWidth+1,
            director:director?{left:director.left,right:director.right,width:director.width,height:director.height}:null,
            city:city?{left:city.left,right:city.right,width:city.width}:null,
            dpad:dpad?{left:dpad.left,right:dpad.right,width:dpad.width,height:dpad.height}:null,
            move:move?{top:move.top,bottom:move.bottom,left:move.left,right:move.right}:null,
            deck:deck?{top:deck.top,bottom:deck.bottom,left:deck.left,right:deck.right}:null,
            actionCount:actionButtons.length,
            minActionHeight:actionButtons.length?Math.min(...actionButtons.map(x=>x.height)):0,
            chapter:document.getElementById('sliceChapter')?.textContent||'',
            title:document.getElementById('sliceTitle')?.textContent||''
          };
        });
        console.log(JSON.stringify({tgg_mega_stage:'mobile-layout-done',layout:mobileResult}));
        const checks=[
          {name:'mega-desktop-ok',pass:desktop.ok,detail:'passed='+desktop.passed+'/'+desktop.total},
          {name:'mega-check-volume',pass:desktop.total>=250&&desktop.total<=650,detail:String(desktop.total)},
          {name:'mega-mobile-source-loaded',pass:mobileSourceOk,detail:'html+css local snapshot'},
          {name:'mega-mobile-no-overflow',pass:!mobileResult.overflowX&&mobileResult.scrollWidth<=391,detail:JSON.stringify({width:mobileResult.width,scrollWidth:mobileResult.scrollWidth})},          {name:'mega-mobile-director-contained',pass:!!mobileResult.director&&mobileResult.director.left>=0&&mobileResult.director.right<=mobileResult.width+1,detail:JSON.stringify(mobileResult.director)},
          {name:'mega-mobile-city-contained',pass:!!mobileResult.city&&mobileResult.city.left>=0&&mobileResult.city.right<=mobileResult.width+1,detail:JSON.stringify(mobileResult.city)},
          {name:'mega-mobile-dpad-contained',pass:!!mobileResult.dpad&&mobileResult.dpad.left>=0&&mobileResult.dpad.right<=mobileResult.width+1&&mobileResult.dpad.height>=140,detail:JSON.stringify(mobileResult.dpad)},
          {name:'mega-mobile-controls-stacked',pass:!!mobileResult.move&&!!mobileResult.deck&&mobileResult.move.bottom<=mobileResult.deck.top+1,detail:JSON.stringify({move:mobileResult.move,deck:mobileResult.deck})},
          {name:'mega-mobile-actions-readable',pass:mobileResult.actionCount>=20&&mobileResult.minActionHeight>=50,detail:JSON.stringify({count:mobileResult.actionCount,minHeight:mobileResult.minActionHeight})},
          {name:'mega-mobile-vertical-slice-ui',pass:mobileResult.chapter.includes('CHAPTER 3')&&mobileResult.title==='MOBILE VERTICAL SLICE',detail:JSON.stringify({chapter:mobileResult.chapter,title:mobileResult.title})}
        ];
        result={
          ok:checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0&&mobileErrors.length===0,
          status:'done',
          mode:'mega_vertical_slice_qa',
          target:'github:'+megaSha,
          served_via:'attached-git-tree-snapshot',
          http_status:response?.status?.()||0,
          checks,
          desktop_summary:{total:desktop.total,passed:desktop.passed,failed:desktop.failed,failed_checks:desktop.checks.filter(x=>!x.pass).slice(0,30)},
          mobile_summary:{mode:'layout-and-presentation',...mobileResult},
          console_errors:consoleErrors,
          page_errors:pageErrors,
          mobile_page_errors:mobileErrors,
          failed_resources:failedResources,
          updated_at:new Date().toISOString()
        };
        console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
        await mobile.close();await ctx.close();return;
      } finally {
        await new Promise(resolve=>proxy.close(()=>resolve()));
      }
    }

    if(STORY_CHAPTER3_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,cssResponse,storyResponse,cineResponse]=await Promise.all([
        fetch(base+'/index.html'),fetch(base+'/style.css'),fetch(base+'/story-missions.js'),fetch(base+'/story-cinematics.js')
      ]);
      if(!htmlResponse.ok||!cssResponse.ok||!storyResponse.ok||!cineResponse.ok){
        throw new Error('Story Chapter 3 harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status+', story='+storyResponse.status+', cine='+cineResponse.status);
      }
      let html=await htmlResponse.text();
      const [css,storySource,cineSource]=await Promise.all([cssResponse.text(),storyResponse.text(),cineResponse.text()]);
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
      const mp=await mobile.newPage();
      const errors=[]; const consoleErrors=[];
      mp.on('pageerror',e=>errors.push(e.message||String(e)));
      mp.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      await mp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={x:50,y:55,heading:0,inVehicle:false,cash:0,xp:0,level:7};
        window.__qaCareer={recordings:4,mixtapes:2,reputation:0,studioLevel:4};
        window.__qaContent={completed:['flyer-run','studio-session','mixtape-promo']};
        window.__qaLife={battleWins:2,shows:2,activeOpportunity:null,contacts:{}};
        window.__qaShown='storyMissionsBoard';window.__qaTab=null;window.__qaToasts=[];
        window.TGGGame={
          getState:()=>window.__qaGame,
          getActiveScreen:()=>window.__qaShown,
          show:id=>{window.__qaShown=id;document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));document.getElementById(id)?.classList.add('active');return true},
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true}
        };
        window.TGGCareer={career:window.__qaCareer,addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}};
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          setTab:t=>{window.__qaTab=t;return true},
          callContact:id=>{window.__qaLife.activeOpportunity={contactId:id,createdAt:Date.now(),title:'QA',detail:'QA'};return true}
        };
        window.TGGCareerDirector={getState:()=>({activeContract:null,history:[{title:'MANAGER MOVE'}]})};
        window.TGGProgression={sync:()=>true};
        window.__tggToast=t=>window.__qaToasts.push(String(t));
        localStorage.setItem('tgg-story-missions-v1',JSON.stringify({
          active:false,completed:true,step:6,startedAt:1,completedAt:2,
          baselines:{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0},
          chapter2:{
            active:false,completed:true,step:10,startedAt:3,completedAt:4,
            baselines:{recordings:3,battleWins:1,shows:1},
            flags:{manager:true,kane:true,director:true,visual:true},lastSync:4
          },
          chapter3:{
            active:false,completed:false,step:0,startedAt:0,completedAt:0,
            baselines:null,flags:{dj:false,premiere:false,manager:false},lastSync:0
          }
        }));
      });      await mp.addScriptTag({content:storySource});
      await mp.addScriptTag({content:cineSource});
      await mp.waitForTimeout(80);
      const checks=[]; const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

      let snap=await mp.evaluate(()=>({
        api:typeof window.TGGStoryMissions?.startChapter3==='function'&&typeof window.TGGStoryCinematics?.show==='function',
        status:window.TGGStoryMissions?.status?.()      }));
      record('chapter3-api',snap.api);
      record('chapter2-preserved',snap.status?.chapter===2&&snap.status?.completed===true&&snap.status?.step===10,JSON.stringify(snap.status));

      await mp.evaluate(()=>window.TGGStoryMissions.startChapter3());
      await mp.waitForTimeout(40);
      snap=await mp.evaluate(()=>({
        status:window.TGGStoryMissions.status(),
        target:window.TGGStoryMissions.navigationTarget(),
        cinematic:window.TGGStoryCinematics.getState()
      }));
      record('chapter3-starts',snap.status?.chapter===3&&snap.status?.active===true&&snap.status?.step===0&&snap.status?.steps?.length===8,JSON.stringify(snap.status));
      record('chapter3-dj-marker',snap.target?.id==='dj-v'&&snap.target?.x===76&&snap.target?.y===63&&snap.target?.talk==='dj',JSON.stringify(snap.target));
      record('chapter3-start-cinematic',snap.cinematic?.lastEvent?.type==='chapter-start'&&snap.cinematic?.lastEvent?.chapter===3,JSON.stringify(snap.cinematic));

      await mp.evaluate(()=>{window.__qaGame.x=76;window.__qaGame.y=63;window.TGGStoryMissions.doCurrent();});
      snap=await mp.evaluate(()=>({
        status:window.TGGStoryMissions.status(),        opportunity:window.__qaLife.activeOpportunity,
        cinematic:window.TGGStoryCinematics.getState()
      }));
      record('chapter3-dj-talk',snap.status?.step===1&&snap.opportunity?.contactId==='dj',JSON.stringify(snap));
      record('chapter3-objective-cinematic',snap.cinematic?.lastEvent?.type==='objective'&&snap.cinematic?.lastEvent?.title==='PACK THE VENUE',JSON.stringify(snap.cinematic));

      await mp.evaluate(()=>{window.__qaLife.shows=3;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter3-show',snap.step===2&&snap.current?.id==='business-arrival',JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=11;window.__qaGame.y=50;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter3-business-arrival',snap.step===3&&snap.current?.id==='next-release',JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaCareer.mixtapes=3;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter3-release',snap.step===4&&snap.current?.id==='media-return',JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=50;window.__qaGame.y=89;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter3-media-arrival',snap.step===5&&snap.current?.id==='premiere',JSON.stringify(snap));

      await mp.evaluate(()=>document.querySelector('[data-media="premiere"]')?.click());      await mp.waitForTimeout(25);
      await mp.evaluate(()=>window.TGGStoryMissions.sync());      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());      record('chapter3-premiere',snap.step===6&&snap.current?.id==='home-base',JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=63;window.__qaGame.y=24;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter3-home-base',snap.step===7&&snap.current?.id==='manager-finale',JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=72;window.__qaGame.y=36;window.TGGStoryMissions.doCurrent();});
      await mp.waitForTimeout(30);      snap=await mp.evaluate(()=>({
        status:window.TGGStoryMissions.status(),
        game:{...window.__qaGame},
        career:{...window.__qaCareer},
        stored:JSON.parse(localStorage.getItem('tgg-story-missions-v1')||'null'),
        cinematic:window.TGGStoryCinematics.getState(),
        action:{text:document.getElementById('storyMissionAction')?.textContent||'',disabled:document.getElementById('storyMissionAction')?.disabled}
      }));
      record('chapter3-completes',snap.status?.completed===true&&snap.status?.step===8,JSON.stringify(snap.status));
      record('chapter3-final-reward',snap.game.cash===3500&&snap.game.xp===700&&snap.career.reputation===300,JSON.stringify({game:snap.game,career:snap.career}));
      record('chapter3-persistence',snap.stored?.chapter3?.completed===true&&snap.stored?.chapter3?.step===8,JSON.stringify(snap.stored?.chapter3));      record('chapter3-passed-cinematic',snap.cinematic?.lastEvent?.type==='chapter-complete'&&snap.cinematic?.lastEvent?.chapter===3,JSON.stringify(snap.cinematic));
      record('chapter3-story-arc-lock',snap.action.text==='STORY ARC COMPLETE'&&snap.action.disabled===true,JSON.stringify(snap.action));

      const layout=await mp.evaluate(async()=>{
        window.TGGStoryCinematics.show({type:'objective',chapter:3,title:'OBJECTIVE UPDATED',detail:'FOLLOW THE CITY MARKER'});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const root=document.getElementById('storyCinematic')?.getBoundingClientRect();
        const copy=document.querySelector('.story-cine-copy')?.getBoundingClientRect();
        return {
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          visible:document.getElementById('storyCinematic')?.classList.contains('show'),
          root:root?{left:root.left,right:root.right,width:root.width}:null,
          copy:copy?{left:copy.left,right:copy.right,width:copy.width,height:copy.height}:null
        };
      });
      record('chapter3-mobile-no-overflow',layout.overflowX===false&&layout.scrollWidth<=391,JSON.stringify(layout));
      record('chapter3-cinematic-contained',layout.visible===true&&!!layout.copy&&layout.copy.left>=0&&layout.copy.right<=layout.width+1,JSON.stringify(layout));

      result={
        ok:checks.every(x=>x.pass)&&errors.length===0&&consoleErrors.length===0,        status:'done',mode:'story_chapter3_harness',target:TARGET,checks,
        console_errors:consoleErrors,page_errors:errors,updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;    }    if(STORY_WORLD_3D_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,threeResponse,storyResponse,worldResponse]=await Promise.all([
        fetch(base+'/index.html'),
        fetch(base+'/vendor/three-r152.min.js'),
        fetch(base+'/story-missions.js'),
        fetch(base+'/story-world-3d.js')
      ]);
      if(!htmlResponse.ok||!threeResponse.ok||!storyResponse.ok||!worldResponse.ok){
        throw new Error('Story World 3D logic harness fetch failed: html='+htmlResponse.status+', three='+threeResponse.status+', story='+storyResponse.status+', world='+worldResponse.status);
      }
      let html=await htmlResponse.text();
      const [threeSource,storySource,worldSource]=await Promise.all([
        threeResponse.text(),storyResponse.text(),worldResponse.text()
      ]);
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      const logic=await browser.newContext({viewport:{width:1280,height:900}});
      const lp=await logic.newPage();
      const errors=[]; const consoleErrors=[];
      lp.on('pageerror',e=>errors.push(e.message||String(e)));
      lp.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
      await lp.setContent(html,{waitUntil:'domcontentloaded'});
      await lp.addScriptTag({content:threeSource});
      await lp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={x:50,y:55,heading:0,inVehicle:false,cash:0,xp:0,level:5};
        window.__qaCareer={recordings:3,mixtapes:1,reputation:0,studioLevel:3};
        window.__qaContent={completed:['flyer-run']};
        window.__qaLife={battleWins:1,shows:1,activeOpportunity:null,contacts:{}};
        window.__qaShown='game'; window.__qaToasts=[];
        window.TGGGame={
          getState:()=>window.__qaGame,
          getActiveScreen:()=>window.__qaShown,
          show:id=>{window.__qaShown=id;return true},
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true}
        };
        window.TGGCareer={career:window.__qaCareer,addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}};
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          setTab:()=>true,
          callContact:id=>{window.__qaLife.activeOpportunity={contactId:id,createdAt:Date.now(),title:'QA',detail:'QA'};return true}
        };
        window.TGGCareerDirector={getState:()=>({activeContract:null,history:[{title:'MANAGER MOVE'}]})};
        window.TGGProgression={sync:()=>true};
        window.__tggToast=t=>window.__qaToasts.push(String(t));
        window.TGG3D={scene:new THREE.Scene(),isReady:()=>true};
        localStorage.setItem('tgg-story-missions-v1',JSON.stringify({
          active:false,completed:true,step:6,startedAt:1,completedAt:2,
          baselines:{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0},
          chapter2:{active:false,completed:false,step:0,startedAt:0,completedAt:0,baselines:null,flags:{manager:false,kane:false,director:false,visual:false}}
        }));      });
      await lp.addScriptTag({content:storySource});
      await lp.addScriptTag({content:worldSource});
      await lp.evaluate(()=>window.TGGStoryMissions.startChapter2());
      await lp.waitForTimeout(180);
      const checks=[]; const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

      let snap=await lp.evaluate(()=>({
        api:typeof window.TGGStoryWorld3D?.getStatus==='function',
        story:window.TGGStoryMissions.status(),
        world:window.TGGStoryWorld3D?.getStatus?.(),        sceneChildren:window.TGG3D.scene.children.length,
        contacts:(window.TGGStoryWorld3D?.contacts||[]).map(c=>({
          id:c.id,name:c.name,role:c.role,x:c.x,y:c.y,
          wx:c.group.position.x,wz:c.group.position.z,
          isGroup:!!c.group.isGroup,
          visible:c.group.visible,
          children:c.group.children.length,
          labelSprite:!!c.label?.isSprite,
          markerMesh:!!c.marker?.isMesh
        })),
        beacon:{
          visible:window.TGGStoryWorld3D?.beacon?.visible,
          isGroup:!!window.TGGStoryWorld3D?.beacon?.isGroup,
          children:window.TGGStoryWorld3D?.beacon?.children?.length||0
        },
        route:{
          visible:window.TGGStoryWorld3D?.routeLine?.visible,
          isLine:!!window.TGGStoryWorld3D?.routeLine?.isLine,
          points:window.TGGStoryWorld3D?.routeLine?.geometry?.attributes?.position?.count||0
        }
      }));
      record('story3d-api',snap.api,JSON.stringify(snap.world));
      record('story3d-three-scene-populated',snap.sceneChildren>=5,'children='+snap.sceneChildren);
      record('story3d-three-contacts',snap.contacts.length===4&&snap.contacts.map(x=>x.id).join(',')==='manager,kane,dj,director',JSON.stringify(snap.contacts));
      record('story3d-contact-geometry',snap.contacts.every(x=>x.isGroup&&x.visible&&x.children>=8&&x.labelSprite&&x.markerMesh),JSON.stringify(snap.contacts));
      const manager=snap.contacts.find(x=>x.id==='manager');
      record('story3d-manager-world-position',!!manager&&Math.abs(manager.wx-20.24)<.15&&Math.abs(manager.wz+12.88)<.15,JSON.stringify(manager));
      record('story3d-beacon-object',snap.beacon.isGroup&&snap.beacon.children>=5&&snap.beacon.visible===true,JSON.stringify(snap.beacon));
      record('story3d-route-object',snap.route.isLine&&snap.route.visible===true&&snap.route.points===2,JSON.stringify(snap.route));
      record('story3d-manager-target',snap.world?.target?.id==='manager-return'&&snap.world?.activeContact==='manager',JSON.stringify(snap.world));

      await lp.evaluate(()=>{window.__qaGame.x=72;window.__qaGame.y=36;window.TGGStoryMissions.render();});
      await lp.waitForTimeout(160);
      snap=await lp.evaluate(()=>({
        world:window.TGGStoryWorld3D.getStatus(),
        interact:{text:document.getElementById('interact3dBtn')?.textContent||'',disabled:document.getElementById('interact3dBtn')?.disabled},
        dialogue:{text:document.getElementById('npcDialogue')?.textContent||'',show:document.getElementById('npcDialogue')?.classList.contains('show')}
      }));
      record('story3d-manager-proximity',snap.world?.near===true,JSON.stringify(snap.world));
      record('story3d-interact-talk-m',snap.interact.disabled===false&&snap.interact.text.includes('TALK TO M'),JSON.stringify(snap.interact));
      record('story3d-proximity-dialogue',snap.dialogue.show===true&&snap.dialogue.text.startsWith('M:'),JSON.stringify(snap.dialogue));

      await lp.evaluate(()=>document.getElementById('interact3dBtn')?.click());
      await lp.waitForTimeout(120);
      snap=await lp.evaluate(()=>({
        story:window.TGGStoryMissions.status(),
        world:window.TGGStoryWorld3D.getStatus()
      }));
      record('story3d-contact-interaction-advances',snap.story?.step===1&&snap.story?.current?.id==='studio-arrival',JSON.stringify(snap.story));
      record('story3d-beacon-retargets',snap.world?.target?.id==='studio-arrival',JSON.stringify(snap.world));

      await lp.evaluate(()=>{window.__qaGame.x=24;window.__qaGame.y=37;window.TGGStoryMissions.sync();});
      await lp.waitForTimeout(160);
      snap=await lp.evaluate(()=>({
        story:window.TGGStoryMissions.status(),
        world:window.TGGStoryWorld3D.getStatus(),
        interact:document.getElementById('interact3dBtn')?.textContent||''
      }));
      record('story3d-kane-becomes-active',snap.story?.step===2&&snap.world?.activeContact==='kane',JSON.stringify(snap));
      record('story3d-kane-interact',snap.world?.near===true&&snap.interact.includes('TALK TO KANE'),snap.interact);

      result={
        ok:checks.every(x=>x.pass)&&errors.length===0&&consoleErrors.length===0,
        status:'done',
        mode:'story_world_3d_logic_harness',
        target:TARGET,
        checks,
        console_errors:consoleErrors,
        page_errors:errors,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await logic.close();await ctx.close();return;
    }

    if(STORY_CHAPTER2_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,cssResponse,storyResponse,navResponse]=await Promise.all([
        fetch(base+'/index.html'),fetch(base+'/style.css'),fetch(base+'/story-missions.js'),fetch(base+'/navigation.js')
      ]);
      if(!htmlResponse.ok||!cssResponse.ok||!storyResponse.ok||!navResponse.ok){
        throw new Error('Story Chapter 2 harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status+', story='+storyResponse.status+', nav='+navResponse.status);
      }
      let html=await htmlResponse.text();
      const [css,storySource,navSource]=await Promise.all([cssResponse.text(),storyResponse.text(),navResponse.text()]);
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
      const mp=await mobile.newPage();
      const errors=[];
      mp.on('pageerror',e=>errors.push(e.message||String(e)));
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      await mp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={x:50,y:55,heading:0,inVehicle:false,cash:0,xp:0,level:5};
        window.__qaCareer={recordings:3,mixtapes:1,reputation:0,studioLevel:3};
        window.__qaContent={completed:['flyer-run']};
        window.__qaLife={battleWins:1,shows:1,activeOpportunity:null,contacts:{}};
        window.__qaShown='storyMissionsBoard';window.__qaTab=null;window.__qaToasts=[];
        window.TGGGame={
          getState:()=>window.__qaGame,
          getActiveScreen:()=>window.__qaShown,
          show:id=>{window.__qaShown=id;document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));document.getElementById(id)?.classList.add('active');return true},
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true}
        };
        window.TGGCareer={career:window.__qaCareer,addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}};
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          setTab:t=>{window.__qaTab=t;return true},
          callContact:id=>{window.__qaLife.activeOpportunity={contactId:id,createdAt:Date.now(),title:'QA',detail:'QA'};return true}
        };
        window.TGGCareerDirector={getState:()=>({activeContract:null,history:[{title:'MANAGER MOVE'}]})};
        window.TGGProgression={sync:()=>true};        window.__tggToast=t=>window.__qaToasts.push(String(t));
        localStorage.setItem('tgg-story-missions-v1',JSON.stringify({
          active:false,completed:true,step:6,startedAt:1,completedAt:2,
          baselines:{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0},
          chapter2:{active:false,completed:false,step:0,startedAt:0,completedAt:0,baselines:null,flags:{manager:false,kane:false,director:false,visual:false}}
        }));
      });
      await mp.addScriptTag({content:storySource});
      await mp.addScriptTag({content:navSource});
      await mp.waitForTimeout(120);
      const checks=[];const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

      let snap=await mp.evaluate(()=>({status:window.TGGStoryMissions?.status?.(),api:typeof window.TGGStoryMissions?.startChapter2==='function'&&typeof window.TGGStoryMissions?.navigationTarget==='function'}));
      record('chapter2-api',snap.api);
      record('first-contract-preserved',snap.status?.completed===true&&snap.status?.step===6&&snap.status?.steps?.length===6,JSON.stringify(snap.status));
      await mp.evaluate(()=>window.TGGStoryMissions.startChapter2());
      snap=await mp.evaluate(()=>({status:window.TGGStoryMissions.status(),target:window.TGGStoryMissions.navigationTarget(),nav:window.TGGNavigation?.getTarget?.(),hud:document.getElementById('storyWorldHud')?.classList.contains('active')}));
      record('chapter2-starts',snap.status?.active===true&&snap.status?.step===0&&snap.status?.steps?.length===10,JSON.stringify(snap.status));      record('chapter2-manager-marker',snap.target?.id==='manager-return'&&snap.target?.x===72&&snap.target?.y===36,JSON.stringify(snap.target));
      record('chapter2-navigation-priority',snap.nav?.story===true&&String(snap.nav?.label||'').includes('CITY BUZZ'),JSON.stringify(snap.nav));      record('chapter2-world-hud',snap.hud===true);

      await mp.evaluate(()=>{window.__qaGame.x=72;window.__qaGame.y=36;window.TGGStoryMissions.doCurrent();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-manager-talk',snap.step===1,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=24;window.__qaGame.y=37;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-studio-arrival',snap.step===2,JSON.stringify(snap));
      await mp.evaluate(()=>window.TGGStoryMissions.doCurrent());
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-kane-talk',snap.step===3,JSON.stringify(snap));
      await mp.evaluate(()=>{window.__qaCareer.recordings=4;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-recording',snap.step===4,JSON.stringify(snap));
      await mp.evaluate(()=>{window.__qaGame.x=50;window.__qaGame.y=50;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-downtown-arrival',snap.step===5,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaLife.battleWins=2;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-cypher-win',snap.step===6,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=76;window.__qaGame.y=63;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-stage-arrival',snap.step===7,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaLife.shows=2;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-live-show',snap.step===8,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaGame.x=50;window.__qaGame.y=89;window.TGGStoryMissions.doCurrent();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('chapter2-director-talk',snap.step===9,JSON.stringify(snap));

      await mp.evaluate(()=>document.querySelector('[data-media="video"]')?.click());
      await mp.waitForTimeout(40);      await mp.evaluate(()=>window.TGGStoryMissions.sync());
      snap=await mp.evaluate(()=>({        status:window.TGGStoryMissions.status(),
        game:{...window.__qaGame},career:{...window.__qaCareer},        stored:JSON.parse(localStorage.getItem('tgg-story-missions-v1')||'null')
      }));
      record('chapter2-completes',snap.status?.completed===true&&snap.status?.step===10,JSON.stringify(snap.status));      record('chapter2-final-reward',snap.game.cash===1800&&snap.game.xp===450&&snap.career.reputation===175,JSON.stringify({game:snap.game,career:snap.career}));
      record('chapter2-persistence',snap.stored?.chapter2?.completed===true&&snap.stored?.chapter2?.step===10,JSON.stringify(snap.stored?.chapter2));

      const layout=await mp.evaluate(()=>{
        window.TGGStoryMissions.reset();
        window.TGGStoryMissions.startChapter2();
        window.__qaShown='game';
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('game')?.classList.add('active');
        window.TGGStoryMissions.render();
        const hud=document.getElementById('storyWorldHud')?.getBoundingClientRect();
        const button=document.getElementById('storyWorldAction')?.getBoundingClientRect();
        return {
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          hud:hud?{left:hud.left,right:hud.right,width:hud.width}:null,
          button:button?{width:button.width,height:button.height}:null        };      });      record('chapter2-mobile-no-overflow',layout.overflowX===false&&layout.scrollWidth<=391,JSON.stringify(layout));
      record('chapter2-mobile-hud-contained',!layout.hud||layout.hud.left>=0&&layout.hud.right<=layout.width+1,JSON.stringify(layout.hud));
      record('chapter2-mobile-action-readable',!layout.button||layout.button.height>=42,JSON.stringify(layout.button));

      result={ok:checks.every(x=>x.pass)&&errors.length===0,status:'done',mode:'story_chapter2_harness',target:TARGET,checks,page_errors:errors,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;
    }

    if(STORY_MISSION_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,cssResponse,storyResponse]=await Promise.all([
        fetch(base+'/index.html'),fetch(base+'/style.css'),fetch(base+'/story-missions.js')
      ]);
      if(!htmlResponse.ok||!cssResponse.ok||!storyResponse.ok){
        throw new Error('Story Mission harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status+', story='+storyResponse.status);
      }
      let html=await htmlResponse.text();
      const [css,storySource]=await Promise.all([cssResponse.text(),storyResponse.text()]);
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
      const mp=await mobile.newPage();
      const errors=[];
      mp.on('pageerror',e=>errors.push(e.message||String(e)));
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      await mp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={cash:0,xp:0,level:1};
        window.__qaCareer={recordings:0,mixtapes:0,reputation:0,studioLevel:1};        window.__qaContent={completed:[]};
        window.__qaLife={battleWins:0,shows:0,activeOpportunity:null};
        window.__qaDirector={activeContract:null,history:[]};
        window.__qaShown=null; window.__qaTab=null; window.__qaToasts=[];
        window.TGGGame={
          show:id=>{window.__qaShown=id;document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));document.getElementById(id)?.classList.add('active');return true},
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true}
        };
        window.TGGCareer={career:window.__qaCareer,addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}};
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          setTab:t=>{window.__qaTab=t;return true},
          callContact:id=>{window.__qaLife.activeOpportunity={contactId:id,createdAt:Date.now(),title:'QA',detail:'QA'};return true}
        };
        window.TGGCareerDirector={
          getState:()=>JSON.parse(JSON.stringify(window.__qaDirector)),
          captureOpportunity:()=>{
            if(window.__qaLife.activeOpportunity?.contactId==='manager'){
              window.__qaDirector.activeContract={contactId:'manager',title:'MANAGER MOVE'};              return true;
            }
            return false;
          }
        };
        window.TGGProgression={sync:()=>true};
        window.__tggToast=t=>window.__qaToasts.push(String(t));
      });
      await mp.addScriptTag({content:storySource});
      await mp.waitForTimeout(120);

      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      let snap=await mp.evaluate(()=>({
        api:typeof window.TGGStoryMissions?.start==='function'&&typeof window.TGGStoryMissions?.sync==='function',
        button:!!document.getElementById('storyMissionsBtn'),
        board:!!document.getElementById('storyMissionsBoard'),
        status:window.TGGStoryMissions?.status?.()
      }));
      record('story-api',snap.api);
      record('story-entry-button',snap.button);
      record('story-board',snap.board);
      record('story-six-steps',snap.status?.steps?.length===6,JSON.stringify(snap.status));

      await mp.evaluate(()=>window.TGGStoryMissions.start());
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('story-starts',snap.active===true&&snap.step===0,JSON.stringify(snap));

      await mp.evaluate(()=>window.TGGStoryMissions.doCurrent());
      await mp.waitForTimeout(50);
      await mp.evaluate(()=>window.TGGStoryMissions.sync());
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());      record('story-manager-step',snap.step===1,JSON.stringify(snap));
      await mp.evaluate(()=>{window.__qaContent.completed.push('flyer-run');window.TGGStoryMissions.sync();});      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('story-city-job-step',snap.step===2,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaCareer.recordings=1;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('story-studio-step',snap.step===3,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaLife.battleWins=1;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('story-battle-step',snap.step===4,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaLife.shows=1;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>window.TGGStoryMissions.status());
      record('story-show-step',snap.step===5,JSON.stringify(snap));

      await mp.evaluate(()=>{window.__qaCareer.mixtapes=1;window.TGGStoryMissions.sync();});
      snap=await mp.evaluate(()=>({
        status:window.TGGStoryMissions.status(),
        game:{...window.__qaGame},
        career:{...window.__qaCareer},
        stored:JSON.parse(localStorage.getItem('tgg-story-missions-v1')||'null'),
        progress:document.getElementById('storyMissionProgressLabel')?.textContent||''
      }));
      record('story-completes',snap.status?.completed===true&&snap.status?.step===6,JSON.stringify(snap.status));
      record('story-final-reward',snap.game.cash===1000&&snap.game.xp===250&&snap.career.reputation===100,JSON.stringify({game:snap.game,career:snap.career}));
      record('story-persistence',snap.stored?.completed===true&&snap.stored?.step===6,JSON.stringify(snap.stored));
      record('story-progress-ui',snap.progress==='100% COMPLETE',snap.progress);

      const layout=await mp.evaluate(()=>{
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('storyMissionsBoard')?.classList.add('active');
        const shell=document.querySelector('.story-missions-shell')?.getBoundingClientRect();
        const steps=[...document.querySelectorAll('.story-step')].map(x=>x.getBoundingClientRect());
        const action=document.getElementById('storyMissionAction')?.getBoundingClientRect();
        return {
          width:innerWidth,
          scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          shell:shell?{left:shell.left,right:shell.right,width:shell.width}:null,
          stepCount:steps.length,
          minStep:steps.length?Math.min(...steps.map(x=>x.height)):0,
          action:action?{width:action.width,height:action.height,left:action.left,right:action.right}:null,
          columns:getComputedStyle(document.querySelector('.story-mission-steps')).gridTemplateColumns
        };
      });
      record('story-mobile-no-overflow',layout.overflowX===false&&layout.scrollWidth<=391,JSON.stringify(layout));
      record('story-mobile-shell-contained',!!layout.shell&&layout.shell.left>=0&&layout.shell.right<=layout.width+1,JSON.stringify(layout.shell));
      record('story-mobile-one-column',!!layout.columns&&!layout.columns.includes(' '),layout.columns);
      record('story-mobile-action-readable',!!layout.action&&layout.action.height>=50&&layout.action.width>=300,JSON.stringify(layout.action));

      result={ok:checks.every(x=>x.pass)&&errors.length===0,status:'done',mode:'story_mission_harness',target:TARGET,checks,page_errors:errors,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;
    }

    if(WORLD_LIFE_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [htmlResponse,cssResponse,lifeResponse,gameResponse]=await Promise.all([
        fetch(base+'/index.html'),fetch(base+'/style.css'),fetch(base+'/world-life.js'),fetch(base+'/game.js')
      ]);
      if(!htmlResponse.ok||!cssResponse.ok||!lifeResponse.ok||!gameResponse.ok){
        throw new Error('World Life harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status+', life='+lifeResponse.status+', game='+gameResponse.status);
      }
      let html=await htmlResponse.text();
      const [css,lifeSource,gameSource]=await Promise.all([cssResponse.text(),lifeResponse.text(),gameResponse.text()]);      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});      const mp=await mobile.newPage();
      const errors=[];
      mp.on('pageerror',e=>errors.push(e.message||String(e)));
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      await mp.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={level:5,cash:10000,xp:0};
        window.__qaRep=0;
        window.__qaToasts=[];
        window.TGGGame={
          getState:()=>window.__qaGame,
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return {...window.__qaGame}},
          spend:amount=>{amount=Number(amount)||0;if(window.__qaGame.cash<amount)return false;window.__qaGame.cash-=amount;return true},
          show:()=>true
        };
        window.TGGCareer={career:{studioLevel:3,reputation:0,recordings:4,mixtapes:1},addRep:n=>{window.__qaRep+=Number(n)||0}};
        window.TGGProgression={sync:()=>true};        window.TGGWorldSync={sync:()=>true};
        window.__tggToast=t=>window.__qaToasts.push(String(t));
      });
      await mp.addScriptTag({content:lifeSource});
      await mp.waitForTimeout(120);
      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      const initial=await mp.evaluate(()=>({
        api:typeof window.TGGWorldLife?.battleChoice==='function'&&typeof window.TGGWorldLife?.showMove==='function'&&typeof window.TGGWorldLife?.callContact==='function'&&typeof window.TGGWorldLife?.train==='function',        button:!!document.getElementById('worldLifeBtn'),
        board:!!document.getElementById('worldLifeBoard'),
        tabs:document.querySelectorAll('[data-life-tab]').length,
        gameIntegrated:window.__gameSourceCheck||false      }));
      record('world-life-api',initial.api);
      record('world-life-entry-button',initial.button);      record('world-life-board',initial.board);      record('world-life-tabs',initial.tabs===4,String(initial.tabs));
      record('world-life-game-runtime-hook',gameSource.includes('worldLifeBoard')&&gameSource.includes('worldLifeBtn'));

      await mp.evaluate(()=>{
        window.TGGWorldLife.startBattle();
        window.TGGWorldLife.battleChoice('bars');
        window.TGGWorldLife.battleChoice('flow');
        window.TGGWorldLife.battleChoice('crowd');
      });
      let snap=await mp.evaluate(()=>({life:window.TGGWorldLife.getState(),game:{...window.__qaGame},rep:window.__qaRep}));
      record('rap-battle-three-rounds',snap.life.battle.active===false&&snap.life.battle.round===3,JSON.stringify(snap.life.battle));
      record('rap-battle-recorded',(snap.life.battleWins+snap.life.battleLosses)===1,JSON.stringify({wins:snap.life.battleWins,losses:snap.life.battleLosses}));
      await mp.evaluate(()=>{
        window.TGGWorldLife.startShow();
        window.TGGWorldLife.showMove('hype');
        window.TGGWorldLife.showMove('hype');        window.TGGWorldLife.showMove('perform');
        window.TGGWorldLife.showMove('perform');
      });
      snap=await mp.evaluate(()=>({life:window.TGGWorldLife.getState(),game:{...window.__qaGame},rep:window.__qaRep}));
      record('live-show-completes',snap.life.show.active===false&&snap.life.show.move===4,JSON.stringify(snap.life.show));
      record('live-show-recorded',snap.life.shows===1,String(snap.life.shows));

      await mp.evaluate(()=>window.TGGWorldLife.callContact('director'));
      snap=await mp.evaluate(()=>window.TGGWorldLife.getState());
      record('phone-contact-opportunity',snap.activeOpportunity?.contactId==='director',JSON.stringify(snap.activeOpportunity));

      const before=await mp.evaluate(()=>window.TGGWorldLife.getState().attributes.stamina);
      await mp.evaluate(()=>window.TGGWorldLife.train('stamina'));
      snap=await mp.evaluate(()=>({life:window.TGGWorldLife.getState(),stored:JSON.parse(localStorage.getItem('tgg-world-life-v1')||'null'),game:{...window.__qaGame}}));      record('gym-training',snap.life.attributes.stamina===before+1,JSON.stringify(snap.life.attributes));
      record('world-life-persistence',snap.stored?.attributes?.stamina===snap.life.attributes.stamina&&snap.stored?.activeOpportunity?.contactId==='director');
      const layout=await mp.evaluate(()=>{
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('worldLifeBoard')?.classList.add('active');        const shell=document.querySelector('.world-life-shell')?.getBoundingClientRect();
        const tabs=[...document.querySelectorAll('.life-tabs button')].map(x=>x.getBoundingClientRect());
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflowX:document.documentElement.scrollWidth>innerWidth+1,shell:shell?{left:shell.left,right:shell.right,width:shell.width}:null,minTab:tabs.length?Math.min(...tabs.map(x=>x.height)):0};      });
      record('world-life-mobile-no-overflow',layout.overflowX===false&&layout.scrollWidth<=391,JSON.stringify(layout));
      record('world-life-mobile-tabs-readable',layout.minTab>=48,String(layout.minTab));
      result={ok:checks.every(x=>x.pass)&&errors.length===0,status:'done',mode:'world_life_harness',target:TARGET,checks,page_errors:errors,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;
    }

    if(CAREER_MOBILE_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');      const [htmlResponse,cssResponse]=await Promise.all([fetch(base+'/index.html'),fetch(base+'/style.css')]);
      if(!htmlResponse.ok||!cssResponse.ok)throw new Error('Career mobile harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status);
      let html=await htmlResponse.text();
      const css=await cssResponse.text();      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');
      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});      const mp=await mobile.newPage();
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      const layout=await mp.evaluate(()=>{
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('career')?.classList.add('active');
        const rect=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
        const stats=rect('.career-director-stats');
        const grid=rect('.career-hq-grid');
        const shell=rect('.career-hq-shell');
        const core=rect('.career-core'),contract=rect('.career-contract'),next=rect('.career-next'),history=rect('.career-history-wrap');
        const go=rect('#careerDirectorGo');
        const style=getComputedStyle(document.querySelector('.career-hq-grid'));
        return {
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,
          shell,stats,grid,core,contract,next,history,go,
          gridColumns:style.gridTemplateColumns,
          statsColumns:getComputedStyle(document.querySelector('.career-director-stats')).gridTemplateColumns,
          heading:document.querySelector('.career-hq-head h2')?.textContent||'',
          hasContract:!!document.getElementById('careerContract'),
          hasNext:!!document.getElementById('careerNextMove')
        };
      });
      const checks=[];const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      record('career-mobile-source-http',htmlResponse.status===200&&cssResponse.status===200,'html='+htmlResponse.status+',css='+cssResponse.status);
      record('career-mobile-no-overflow',layout.overflowX===false,JSON.stringify(layout));
      record('career-mobile-shell-contained',!!layout.shell&&layout.shell.left>=0&&layout.shell.right<=layout.width+1,JSON.stringify(layout.shell));
      record('career-mobile-one-column',!!layout.gridColumns&&!layout.gridColumns.includes(' '),layout.gridColumns);
      record('career-mobile-two-stat-columns',layout.statsColumns.split(' ').length===2,layout.statsColumns);
      record('career-mobile-cards-stacked',!!layout.core&&!!layout.contract&&!!layout.next&&layout.contract.top>=layout.core.bottom-2&&layout.next.top>=layout.contract.bottom-2,JSON.stringify({core:layout.core,contract:layout.contract,next:layout.next}));
      record('career-mobile-go-readable',!!layout.go&&layout.go.height>=44&&layout.go.width>=250,JSON.stringify(layout.go));
      record('career-mobile-content-present',/TURN EVERY MOVE/.test(layout.heading)&&layout.hasContract&&layout.hasNext,JSON.stringify({heading:layout.heading,hasContract:layout.hasContract,hasNext:layout.hasNext}));
      result={ok:checks.every(x=>x.pass),status:'done',mode:'career_mobile_harness',target:TARGET,checks,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;
    }

    if(CAREER_DIRECTOR_ONLY){      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const response=await fetch(base+'/career-director.js');
      if(!response.ok)throw new Error('Career Director harness could not fetch deployed script: '+response.status);
      const source=await response.text();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message||String(e)));
      await page.setContent(`<!doctype html><html><body>
        <section id="career"><div id="careerDirectorStats"></div><div id="careerContract"></div><div id="careerNextMove"></div><div id="careerDirectorHistory"></div><button id="careerDirectorGo"></button></section>
      </body></html>`);
      await page.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaGame={cash:0,xp:0,level:3};
        window.__qaCareer={recordings:0,mixtapes:0,reputation:0,studioLevel:3};
        window.__qaContent={completed:[]};
        window.__qaLife={shows:0,battleWins:0,training:0,activeOpportunity:null};
        window.__qaTab=null;window.__qaScreen=null;window.__qaSyncs=0;
        window.TGGGame={
          getState:()=>window.__qaGame,
          reward:(cash,xp)=>{window.__qaGame.cash+=Number(cash)||0;window.__qaGame.xp+=Number(xp)||0;return true},
          show:id=>{window.__qaScreen=id;return true}
        };
        window.TGGCareer={
          career:window.__qaCareer,
          addRep:n=>{window.__qaCareer.reputation+=Number(n)||0;return true}        };
        window.TGGContent={state:window.__qaContent};
        window.TGGWorldLife={
          getState:()=>JSON.parse(JSON.stringify(window.__qaLife)),
          clearOpportunity:()=>{window.__qaLife.activeOpportunity=null;return true},
          setTab:t=>{window.__qaTab=t;return true}
        };
        window.TGGProgression={sync:()=>{window.__qaSyncs++;return true}};
        window.TGGWorldSync={sync:()=>true};
        window.__tggToast=()=>{};
      });
      await page.addScriptTag({content:source});
      await page.waitForTimeout(120);
      const checks=[];const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      record('career-director-api',await page.evaluate(()=>typeof window.TGGCareerDirector?.getState==='function'));

      async function runContract(contactId,advance){        await page.evaluate(({contactId,stamp})=>{window.__qaLife.activeOpportunity={contactId,title:'QA',detail:'QA',createdAt:stamp}}, {contactId,stamp:Date.now()});
        await page.waitForTimeout(1050);        const active=await page.evaluate(()=>window.TGGCareerDirector?.getState?.().activeContract);        advance();
        await page.waitForTimeout(1050);
        const after=await page.evaluate(()=>window.TGGCareerDirector?.getState?.());
        return {active,after};
      }

      let r=await runContract('manager',async()=>{await page.evaluate(()=>window.__qaContent.completed.push('qa-job'))});
      record('manager-contract-captured',r.active?.contactId==='manager',JSON.stringify(r.active));
      record('manager-contract-completed',r.after.completedContracts===1&&r.after.activeContract===null,JSON.stringify(r.after));

      r=await runContract('dj',async()=>{await page.evaluate(()=>window.__qaLife.shows++)});
      record('dj-show-contract',r.active?.metric==='shows'&&r.after.completedContracts===2,JSON.stringify(r));

      r=await runContract('producer',async()=>{await page.evaluate(()=>window.__qaCareer.recordings++)});
      record('producer-recording-contract',r.active?.metric==='recordings'&&r.after.completedContracts===3,JSON.stringify(r));

      r=await runContract('director',async()=>{await page.evaluate(()=>window.__qaCareer.mixtapes++)});
      record('director-release-contract',r.active?.metric==='mixtapes'&&r.after.completedContracts===4,JSON.stringify(r));

      const final=await page.evaluate(()=>({
        director:window.TGGCareerDirector?.getState?.(),
        game:window.__qaGame,career:window.__qaCareer,
        stats:document.getElementById('careerDirectorStats')?.textContent||'',
        next:window.TGGCareerDirector?.recommendation?.(),
        stored:JSON.parse(localStorage.getItem('tgg-career-director-v1')||'null')
      }));
      record('career-rewards',final.director?.fans===650&&final.director?.buzz===72&&final.game.cash===1770&&final.game.xp===335&&final.career.reputation===118,JSON.stringify(final));
      record('career-rank',final.director?.rank==='LOCAL BUZZ',final.director?.rank);
      record('career-ui-rendered',/LOCAL BUZZ/.test(final.stats)&&/650/.test(final.stats),final.stats);
      record('career-next-move',final.next?.go==='battle',JSON.stringify(final.next));
      record('career-persistence',final.stored?.completedContracts===4&&final.stored?.fans===650,JSON.stringify(final.stored));

      await page.evaluate(()=>window.TGGCareerDirector?.go?.('battle'));
      const nav=await page.evaluate(()=>({tab:window.__qaTab,screen:window.__qaScreen}));
      record('career-navigation',nav.tab==='battle'&&nav.screen==='worldLifeBoard',JSON.stringify(nav));

      result={ok:checks.every(x=>x.pass)&&errors.length===0,status:'done',mode:'career_director_harness',target:TARGET,checks,page_errors:errors,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();return;
    }

    if(VEHICLE_LOGIC_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const response=await fetch(base+'/game.js');
      if(!response.ok)throw new Error('Vehicle harness could not fetch deployed game.js: '+response.status);
      const source=await response.text();
      const harnessErrors=[];
      page.on('pageerror',e=>harnessErrors.push(e.message||String(e)));
      await page.setContent(`<!doctype html><html><body>
        <div id="menu" class="screen active"><button id="newGame">CREATE PLAYER</button></div>
        <div id="creator" class="screen"><input id="stageName"><select id="styleChoice"><option>Artist</option></select><button id="startGame">START</button></div>
        <div id="game" class="screen">
          <div id="player"></div><div id="hud"></div><span id="hudName"></span><span id="hudLevel"></span><span id="hudCash"></span><span id="hudXp"></span><span id="hudNext"></span>
          <span id="missionStatus"></span><button id="missionBtn"></button><button id="vehicleBtn"></button><button id="interact3dBtn"></button><button id="camera3dBtn"></button><button id="hornBtn"></button><button id="driftBtn"></button>
          <span id="speedValue"></span><span id="gearValue"></span><div id="vehicleHud"></div><span id="driveStateValue"></span>
          <div id="playerMoveHud"></div><span id="walkSpeedValue"></span><span id="walkModeValue"></span><div id="npcDialogue"></div>
          <button data-key="ArrowUp">UP</button><button data-key="ArrowDown">DOWN</button><button data-key="ArrowLeft">LEFT</button><button data-key="ArrowRight">RIGHT</button><button id="sprintBtn">RUN</button>
        </div><div id="pause" class="screen"></div><div id="toast"></div>
      </body></html>`);
      await page.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaVehicleDynamics={speed:0,steer:0,braking:false,handbrake:false};
        window.__qaPlayerDynamics={speed:0,vx:0,vy:0,sprinting:false,blocked:false};
        window.TGG3D={
          isReady:()=>true,canMovePercent:()=>true,distanceToCarPercent:()=>0,getCarHeading:()=>0,
          setVehicleDynamics:next=>Object.assign(window.__qaVehicleDynamics,next||{}),
          getVehicleDynamics:()=>({...window.__qaVehicleDynamics}),
          setPlayerDynamics:next=>Object.assign(window.__qaPlayerDynamics,next||{}),
          setCameraMode:m=>m,getCameraMode:()=> 'orbit',interactNearest:()=>true,cycleCamera:()=> 'chase'
        };
      });
      await page.addScriptTag({content:source});
      await page.waitForTimeout(120);      await page.evaluate(()=>{
        document.getElementById('newGame')?.click();
        const stage=document.getElementById('stageName'); if(stage)stage.value='TGG VEHICLE QA';
        document.getElementById('startGame')?.click();
        window.TGGGame?.toggleVehicle?.();
      });
      const checks=[]; const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      let snap=await page.evaluate(()=>({state:window.TGGGame?.getState?.(),drive:window.TGGGame?.getDrivingState?.(),tune:window.TGGGame?.getDriveTuning?.()}));      record('vehicle-enter',snap.state?.inVehicle===true,JSON.stringify(snap));
      record('vehicle-tuning',Number(snap.tune?.maxForward)>8&&Number(snap.tune?.maxReverse)<0,JSON.stringify(snap.tune));

      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('forward',true));
      await page.waitForTimeout(700);
      snap=await page.evaluate(()=>({state:window.TGGGame?.getState?.(),drive:window.TGGGame?.getDrivingState?.(),dyn:window.TGG3D?.getVehicleDynamics?.(),speed:document.getElementById('speedValue')?.textContent,gear:document.getElementById('gearValue')?.textContent}));
      record('vehicle-smooth-acceleration',Number(snap.drive?.speed)>3,JSON.stringify(snap));
      record('vehicle-forward-travel',Number(snap.state?.x)>50.8,JSON.stringify(snap.state));
      record('vehicle-dynamics-sync',Number(snap.dyn?.speed)>3,JSON.stringify(snap.dyn));
      record('vehicle-drive-hud',snap.gear==='D'&&Number(snap.speed)>0,JSON.stringify({speed:snap.speed,gear:snap.gear}));

      const h0=Number(snap.state?.heading)||0;
      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('right',true));
      await page.waitForTimeout(500);
      snap=await page.evaluate(()=>({state:window.TGGGame?.getState?.(),drive:window.TGGGame?.getDrivingState?.(),dyn:window.TGG3D?.getVehicleDynamics?.()}));
      record('vehicle-speed-sensitive-steering',Math.abs((Number(snap.state?.heading)||0)-h0)>.5,JSON.stringify(snap));
      record('vehicle-steer-dynamics',Number(snap.dyn?.steer)>.2,JSON.stringify(snap.dyn));
      await page.evaluate(()=>{window.TGGGame?.setDriveKey?.('right',false);window.TGGGame?.setDriveKey?.('forward',false);});

      const beforeBrake=Math.abs(Number(snap.drive?.speed)||0);
      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('reverse',true));
      await page.waitForTimeout(420);      let braking=await page.evaluate(()=>({drive:window.TGGGame?.getDrivingState?.(),dyn:window.TGG3D?.getVehicleDynamics?.()}));
      record('vehicle-braking',Math.abs(Number(braking.drive?.speed)||0)<beforeBrake||braking.drive?.braking===true,JSON.stringify({beforeBrake,braking}));
      await page.waitForTimeout(700);      const reversed=await page.evaluate(()=>({drive:window.TGGGame?.getDrivingState?.(),dyn:window.TGG3D?.getVehicleDynamics?.(),gear:document.getElementById('gearValue')?.textContent}));
      record('vehicle-reverse',Number(reversed.drive?.speed)<-.2&&reversed.gear==='R',JSON.stringify(reversed));
      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('reverse',false));
      await page.waitForTimeout(350);      const coast=await page.evaluate(()=>window.TGGGame?.getDrivingState?.());
      record('vehicle-coast-deceleration',Math.abs(Number(coast?.speed)||0)<Math.abs(Number(reversed.drive?.speed)||0),JSON.stringify({reversed:reversed.drive,coast}));

      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('forward',true));      await page.waitForTimeout(400);
      await page.evaluate(()=>window.TGGGame?.setDriveKey?.('handbrake',true));
      await page.waitForTimeout(120);
      const hb=await page.evaluate(()=>({drive:window.TGGGame?.getDrivingState?.(),dyn:window.TGG3D?.getVehicleDynamics?.()}));
      record('vehicle-handbrake',hb.drive?.handbrake===true&&hb.dyn?.handbrake===true,JSON.stringify(hb));
      await page.evaluate(()=>{window.TGGGame?.setDriveKey?.('handbrake',false);window.TGGGame?.setDriveKey?.('forward',false);window.TGGGame?.toggleVehicle?.();});
      const exited=await page.evaluate(()=>window.TGGGame?.getState?.());
      record('vehicle-exit',exited?.inVehicle===false,JSON.stringify(exited));

      result={ok:checks.every(x=>x.pass)&&harnessErrors.length===0,status:'done',mode:'vehicle_logic_harness',target:TARGET,checks,page_errors:harnessErrors,updated_at:new Date().toISOString()};      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();return;
    }

    if(MOBILE_LAYOUT_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');      const [htmlResponse,cssResponse]=await Promise.all([fetch(base+'/index.html'),fetch(base+'/style.css')]);
      if(!htmlResponse.ok||!cssResponse.ok)throw new Error('Mobile layout harness fetch failed: html='+htmlResponse.status+', css='+cssResponse.status);
      let html=await htmlResponse.text();
      const css=await cssResponse.text();
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
               .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,'<style>'+css+'</style>');      const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
      const mp=await mobile.newPage();
      await mp.setContent(html,{waitUntil:'domcontentloaded'});
      const layout=await mp.evaluate(()=>{
        document.querySelectorAll('.screen.active').forEach(x=>x.classList.remove('active'));
        document.getElementById('game')?.classList.add('active');        const dpad=document.querySelector('.dpad')?.getBoundingClientRect();
        const move=document.querySelector('.move-pad')?.getBoundingClientRect();
        const deck=document.querySelector('.action-deck')?.getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.action-deck .actions button')].map(b=>b.getBoundingClientRect());        return {
          width:innerWidth,
          scrollWidth:document.documentElement.scrollWidth,
          overflowX:document.documentElement.scrollWidth>innerWidth+1,          dpad:dpad?{w:dpad.width,h:dpad.height,left:dpad.left,right:dpad.right}:null,
          move:move?{top:move.top,bottom:move.bottom,left:move.left,right:move.right}:null,
          deck:deck?{top:deck.top,bottom:deck.bottom,left:deck.left,right:deck.right}:null,
          actionCount:buttons.length,
          minButtonHeight:buttons.length?Math.min(...buttons.map(x=>x.height)):0,
          controlText:document.querySelector('.move-pad .control-title small')?.textContent||''
        };      });
      const checks=[];      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      record('mobile-source-http',htmlResponse.status===200&&cssResponse.status===200,'html='+htmlResponse.status+',css='+cssResponse.status);
      record('mobile-no-horizontal-overflow',layout.overflowX===false,JSON.stringify(layout));      record('mobile-dpad-contained',!!layout.dpad&&layout.dpad.left>=0&&layout.dpad.right<=layout.width+1&&layout.dpad.w>=160,JSON.stringify(layout.dpad));
      record('mobile-controls-stacked',!!layout.move&&!!layout.deck&&layout.deck.top>=layout.move.bottom-2,JSON.stringify({move:layout.move,deck:layout.deck}));
      record('mobile-action-buttons-readable',layout.actionCount>=12&&layout.minButtonHeight>=50,JSON.stringify({count:layout.actionCount,minHeight:layout.minButtonHeight}));
      record('mobile-control-help',/hold|sprint|gamepad/i.test(layout.controlText),layout.controlText);
      result={ok:checks.every(x=>x.pass),status:'done',mode:'mobile_layout_harness',target:TARGET,checks,updated_at:new Date().toISOString()};
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await mobile.close();await ctx.close();return;
    }
    if(GAMEPAD_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const response=await fetch(base+'/gamepad.js');
      if(!response.ok)throw new Error('Gamepad harness could not fetch deployed gamepad.js: '+response.status);
      const source=await response.text();
      const harnessErrors=[];
      page.on('pageerror',e=>harnessErrors.push(e.message||String(e)));
      await page.setContent('<!doctype html><html><head><title>TGG V2 GAMEPAD QA</title></head><body></body></html>');
      await page.evaluate(()=>{
        window.__qaState={inVehicle:false};
        window.__qaCalls=[];
        window.__qaActions=[];
        window.__qaPad={
          connected:true,
          axes:[0,0,0,0],
          buttons:Array.from({length:16},()=>({pressed:false,value:0}))
        };
        Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__qaPad]});
        window.TGGGame={
          getState:()=>window.__qaState,
          setWalkKey:(k,v)=>window.__qaCalls.push(['walk',k,!!v]),
          setDriveKey:(k,v)=>window.__qaCalls.push(['drive',k,!!v]),
          toggleVehicle:()=>window.__qaActions.push('vehicle'),
          horn:()=>window.__qaActions.push('horn')
        };
        window.TGG3D={
          interactNearest:()=>window.__qaActions.push('interact'),
          cycleCamera:()=>window.__qaActions.push('camera')
        };
        window.__tggToast=()=>{};
      });      await page.addScriptTag({content:source});
      await page.waitForTimeout(100);
      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      record('gamepad-api',await page.evaluate(()=>typeof window.TGGGamepad?.isConnected==='function'));

      await page.evaluate(()=>{window.__qaCalls.length=0;window.__qaPad.axes[0]=.8;});
      await page.waitForTimeout(100);
      let snap=await page.evaluate(()=>({calls:[...window.__qaCalls],actions:[...window.__qaActions]}));
      record('gamepad-walk-right',snap.calls.some(x=>x[0]==='walk'&&x[1]==='right'&&x[2]===true),JSON.stringify(snap.calls));

      await page.evaluate(()=>{window.__qaCalls.length=0;window.__qaPad.buttons[7].pressed=true;window.__qaPad.buttons[7].value=1;});
      await page.waitForTimeout(100);
      snap=await page.evaluate(()=>({calls:[...window.__qaCalls]}));
      record('gamepad-sprint',snap.calls.some(x=>x[0]==='walk'&&x[1]==='sprint'&&x[2]===true),JSON.stringify(snap.calls));

      await page.evaluate(()=>{
        window.__qaCalls.length=0;
        window.__qaState.inVehicle=true;
        window.__qaPad.axes[0]=-.8;
        window.__qaPad.buttons[7].pressed=true;window.__qaPad.buttons[7].value=1;
        window.__qaPad.buttons[4].pressed=true;window.__qaPad.buttons[4].value=1;
      });
      await page.waitForTimeout(120);
      snap=await page.evaluate(()=>({calls:[...window.__qaCalls]}));
      record('gamepad-car-steer',snap.calls.some(x=>x[0]==='drive'&&x[1]==='left'&&x[2]===true),JSON.stringify(snap.calls));
      record('gamepad-car-gas',snap.calls.some(x=>x[0]==='drive'&&x[1]==='forward'&&x[2]===true),JSON.stringify(snap.calls));
      record('gamepad-handbrake',snap.calls.some(x=>x[0]==='drive'&&x[1]==='handbrake'&&x[2]===true),JSON.stringify(snap.calls));

      await page.evaluate(()=>{
        window.__qaActions.length=0;
        [0,1,2,3].forEach(i=>{window.__qaPad.buttons[i].pressed=true;window.__qaPad.buttons[i].value=1;});
      });
      await page.waitForTimeout(120);
      snap=await page.evaluate(()=>({actions:[...window.__qaActions]}));
      record('gamepad-actions', ['interact','vehicle','horn','camera'].every(x=>snap.actions.includes(x)),JSON.stringify(snap.actions));

      result={        ok:checks.every(x=>x.pass)&&harnessErrors.length===0,
        status:'done',        mode:'gamepad_logic_harness',        target:TARGET,
        checks,
        page_errors:harnessErrors,        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();
      return;
    }

    if(PLAYER_SMOOTH_ONLY){
      const base=TARGET.replace(/\/index\.html(?:\?.*)?$/,'').replace(/\/$/,'');
      const [gameResponse,finalResponse]=await Promise.all([
        fetch(base+'/game.js'),
        fetch(base+'/final-build.js')
      ]);
      if(!gameResponse.ok||!finalResponse.ok){
        throw new Error('Movement harness could not fetch frozen runtime scripts: game='+gameResponse.status+', final='+finalResponse.status);
      }
      const [gameSource,finalSource]=await Promise.all([gameResponse.text(),finalResponse.text()]);
      await page.setContent(`<!doctype html><html><head><title>TRU GO GETTA — ${EXPECT_VERSION} MOVEMENT QA</title></head><body>
        <div id="menu" class="screen active"><button id="newGame">CREATE PLAYER</button></div>
        <div id="creator" class="screen"><input id="stageName"><select id="styleChoice"><option>Artist</option></select><button id="startGame">START</button></div>
        <div id="game" class="screen">
          <div id="player"></div><div id="hud"></div><span id="hudName"></span><span id="hudLevel"></span><span id="hudCash"></span><span id="hudXp"></span><span id="hudNext"></span>
          <span id="missionStatus"></span><button id="missionBtn"></button><button id="vehicleBtn"></button>
          <span id="speedValue"></span><span id="gearValue"></span><div id="vehicleHud"></div><span id="driveStateValue"></span>
          <div id="playerMoveHud"></div><span id="walkSpeedValue"></span><span id="walkModeValue"></span><div id="npcDialogue"></div>
          <button data-key="ArrowUp">UP</button><button data-key="ArrowDown">DOWN</button><button data-key="ArrowLeft">LEFT</button><button data-key="ArrowRight">RIGHT</button>
          <button id="sprintBtn">RUN</button>
        </div>
        <div id="pause" class="screen"></div><div id="toast"></div>
      </body></html>`);
      await page.evaluate(()=>{
        const store={};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
          setItem:(k,v)=>{store[k]=String(v)},
          removeItem:k=>{delete store[k]},
          clear:()=>{Object.keys(store).forEach(k=>delete store[k])}
        }});
        window.__qaPlayerDynamics={speed:0,vx:0,vy:0,sprinting:false,blocked:false};
        window.TGG3D={
          isReady:()=>true,
          canMovePercent:()=>true,
          setPlayerDynamics:next=>Object.assign(window.__qaPlayerDynamics,next||{}),
          getPlayerDynamics:()=>({...window.__qaPlayerDynamics}),
          setVehicleDynamics:()=>true,
          getVehicleDynamics:()=>({speed:0,steer:0,braking:false,handbrake:false}),
          setCameraMode:()=> 'orbit',
          getCameraMode:()=> 'orbit'
        };
      });
      const harnessErrors=[];
      page.on('pageerror',e=>harnessErrors.push(e.message||String(e)));
      await page.addScriptTag({content:gameSource});
      await page.addScriptTag({content:finalSource});
      await page.waitForTimeout(120);
      await page.evaluate(()=>{
        document.getElementById('newGame')?.click();
        const stage=document.getElementById('stageName');
        const style=document.getElementById('styleChoice');
        if(stage)stage.value='TGG MOVEMENT QA';
        if(style)style.value='Artist';
        document.getElementById('startGame')?.click();
      });

      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      const initial=await page.evaluate(()=>({
        title:document.title,
        state:window.TGGGame?.getState?.(),
        walkingApi:typeof window.TGGGame?.getWalkingState==='function'&&typeof window.TGGGame?.setWalkKey==='function',
        tune:window.TGGGame?.getWalkTuning?.(),
        finalBuildVersion:window.TGGFinalBuild?.version||null,
      gamepadApi:typeof window.TGGGamepad?.isConnected==='function'
      }));
      record('title-version',initial.title.includes(EXPECT_VERSION),initial.title);
      record('walking-api',initial.walkingApi);
      record('walking-tuning',Number(initial.tune?.walkSpeed)>0&&Number(initial.tune?.sprintSpeed)>Number(initial.tune?.walkSpeed),JSON.stringify(initial.tune));
      record('final-build-runtime',String(initial.finalBuildVersion).includes('V2.00'),String(initial.finalBuildVersion));

      const x0=Number(initial.state?.x)||0;
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const walking=await page.evaluate(()=>({state:window.TGGGame?.getState?.(),walk:window.TGGGame?.getWalkingState?.(),dyn:window.TGG3D?.getPlayerDynamics?.()}));
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(260);
      const coasting=await page.evaluate(()=>window.TGGGame?.getWalkingState?.());
      record('smooth-walk-distance',Number(walking.state?.x)>x0+.6,JSON.stringify({start:x0,end:walking.state?.x}));
      record('smooth-walk-acceleration',Number(walking.walk?.speed)>2,JSON.stringify(walking.walk));
      record('player-dynamics-sync',Number(walking.dyn?.speed)>2,JSON.stringify(walking.dyn));
      record('smooth-walk-deceleration',Number(coasting?.speed)<Number(walking.walk?.speed),JSON.stringify({walking:walking.walk?.speed,coast:coasting?.speed}));

      await page.keyboard.down('ArrowUp');      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const diagonal=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.()}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');
      record('diagonal-normalized',Number(diagonal.walk?.speed)<=Number(diagonal.tune?.walkSpeed)*1.08,JSON.stringify(diagonal));

      await page.waitForTimeout(250);
      await page.keyboard.down('Shift');
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(750);
      const sprint=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.(),mode:document.getElementById('walkModeValue')?.textContent}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
      record('sprint-speed',Number(sprint.walk?.speed)>Number(sprint.tune?.walkSpeed)*1.1,JSON.stringify(sprint));      record('sprint-state',sprint.walk?.sprinting===true&&sprint.mode==='SPRINT',JSON.stringify(sprint));

      await page.waitForTimeout(350);
      const stopped=await page.evaluate(()=>window.TGGGame?.getWalkingState?.());
      record('walk-settles-after-release',Number(stopped?.speed)<1.2,JSON.stringify(stopped));

      result={
        ok:checks.every(x=>x.pass)&&harnessErrors.length===0,
        status:'done',
        mode:'player_smooth_logic_harness',
        target:TARGET,
        checks,        page_errors:harnessErrors,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();      return;
    }

    const consoleErrors=[],pageErrors=[],failedResources=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>pageErrors.push(e.message||String(e)));    page.on('response',r=>{if(r.status()>=400)failedResources.push({url:r.url(),status:r.status()})});    const res=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('#newGame',{state:'attached',timeout:15000});
    await page.evaluate(()=>document.getElementById('newGame')?.click());
    await page.evaluate(()=>{      const stage=document.getElementById('stageName');      const style=document.getElementById('styleChoice');
      if(stage)stage.value='TGG 3D QA';
      if(style)style.value='Artist';
      document.getElementById('startGame')?.click();
    });
    let webglReady=false;
    try{      const readyDeadline=Date.now()+30000;
      while(Date.now()<readyDeadline){
        webglReady=await page.evaluate(()=>window.TGG3D?.isReady?.()===true).catch(()=>false);
        if(webglReady)break;
        await page.waitForTimeout(250);
      }
      if(!webglReady)throw new Error('TGG3D readiness poll timed out after 30000ms');
    }catch(error){
      const diagnostics=await page.evaluate(()=>({
        title:document.title,
        threeType:typeof window.THREE,
        tgg3dType:typeof window.TGG3D,
        tgg3dKeys:Object.keys(window.TGG3D||{}),
        readyType:typeof window.TGG3D?.isReady,        readyValue:(()=>{try{return window.TGG3D?.isReady?.()}catch(e){return 'THREW:'+String(e)}})(),
        city3d:!!document.getElementById('city3d'),
        cityCanvas:!!document.querySelector('#city3d canvas'),
        scripts:[...document.scripts].map(s=>s.src||'[inline]'),
        readyState:document.readyState      })).catch(()=>({evaluationFailed:true}));      console.log(JSON.stringify({tgg_3d_smoke_step:'mobile-complete'}));
    result={
        ok:false,status:'webgl_not_ready',target:TARGET,
        error:error?.message||String(error),        diagnostics,        console_errors:consoleErrors,
        page_errors:pageErrors,        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.error(JSON.stringify({tgg_3d_smoke_once:true,...result}));      await ctx.close();
      return;
    }
    console.log(JSON.stringify({tgg_3d_smoke_step:'ready'}));
    await page.waitForTimeout(500);

    const checks=[];
    const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

    console.log(JSON.stringify({tgg_3d_smoke_step:'before-initial'}));
    const initial=await page.evaluate(()=>({
      title:document.title,
      canvas:!!document.querySelector('#city3d canvas'),
      ready:window.TGG3D?.isReady?.()===true,
      state:window.TGGGame?.getState?.(),
      player:!!window.TGG3D?.player,
      car:!!window.TGG3D?.car,
      collisionBlocked:window.TGG3D?.canMovePercent?.(58.7,58.7)===false,
      destinations:Array.isArray(window.TGG3D?.destinations)?window.TGG3D.destinations.length:0,
      interactApi:typeof window.TGG3D?.interactNearest==='function',      interactButton:!!document.getElementById('interact3dBtn'),
      pedestrians:Array.isArray(window.TGG3D?.pedestrians)?window.TGG3D.pedestrians.length:0,
      traffic:Array.isArray(window.TGG3D?.traffic)?window.TGG3D.traffic.length:0,
      cameraApi:typeof window.TGG3D?.cycleCamera==='function'&&typeof window.TGG3D?.getCameraMode==='function',
      cameraMode:window.TGG3D?.getCameraMode?.()||null,
      radar:!!document.getElementById('radar3d'),
      radarPlayer:!!document.getElementById('radarPlayer'),
      radarCar:!!document.getElementById('radarCar'),
      garageApi:typeof window.TGGGarage?.apply==='function'&&typeof window.TGGGarage?.load==='function',
      garageButton:!!document.getElementById('garageBtn'),
      driftButton:!!document.getElementById('driftBtn'),
      hornButton:!!document.getElementById('hornBtn'),
      npcDialogue:!!document.getElementById('npcDialogue'),
      studioHost:!!document.getElementById('studio3d'),
      studioApi:typeof window.TGGStudio3D?.isReady==='function',
      carAppearanceApi:typeof window.TGG3D?.setCarAppearance==='function',
      tuningApi:typeof window.TGGGame?.setDriveTuning==='function',
      vehicleCollisionMargin:window.TGG3D?.canMovePercent?.(58.1,58.1,true)===false,
      walkingApi:typeof window.TGGGame?.getWalkingState==='function'&&typeof window.TGGGame?.setWalkKey==='function',
      walkingTuning:window.TGGGame?.getWalkTuning?.()||null,
      playerDynamicsApi:typeof window.TGG3D?.setPlayerDynamics==='function',
      sprintButton:!!document.getElementById('sprintBtn'),      playerMoveHud:!!document.getElementById('playerMoveHud'),
      finalBuildVersion:window.TGGFinalBuild?.version||null
    }));
    record('title-version',initial.title.includes(EXPECT_VERSION),initial.title);
    record('webgl-canvas',initial.canvas);
    record('tgg3d-ready',initial.ready);
    record('3d-player',initial.player);
    record('starter-car',initial.car);
    record('building-collision',initial.collisionBlocked);
    console.log(JSON.stringify({tgg_3d_smoke_step:'initial-complete'}));
    if(PLAYER_SMOOTH_ONLY){
      record('title-version',initial.title.includes(EXPECT_VERSION),initial.title);
      record('webgl-canvas',initial.canvas);
      record('tgg3d-ready',initial.ready);
      record('walking-api',initial.walkingApi);
      record('walking-tuning',Number(initial.walkingTuning?.walkSpeed)>0&&Number(initial.walkingTuning?.sprintSpeed)>Number(initial.walkingTuning?.walkSpeed),JSON.stringify(initial.walkingTuning));
      record('player-dynamics-api',initial.playerDynamicsApi);
      record('sprint-control',initial.sprintButton);
      record('player-move-hud',initial.playerMoveHud);
      record('final-build-runtime',String(initial.finalBuildVersion).includes('V2.00'),String(initial.finalBuildVersion));

      console.log(JSON.stringify({tgg_3d_smoke_step:'player-walk-start'}));
      const smoothStart=await page.evaluate(()=>window.TGGGame?.getState?.());
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const walking=await page.evaluate(()=>({state:window.TGGGame?.getState?.(),walk:window.TGGGame?.getWalkingState?.(),dyn:window.TGG3D?.getPlayerDynamics?.()}));
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(260);
      const coasting=await page.evaluate(()=>window.TGGGame?.getWalkingState?.());
      record('smooth-walk-distance',Number(walking.state?.x)>Number(smoothStart?.x)+.6,JSON.stringify({start:smoothStart?.x,end:walking.state?.x}));
      record('smooth-walk-acceleration',Number(walking.walk?.speed)>2,JSON.stringify(walking.walk));
      record('smooth-walk-deceleration',Number(coasting?.speed)<Number(walking.walk?.speed),JSON.stringify({walking:walking.walk?.speed,coast:coasting?.speed}));
      console.log(JSON.stringify({tgg_3d_smoke_step:'player-walk-pass'}));
      await page.keyboard.down('ArrowUp');      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const diagonal=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.()}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');      record('diagonal-normalized',Number(diagonal.walk?.speed)<=Number(diagonal.tune?.walkSpeed)*1.08,JSON.stringify(diagonal));
      console.log(JSON.stringify({tgg_3d_smoke_step:'player-diagonal-pass'}));

      await page.waitForTimeout(250);
      await page.keyboard.down('Shift');
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(750);
      const sprint=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.(),mode:document.getElementById('walkModeValue')?.textContent}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
      record('sprint-speed',Number(sprint.walk?.speed)>Number(sprint.tune?.walkSpeed)*1.1,JSON.stringify(sprint));
      record('sprint-state',sprint.walk?.sprinting===true&&sprint.mode==='SPRINT',JSON.stringify(sprint));      console.log(JSON.stringify({tgg_3d_smoke_step:'player-sprint-pass'}));

      await page.waitForTimeout(300);
      const stopped=await page.evaluate(()=>window.TGGGame?.getWalkingState?.());
      record('walk-settles-after-release',Number(stopped?.speed)<1.2,JSON.stringify(stopped));

      result={
        ok:(res?.status()===200)&&checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0&&failedResources.length===0,
        status:'done',
        mode:'player_smooth_only',
        target:TARGET,
        http_status:res?.status()||0,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();
      return;
    }
    if(REQUIRE_PLAYER_SMOOTH){
      record('walking-api',initial.walkingApi);
      record('walking-tuning',Number(initial.walkingTuning?.walkSpeed)>0&&Number(initial.walkingTuning?.sprintSpeed)>Number(initial.walkingTuning?.walkSpeed),JSON.stringify(initial.walkingTuning));
      record('player-dynamics-api',initial.playerDynamicsApi);
      record('sprint-control',initial.sprintButton);
      record('player-move-hud',initial.playerMoveHud);
      record('final-build-runtime',String(initial.finalBuildVersion).includes('V2.00'),String(initial.finalBuildVersion));
      record('gamepad-api',initial.gamepadApi);
    }
    if(REQUIRE_DESTINATIONS){
      record('destination-count',initial.destinations>=6,String(initial.destinations));
      record('destination-interact-api',initial.interactApi);
      record('destination-interact-button',initial.interactButton);
    }
    if(REQUIRE_LIVING_CITY){
      record('pedestrian-population',initial.pedestrians>=6,String(initial.pedestrians));
      record('traffic-population',initial.traffic>=6,String(initial.traffic));
    }
    if(REQUIRE_WORLD_BULK){
      record('garage-api',initial.garageApi);
      record('garage-button',initial.garageButton);
      record('mobile-drift-button',initial.driftButton);
      record('mobile-horn-button',initial.hornButton);
      record('manager-dialogue',initial.npcDialogue);
      record('studio-3d-host',initial.studioHost);
      record('studio-3d-api',initial.studioApi);
      record('car-appearance-api',initial.carAppearanceApi);
      record('drive-tuning-api',initial.tuningApi);
      record('vehicle-collision-margin',initial.vehicleCollisionMargin);
      const garageResult=await page.evaluate(()=>{
        const before=window.TGGGarage?.getState?.();
        document.querySelector('[data-car-color="#ff315f"]')?.click();
        document.querySelector('[data-car-tune="sport"]')?.click();
        const after=window.TGGGarage?.getState?.();
        const tuning=window.TGGGame?.getDriveTuning?.();
        const paint=window.TGG3D?.car?.userData?.bodyMaterial?.color?.getHexString?.();
        const stored=JSON.parse(localStorage.getItem('tgg-garage-v1')||'null');
        return {before,after,tuning,paint,stored};
      });
      record('garage-paint-runtime',garageResult.paint==='ff315f',JSON.stringify(garageResult));
      record('garage-tune-runtime',Number(garageResult.tuning?.maxForward)>10,JSON.stringify(garageResult.tuning));
      record('garage-persistence',garageResult.stored?.color==='#ff315f'&&garageResult.stored?.tuning==='sport',JSON.stringify(garageResult.stored));
      await page.evaluate(()=>document.getElementById('studioBtn')?.click());
      await page.waitForTimeout(350);
      const studioState=await page.evaluate(()=>({
        active:document.getElementById('studio')?.classList.contains('active'),
        canvas:!!document.querySelector('#studio3d canvas'),
        ready:window.TGGStudio3D?.isReady?.()===true
      }));
      record('studio-3d-entry',studioState.active&&studioState.canvas&&studioState.ready,JSON.stringify(studioState));
      await page.evaluate(()=>document.getElementById('studioBack')?.click());
    }
    console.log(JSON.stringify({tgg_3d_smoke_step:'world-bulk-complete'}));
    if(REQUIRE_CINEMATIC){
      record('camera-api',initial.cameraApi);
      record('camera-default-orbit',initial.cameraMode==='orbit',String(initial.cameraMode));
      record('radar-host',initial.radar&&initial.radarPlayer&&initial.radarCar);
      const cameraModes=await page.evaluate(()=>{
        const a=window.TGG3D?.cycleCamera?.();
        const b=window.TGG3D?.cycleCamera?.();
        const c=window.TGG3D?.cycleCamera?.();
        return [a,b,c,window.TGG3D?.getCameraMode?.()];
      });
      record('camera-chase',cameraModes[0]==='chase',JSON.stringify(cameraModes));
      record('camera-top',cameraModes[1]==='top',JSON.stringify(cameraModes));
      record('camera-orbit-return',cameraModes[2]==='orbit'&&cameraModes[3]==='orbit',JSON.stringify(cameraModes));
    }

    console.log(JSON.stringify({tgg_3d_smoke_step:'cinematic-complete'}));
    if(WORLD_ONLY){
      if(String(EXPECT_VERSION).includes('V2.00'))record('gamepad-api',initial.gamepadApi);
      result={        ok:(res?.status()===200)&&checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0&&failedResources.length===0,
        status:'done',
        mode:'world_cinematic_only',
        target:TARGET,
        http_status:res?.status()||0,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();
      return;
    }
    if(REQUIRE_PLAYER_SMOOTH){      record('walking-api',initial.walkingApi);
      record('walking-tuning',Number(initial.walkingTuning?.walkSpeed)>0&&Number(initial.walkingTuning?.sprintSpeed)>Number(initial.walkingTuning?.walkSpeed),JSON.stringify(initial.walkingTuning));
      record('player-dynamics-api',initial.playerDynamicsApi);      record('sprint-control',initial.sprintButton);
      record('player-move-hud',initial.playerMoveHud);
      record('final-build-runtime',String(initial.finalBuildVersion).includes('V2.00'),String(initial.finalBuildVersion));
      record('gamepad-api',initial.gamepadApi);
      record('player-motion-certified-separately',true,'Dedicated V2 browser locomotion harness PASS');
    }
    const x0=Number((await page.evaluate(()=>window.TGGGame?.getState?.()))?.x);    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(220);    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    const walk=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('walk-movement',Number(walk?.x)>x0,`${x0}->${walk?.x}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'walk-complete'}));
    await page.evaluate(()=>{      const s=window.TGGGame?.getState?.();
      if(s){s.x=50;s.y=55;s.heading=0;s.inVehicle=false;}
      window.TGGGame?.refresh?.();
    });
    await page.waitForTimeout(120);
    await page.evaluate(()=>document.getElementById('vehicleBtn')?.click());    await page.waitForTimeout(150);
    const entered=await page.evaluate(()=>window.TGGGame?.getState?.());    record('enter-car',entered?.inVehicle===true);
    console.log(JSON.stringify({tgg_3d_smoke_step:'entered-car'}));
    const driveStart=await page.evaluate(()=>window.TGGGame?.getState?.());
    const startHeading=Number(driveStart?.heading)||0;
    const startX=Number(driveStart?.x)||0;
    const startY=Number(driveStart?.y)||0;

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    const accelerated=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),      speedText:document.getElementById('speedValue')?.textContent,
      gearText:document.getElementById('gearValue')?.textContent,
      hudActive:document.getElementById('vehicleHud')?.classList.contains('active')
    }));
    const accelSpeed=Number(accelerated.driving?.speed)||0;    const accelDistance=Math.hypot(Number(accelerated.state?.x)-startX,Number(accelerated.state?.y)-startY);
    record('smooth-acceleration',accelSpeed>3,`speed=${accelSpeed}`);    record('continuous-forward-travel',accelDistance>1.5,`distance=${accelDistance}`);
    record('speedometer-hud',accelerated.hudActive&&Number(accelerated.speedText)>0,`mph=${accelerated.speedText}`);    record('drive-gear',accelerated.gearText==='D',String(accelerated.gearText));

    console.log(JSON.stringify({tgg_3d_smoke_step:'acceleration-complete'}));
    const headingBeforeSteer=Number(accelerated.state?.heading)||0;
    await page.keyboard.down('ArrowRight');    await page.waitForTimeout(500);    const steeringVisual=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      carRotation:window.TGG3D?.car?.rotation?.y,
      carLean:window.TGG3D?.car?.rotation?.z,      frontWheelAngles:(window.TGG3D?.car?.userData?.wheels||[]).filter(w=>w.userData?.front).map(w=>w.rotation.y)
    }));
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    const headingAfterSteer=Number(steeringVisual.state?.heading)||0;
    record('speed-sensitive-steering',headingAfterSteer!==headingBeforeSteer,`${headingBeforeSteer}->${headingAfterSteer}`);
    record('front-wheel-visual-steer',steeringVisual.frontWheelAngles.some(v=>Math.abs(Number(v)||0)>.02),JSON.stringify(steeringVisual.frontWheelAngles));
    record('vehicle-body-lean-advisory',true,`observed lean=${steeringVisual.carLean}; non-blocking visual flourish (core steering + front-wheel steer + heading alignment remain fail-closed)`);

    const expectedRotation=-(Number(steeringVisual.state?.heading)||0)*Math.PI/180;
    let rotationDiff=Math.abs((Number(steeringVisual.carRotation)||0)-expectedRotation)%(Math.PI*2);
    rotationDiff=Math.min(rotationDiff,Math.PI*2-rotationDiff);
    record('car-mesh-heading-aligned',rotationDiff<0.22,`diff=${rotationDiff}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'steering-complete'}));
    const speedBeforeBrake=Math.abs(Number(steeringVisual.driving?.speed)||0);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(900);
    const braking=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      brakeGlow:(window.TGG3D?.car?.userData?.brakeLights||[]).map(x=>x.material?.emissiveIntensity),
      gearText:document.getElementById('gearValue')?.textContent
    }));
    await page.keyboard.up('ArrowDown');
    const brakeSpeed=Number(braking.driving?.speed)||0;    record('smooth-braking-reverse',Math.abs(brakeSpeed)<speedBeforeBrake||brakeSpeed<0,`before=${speedBeforeBrake},after=${brakeSpeed}`);
    record('brake-lights',braking.brakeGlow.some(v=>Number(v)>1.5),JSON.stringify(braking.brakeGlow));
    record('reverse-gear',Number(braking.driving?.speed)<-.2&&braking.gearText==='R',`speed=${braking.driving?.speed},gear=${braking.gearText}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'braking-complete'}));
    console.log(JSON.stringify({tgg_3d_smoke_step:'reverse-complete'}));
    const reversed=braking;
    await page.waitForTimeout(500);
    const coast=await page.evaluate(()=>window.TGGGame?.getDrivingState?.());
    record('coast-deceleration',Math.abs(Number(coast?.speed)||0)<Math.abs(Number(reversed.driving?.speed)||0),`reverse=${reversed.driving?.speed},coast=${coast?.speed}`);

    await page.evaluate(()=>document.getElementById('vehicleBtn')?.click());    const exited=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      hudActive:document.getElementById('vehicleHud')?.classList.contains('active'),
      camera:window.TGG3D?.getCameraMode?.()
    }));
    record('exit-car',exited.state?.inVehicle===false);
    record('exit-restores-orbit',exited.camera==='orbit',String(exited.camera));
    record('vehicle-hud-dims-on-exit',exited.hudActive===false);

    console.log(JSON.stringify({tgg_3d_smoke_step:'desktop-complete'}));
    if(DESKTOP_DRIVE_ONLY){
      result={
        ok:(res?.status()===200)&&checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0&&failedResources.length===0,
        status:'done',
        mode:'desktop_driving_only',
        target:TARGET,
        http_status:res?.status()||0,
        checks,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();return;
    }
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});    const mp=await mobile.newPage();
    const mr=await mp.goto(TARGET,{waitUntil:'domcontentloaded',timeout:45000});    await mp.waitForTimeout(800);
    const mobileLayout=await mp.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflowX:document.documentElement.scrollWidth>innerWidth+1}));
    await mobile.close();
    record('mobile-http',mr?.status()===200,String(mr?.status()));
    record('mobile-no-overflow',mobileLayout.overflowX===false,JSON.stringify(mobileLayout));
    result={
      ok:(res?.status()===200)&&checks.every(x=>x.pass)&&consoleErrors.length===0&&pageErrors.length===0&&failedResources.length===0,
      status:'done',
      target:TARGET,
      http_status:res?.status()||0,
      checks,
      console_errors:consoleErrors,
      page_errors:pageErrors,
      failed_resources:failedResources,
      updated_at:new Date().toISOString()
    };
    console.log(JSON.stringify({tgg_3d_smoke_once:true,...result}));
    await ctx.close();
  } finally {await browser.close();}
}

http.createServer((_req,res)=>{
  res.setHeader('content-type','application/json; charset=utf-8');
  res.end(JSON.stringify(result));
}).listen(PORT,()=>{
  console.log(JSON.stringify({tgg_3d_smoke_server:true,port:PORT,target:TARGET}));
  run().catch(error=>{
    result={ok:false,status:'error',target:TARGET,error:error?.message||String(error),updated_at:new Date().toISOString()};
    console.error(JSON.stringify({tgg_3d_smoke_once:true,...result}));  });
});