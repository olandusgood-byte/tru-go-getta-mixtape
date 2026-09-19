(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    impact:{id:'impact',count:26,life:.48,speed:9,size:.09,opacity:.95,gravity:6.5,color:0xffd45c},
    smoke:{id:'smoke',count:18,life:1.25,speed:2.4,size:.24,opacity:.42,gravity:.15,color:0x8b95a7},
    dust:{id:'dust',count:16,life:.9,speed:3.1,size:.18,opacity:.34,gravity:.35,color:0x8a745f},
    boost:{id:'boost',count:34,life:.38,speed:18,size:.08,opacity:.88,gravity:.05,color:0x61d9ff},
    skid:{id:'skid',count:22,life:1.05,speed:2.8,size:.2,opacity:.38,gravity:.12,color:0xa6adb8},
    rainSplash:{id:'rainSplash',count:18,life:.34,speed:5.5,size:.07,opacity:.7,gravity:7.2,color:0xbfdcff},
    mission:{id:'mission',count:38,life:.72,speed:8,size:.1,opacity:.9,gravity:1.2,color:0xc7ff00},
    rap:{id:'rap',count:42,life:.62,speed:10.5,size:.095,opacity:.94,gravity:.7,color:0xff466d},
    confetti:{id:'confetti',count:70,life:2.4,speed:7.2,size:.11,opacity:.95,gravity:3.6,color:0xc56cff},
    repair:{id:'repair',count:30,life:.85,speed:5.8,size:.1,opacity:.9,gravity:.5,color:0x4cff88}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'custom'),
      count:Math.round(clamp(Number.isFinite(Number(input.count))?Number(input.count):20,1,120)),
      life:clamp(Number.isFinite(Number(input.life))?Number(input.life):.8,.1,4),
      speed:clamp(Number.isFinite(Number(input.speed))?Number(input.speed):4,0,30),
      size:clamp(Number.isFinite(Number(input.size))?Number(input.size):.1,.02,.5),
      opacity:clamp(Number.isFinite(Number(input.opacity))?Number(input.opacity):.8,0,1),
      gravity:clamp(Number.isFinite(Number(input.gravity))?Number(input.gravity):1,0,12),
      color:Number.isFinite(Number(input.color))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.color)))):0xffffff
    };
  }
  function profile(id='impact'){return normalize(PROFILES[id]||PROFILES.impact)}
  function budget(quality='high'){return quality==='performance'?90:quality==='balanced'?180:320}
  const api={profile,normalize,budget,profiles:Object.keys(PROFILES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();