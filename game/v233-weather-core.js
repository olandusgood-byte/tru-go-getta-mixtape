(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PRESETS={
    clear:{id:'clear',rain:0,wind:.05,fogBoost:0,wetness:0,lightning:false,cloud:.08},
    drizzle:{id:'drizzle',rain:.28,wind:.22,fogBoost:.003,wetness:.45,lightning:false,cloud:.38},
    rain:{id:'rain',rain:.68,wind:.42,fogBoost:.006,wetness:.78,lightning:false,cloud:.68},
    storm:{id:'storm',rain:1,wind:.78,fogBoost:.01,wetness:1,lightning:true,cloud:1},
    mist:{id:'mist',rain:.08,wind:.12,fogBoost:.018,wetness:.32,lightning:false,cloud:.5}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'clear'),
      rain:clamp(Number.isFinite(Number(input.rain))?Number(input.rain):0,0,1),
      wind:clamp(Number.isFinite(Number(input.wind))?Number(input.wind):.05,0,1),
      fogBoost:clamp(Number.isFinite(Number(input.fogBoost))?Number(input.fogBoost):0,0,.04),
      wetness:clamp(Number.isFinite(Number(input.wetness))?Number(input.wetness):0,0,1),
      lightning:!!input.lightning,
      cloud:clamp(Number.isFinite(Number(input.cloud))?Number(input.cloud):.08,0,1)
    };
  }
  function preset(id='clear'){
    const p=PRESETS[id]||PRESETS.clear;
    return normalize(p);
  }
  function particleBudget(quality='high'){
    return quality==='performance'?240:quality==='balanced'?520:900;
  }
  const api={preset,normalize,particleBudget,presets:Object.keys(PRESETS)};
  globalThis.TGGV233Core=api;
  if(typeof window!=='undefined')window.TGGV233Core=api;
})();