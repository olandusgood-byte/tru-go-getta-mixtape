import http from 'node:http';
import { chromium } from 'playwright';

const PORT=Number(process.env.PORT||10000);
const TARGET=String(process.env.TGG_3D_SMOKE_TARGET||'').trim();
const EXPECT_VERSION=String(process.env.TGG_3D_EXPECT_VERSION||'V1.22 3D').trim();
const REQUIRE_DESTINATIONS=String(process.env.TGG_3D_REQUIRE_DESTINATIONS||'0')==='1';
const REQUIRE_LIVING_CITY=String(process.env.TGG_3D_REQUIRE_LIVING_CITY||'0')==='1';
const REQUIRE_CINEMATIC=String(process.env.TGG_3D_REQUIRE_CINEMATIC||'0')==='1';
const REQUIRE_WORLD_BULK=String(process.env.TGG_3D_REQUIRE_WORLD_BULK||'0')==='1';
const REQUIRE_PLAYER_SMOOTH=String(process.env.TGG_3D_REQUIRE_PLAYER_SMOOTH||'0')==='1';
const PLAYER_SMOOTH_ONLY=String(process.env.TGG_3D_PLAYER_SMOOTH_ONLY||'0')==='1';
let result={ok:false,status:'pending',target:TARGET,updated_at:new Date().toISOString()};

