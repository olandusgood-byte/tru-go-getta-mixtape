import http from 'node:http';
import { chromium } from 'playwright';

const PORT=Number(process.env.PORT||10000);
const TARGET=String(process.env.TGG_3D_SMOKE_TARGET||'').trim();
const EXPECT_VERSION=String(process.env.TGG_3D_EXPECT_VERSION||'V1.22 3D').trim();
const REQUIRE_DESTINATIONS=String(process.env.TGG_3D_REQUIRE_DESTINATIONS||'0')==='1';
let result={ok:false,status:'pending',target:TARGET,updated_at:new Date().toISOString()};

async function run(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await ctx.newPage();
    const consoleErrors=[],pageErrors=[],failedResources=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>pageErrors.push(e.message||String(e)));
    page.on('response',r=>{if(r.status()>=400)failedResources.push({url:r.url(),status:r.status()})});
    const res=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('#newGame',{state:'visible',timeout:15000});
    await page.click('#newGame');
    await page.fill('#stageName','TGG 3D QA');
    await page.selectOption('#styleChoice',{label:'Artist'});
    await page.click('#startGame');
    await page.waitForFunction(()=>window.TGG3D?.isReady?.()===true,{timeout:20000});
    await page.waitForTimeout(500);

    const checks=[];
    const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

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
      interactButton:!!document.getElementById('interact3dBtn')
    }));
    record('title-version',initial.title.includes(EXPECT_VERSION),initial.title);
    record('webgl-canvas',initial.canvas);
    record('tgg3d-ready',initial.ready);
    record('3d-player',initial.player);
    record('starter-car',initial.car);
    record('building-collision',initial.collisionBlocked);
    if(REQUIRE_DESTINATIONS){
      record('destination-count',initial.destinations>=6,String(initial.destinations));
      record('destination-interact-api',initial.interactApi);
      record('destination-interact-button',initial.interactButton);
    }

    const x0=Number(initial.state?.x);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const walk=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('walk-movement',Number(walk?.x)>x0,`${x0}->${walk?.x}`);

    await page.click('#vehicleBtn');
    await page.waitForTimeout(150);
    const entered=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('enter-car',entered?.inVehicle===true);

    const carX0=Number(entered?.x);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const driven=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('drive-movement',Number(driven?.x)>=carX0+3,`${carX0}->${driven?.x}`);

    await page.click('#vehicleBtn');
    const exited=await page.evaluate(()=>window.TGGGame?.getState?.());
    record('exit-car',exited?.inVehicle===false);

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
