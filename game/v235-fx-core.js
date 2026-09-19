(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PRESETS={
    street:{id:'street',smoke:.32,sparks:.18,dust:.24,haze:.08,boostFlame:.42,rainSpray:.08,stageHaze:.04,missionBurst:.24},
    stage:{id:'stage',smoke:.18,sparks:.12,dust:.08,haze:.34,boostFlame:.24,rainSpray:.04,stageHaze:.76,missionBurst:.52},
    storm:{id:'storm',smoke:.18,sparks:.16,dust:.04,haze:.22,boostFlame:.28,rainSpray:.86,stageHaze:.18,missionBurst:.22},
    performance:{id:'performance',smoke:.36,sparks:.42,dust:.14,haze:.2,boostFlame:.88,rainSpray:.08,stageHaze:.62,missionBurst:.92}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'street'),
      smoke:clamp(Number.isFinite(Number(input.smoke))?Number(input.smoke):.25,0,1),
      sparks:clamp(Number.isFinite(Number(input.sparks))?Number(input.sparks):.2,0,1),
      dust:clamp(Number.isFinite(Number(input.dust))?Number(input.dust):.15,0,1),
      haze:clamp(Number.isFinite(Number(input.haze))?Number(input.haze):.08,0,1),
      boostFlame:clamp(Number.isFinite(Number(input.boostFlame))?Number(input.boostFlame):.4,0,1),
      rainSpray:clamp(Number.isFinite(Number(input.rainSpray))?Number(input.rainSpray):.06,0,1),
      stageHaze:clamp(Number.isFinite(Number(input.stageHaze))?Number(input.stageHaze):.04,0,1),
      missionBurst:clamp(Number.isFinite(Number(input.missionBurst))?Number(input.missionBurst):.2,0,1)
    };
  }
  function preset(id='street'){return normalize(PRESETS[id]||PRESETS.street)}
  function budget(q='high'){return q==='performance'?180:q==='balanced'?360:640}
  const api={preset,normalize,budget,presets:Object.keys(PRESETS)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();