async function run(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await ctx.newPage();
    if(PLAYER_SMOOTH_ONLY){
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(/\.js(?:\?|$)/.test(url)){
          const keep=/\/(?:vendor\/three-r152\.min|game|game-3d|final-build)\.js(?:\?|$)/.test(url);
          if(!keep)return route.abort();
        }
        return route.continue();
      });
    }
    const consoleErrors=[],pageErrors=[],failedResources=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
    page.on('response',r=>{if(r.status()>=400)failedResources.push({url:r.url(),status:r.status()})});
    const res=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('#newGame',{state:'attached',timeout:15000});
    await page.evaluate(()=>document.getElementById('newGame')?.click());
    await page.evaluate(()=>{
      const stage=document.getElementById('stageName');
      const style=document.getElementById('styleChoice');
      if(stage)stage.value='TGG 3D QA';
      if(style)style.value='Artist';
      document.getElementById('startGame')?.click();
    });
    let webglReady=false;
    try{
      const readyDeadline=Date.now()+30000;
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
        readyType:typeof window.TGG3D?.isReady,
        readyValue:(()=>{try{return window.TGG3D?.isReady?.()}catch(e){return 'THREW:'+String(e)}})(),
        city3d:!!document.getElementById('city3d'),
        cityCanvas:!!document.querySelector('#city3d canvas'),
        scripts:[...document.scripts].map(s=>s.src||'[inline]'),
        readyState:document.readyState
      })).catch(()=>({evaluationFailed:true}));
      console.log(JSON.stringify({tgg_3d_smoke_step:'mobile-complete'}));
    result={
        ok:false,status:'webgl_not_ready',target:TARGET,
        error:error?.message||String(error),
        diagnostics,
        console_errors:consoleErrors,
        page_errors:pageErrors,
        failed_resources:failedResources,
        updated_at:new Date().toISOString()
      };
      console.error(JSON.stringify({tgg_3d_smoke_once:true,...result}));
      await ctx.close();
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
      interactApi:typeof window.TGG3D?.interactNearest==='function',
      interactButton:!!document.getElementById('interact3dBtn'),
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
      sprintButton:!!document.getElementById('sprintBtn'),
      playerMoveHud:!!document.getElementById('playerMoveHud'),
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

      await page.keyboard.down('ArrowUp');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const diagonal=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.()}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');
      record('diagonal-normalized',Number(diagonal.walk?.speed)<=Number(diagonal.tune?.walkSpeed)*1.08,JSON.stringify(diagonal));
      console.log(JSON.stringify({tgg_3d_smoke_step:'player-diagonal-pass'}));

      await page.waitForTimeout(250);
      await page.keyboard.down('Shift');
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(750);
      const sprint=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.(),mode:document.getElementById('walkModeValue')?.textContent}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
      record('sprint-speed',Number(sprint.walk?.speed)>Number(sprint.tune?.walkSpeed)*1.1,JSON.stringify(sprint));
      record('sprint-state',sprint.walk?.sprinting===true&&sprint.mode==='SPRINT',JSON.stringify(sprint));
      console.log(JSON.stringify({tgg_3d_smoke_step:'player-sprint-pass'}));

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
    if(REQUIRE_PLAYER_SMOOTH){
      record('walking-api',initial.walkingApi);
      record('walking-tuning',Number(initial.walkingTuning?.walkSpeed)>0&&Number(initial.walkingTuning?.sprintSpeed)>Number(initial.walkingTuning?.walkSpeed),JSON.stringify(initial.walkingTuning));
      record('player-dynamics-api',initial.playerDynamicsApi);
      record('sprint-control',initial.sprintButton);
      record('player-move-hud',initial.playerMoveHud);
      record('final-build-runtime',String(initial.finalBuildVersion).includes('V2.00'),String(initial.finalBuildVersion));

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

      await page.keyboard.down('ArrowUp');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(650);
      const diagonal=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.()}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');
      record('diagonal-normalized',Number(diagonal.walk?.speed)<=Number(diagonal.tune?.walkSpeed)*1.08,JSON.stringify(diagonal));

      await page.keyboard.down('Shift');
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(750);
      const sprint=await page.evaluate(()=>({walk:window.TGGGame?.getWalkingState?.(),tune:window.TGGGame?.getWalkTuning?.(),mode:document.getElementById('walkModeValue')?.textContent}));
      await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
      record('sprint-speed',Number(sprint.walk?.speed)>Number(sprint.tune?.walkSpeed)*1.1,JSON.stringify(sprint));
      record('sprint-state',sprint.walk?.sprinting===true&&sprint.mode==='SPRINT',JSON.stringify(sprint));
      await page.waitForTimeout(300);
    }
    const x0=Number((await page.evaluate(()=>window.TGGGame?.getState?.()))?.x);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(220);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    const walk=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('walk-movement',Number(walk?.x)>x0,`${x0}->${walk?.x}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'walk-complete'}));
    await page.evaluate(()=>document.getElementById('vehicleBtn')?.click());
    await page.waitForTimeout(150);
    const entered=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('enter-car',entered?.inVehicle===true);

    console.log(JSON.stringify({tgg_3d_smoke_step:'entered-car'}));
    const driveStart=await page.evaluate(()=>window.TGGGame?.getState?.());
    const startHeading=Number(driveStart?.heading)||0;
    const startX=Number(driveStart?.x)||0;
    const startY=Number(driveStart?.y)||0;

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    const accelerated=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      speedText:document.getElementById('speedValue')?.textContent,
      gearText:document.getElementById('gearValue')?.textContent,
      hudActive:document.getElementById('vehicleHud')?.classList.contains('active')
    }));
    await page.keyboard.up('ArrowUp');
    const accelSpeed=Number(accelerated.driving?.speed)||0;
    const accelDistance=Math.hypot(Number(accelerated.state?.x)-startX,Number(accelerated.state?.y)-startY);
    record('smooth-acceleration',accelSpeed>3,`speed=${accelSpeed}`);
    record('continuous-forward-travel',accelDistance>1.5,`distance=${accelDistance}`);
    record('speedometer-hud',accelerated.hudActive&&Number(accelerated.speedText)>0,`mph=${accelerated.speedText}`);
    record('drive-gear',accelerated.gearText==='D',String(accelerated.gearText));

    console.log(JSON.stringify({tgg_3d_smoke_step:'acceleration-complete'}));
    const headingBeforeSteer=Number(accelerated.state?.heading)||0;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    const steeringVisual=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      carRotation:window.TGG3D?.car?.rotation?.y,
      carLean:window.TGG3D?.car?.rotation?.z,
      frontWheelAngles:(window.TGG3D?.car?.userData?.wheels||[]).filter(w=>w.userData?.front).map(w=>w.rotation.y)
    }));
    await page.keyboard.up('ArrowRight');
    const headingAfterSteer=Number(steeringVisual.state?.heading)||0;
    record('speed-sensitive-steering',headingAfterSteer!==headingBeforeSteer,`${headingBeforeSteer}->${headingAfterSteer}`);
    record('front-wheel-visual-steer',steeringVisual.frontWheelAngles.some(v=>Math.abs(Number(v)||0)>.02),JSON.stringify(steeringVisual.frontWheelAngles));
    record('vehicle-body-lean',Math.abs(Number(steeringVisual.carLean)||0)>.002,`lean=${steeringVisual.carLean}`);

    const expectedRotation=-(Number(steeringVisual.state?.heading)||0)*Math.PI/180;
    let rotationDiff=Math.abs((Number(steeringVisual.carRotation)||0)-expectedRotation)%(Math.PI*2);
    rotationDiff=Math.min(rotationDiff,Math.PI*2-rotationDiff);
    record('car-mesh-heading-aligned',rotationDiff<0.22,`diff=${rotationDiff}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'steering-complete'}));
    const speedBeforeBrake=Math.abs(Number(steeringVisual.driving?.speed)||0);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(700);
    const braking=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      brakeGlow:(window.TGG3D?.car?.userData?.brakeLights||[]).map(x=>x.material?.emissiveIntensity),
      gearText:document.getElementById('gearValue')?.textContent
    }));
    await page.keyboard.up('ArrowDown');
    const brakeSpeed=Number(braking.driving?.speed)||0;
    record('smooth-braking-reverse',Math.abs(brakeSpeed)<speedBeforeBrake||brakeSpeed<0,`before=${speedBeforeBrake},after=${brakeSpeed}`);
    record('brake-lights',braking.brakeGlow.some(v=>Number(v)>1.5),JSON.stringify(braking.brakeGlow));

    console.log(JSON.stringify({tgg_3d_smoke_step:'braking-complete'}));
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(900);
    const reversed=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      driving:window.TGGGame?.getDrivingState?.(),
      gearText:document.getElementById('gearValue')?.textContent
    }));
    await page.keyboard.up('ArrowDown');
    record('reverse-gear',Number(reversed.driving?.speed)<-.2&&reversed.gearText==='R',`speed=${reversed.driving?.speed},gear=${reversed.gearText}`);

    console.log(JSON.stringify({tgg_3d_smoke_step:'reverse-complete'}));
    await page.waitForTimeout(500);
    const coast=await page.evaluate(()=>window.TGGGame?.getDrivingState?.());
    record('coast-deceleration',Math.abs(Number(coast?.speed)||0)<Math.abs(Number(reversed.driving?.speed)||0),`reverse=${reversed.driving?.speed},coast=${coast?.speed}`);

    await page.evaluate(()=>document.getElementById('vehicleBtn')?.click());
    const exited=await page.evaluate(()=>({
      state:window.TGGGame?.getState?.(),
      hudActive:document.getElementById('vehicleHud')?.classList.contains('active'),
      camera:window.TGG3D?.getCameraMode?.()
    }));
    record('exit-car',exited.state?.inVehicle===false);
    record('exit-restores-orbit',exited.camera==='orbit',String(exited.camera));
    record('vehicle-hud-dims-on-exit',exited.hudActive===false);

    console.log(JSON.stringify({tgg_3d_smoke_step:'desktop-complete'}));
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
    const mp=await mobile.newPage();
    const mr=await mp.goto(TARGET,{waitUntil:'domcontentloaded',timeout:45000});
    await mp.waitForTimeout(800);
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
    console.error(JSON.stringify({tgg_3d_smoke_once:true,...result}));
  });
});
