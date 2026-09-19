(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    high:{id:'high',meshDistance:72,shadowBudget:72,particleScale:1,targetFps:60,updateHz:60,worldDetail:1},
    balanced:{id:'balanced',meshDistance:50,shadowBudget:34,particleScale:.66,targetFps:50,updateHz:45,worldDetail:.78},
    performance:{id:'performance',meshDistance:34,shadowBudget:12,particleScale:.36,targetFps:42,updateHz:30,worldDetail:.55}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'balanced'),
      meshDistance:clamp(Number.isFinite(Number(input.meshDistance))?Number(input.meshDistance):50,12,90),
      shadowBudget:Math.round(clamp(Number.isFinite(Number(input.shadowBudget))?Number(input.shadowBudget):34,0,120)),
      particleScale:clamp(Number.isFinite(Number(input.particleScale))?Number(input.particleScale):.66,.15,1),
      targetFps:clamp(Number.isFinite(Number(input.targetFps))?Number(input.targetFps):50,24,120),
      updateHz:clamp(Number.isFinite(Number(input.updateHz))?Number(input.updateHz):45,15,120),
      worldDetail:clamp(Number.isFinite(Number(input.worldDetail))?Number(input.worldDetail):.78,.35,1)
    };
  }
  function profile(id='balanced'){return normalize(PROFILES[id]||PROFILES.balanced)}
  function select(sample={}){
    const fps=Number(sample.fps)||60,mobile=!!sample.mobile;
    if(fps<34)return'performance';
    if(mobile)return fps<46?'performance':'balanced';
    if(fps<52)return'balanced';
    return'high';
  }
  const api={profile,normalize,select,profiles:Object.keys(PROFILES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();