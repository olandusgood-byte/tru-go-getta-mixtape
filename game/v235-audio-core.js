(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    engine:{id:'engine',wave:'sawtooth',baseHz:52,duration:.18,attack:.01,release:.12,gain:.22},
    boost:{id:'boost',wave:'square',baseHz:95,duration:.22,attack:.005,release:.18,gain:.18},
    footstep:{id:'footstep',wave:'noise',baseHz:0,duration:.09,attack:.002,release:.08,gain:.16},
    ui:{id:'ui',wave:'sine',baseHz:520,duration:.08,attack:.002,release:.06,gain:.12},
    mission:{id:'mission',wave:'triangle',baseHz:220,duration:.45,attack:.01,release:.35,gain:.2},
    rain:{id:'rain',wave:'noise',baseHz:0,duration:2.5,attack:.08,release:.25,gain:.14},
    storm:{id:'storm',wave:'noise',baseHz:0,duration:3.2,attack:.03,release:.8,gain:.24},
    crowd:{id:'crowd',wave:'noise',baseHz:0,duration:1.8,attack:.08,release:.3,gain:.12},
    rap:{id:'rap',wave:'triangle',baseHz:145,duration:.24,attack:.006,release:.2,gain:.17},
    concert:{id:'concert',wave:'sawtooth',baseHz:110,duration:.5,attack:.01,release:.35,gain:.18},
    club:{id:'club',wave:'sine',baseHz:72,duration:.65,attack:.01,release:.4,gain:.14},
    studio:{id:'studio',wave:'sine',baseHz:330,duration:.18,attack:.01,release:.12,gain:.1}
  };
  function normalizeMix(input={}){
    return {
      master:clamp(Number.isFinite(Number(input.master))?Number(input.master):.8,0,1),
      sfx:clamp(Number.isFinite(Number(input.sfx))?Number(input.sfx):.85,0,1),
      ambience:clamp(Number.isFinite(Number(input.ambience))?Number(input.ambience):.65,0,1),
      music:clamp(Number.isFinite(Number(input.music))?Number(input.music):.5,0,1)
    };
  }
  function profile(id='ui'){return {...(PROFILES[id]||PROFILES.ui)}}
  function distanceGain(distance,maxDistance=20){
    const d=Math.max(0,Number(distance)||0),m=Math.max(.001,Number(maxDistance)||20);
    if(d<=0)return 1;
    if(d>=m)return .08;
    const x=d/m;
    return clamp(1/(1+5*x*x),.08,1);
  }
  function pan(relativeX,max=10){
    const m=Math.max(.001,Math.abs(Number(max)||10));
    return clamp((Number(relativeX)||0)/m,-1,1);
  }
  const api={normalizeMix,profile,distanceGain,pan,profiles:Object.keys(PROFILES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();