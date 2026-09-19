(() => {
  const TYPES={
    manual:{id:'manual',label:'INSTANT REPLAY',windowMs:5000,replayMs:3600,accent:0xc7ff00,camera:'cinematic',audio:'confirm'},
    mission:{id:'mission',label:'MISSION HIGHLIGHT',windowMs:6500,replayMs:4200,accent:0xffcf4a,camera:'cinematic',audio:'mission-complete'},
    battle:{id:'battle',label:'BATTLE HIGHLIGHT',windowMs:6000,replayMs:4000,accent:0xff466d,camera:'action',audio:'rap'},
    concert:{id:'concert',label:'SHOW HIGHLIGHT',windowMs:7000,replayMs:4400,accent:0xc56cff,camera:'cinematic',audio:'concert'},
    vehicle:{id:'vehicle',label:'DRIVE HIGHLIGHT',windowMs:4500,replayMs:3200,accent:0x61d9ff,camera:'action',audio:'boost'}
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  function profile(id='manual'){return {...(TYPES[id]||TYPES.manual)}}
  function windowed(samples=[],now=Date.now(),ms=5000){
    const floor=Number(now)-clamp(ms,500,15000);
    return samples.filter(x=>Number(x?.at)>=floor&&Number(x?.at)<=Number(now)).map(x=>({...x}));
  }
  function progress(start,now,duration){
    return clamp((Number(now)-Number(start))/Math.max(1,Number(duration)||1),0,1);
  }
  function indexFor(length,p){
    if(!length)return 0;
    return Math.max(0,Math.min(length-1,Math.floor(clamp(p,0,1)*(length-1))));
  }
  const api={profile,windowed,progress,indexFor,types:Object.keys(TYPES)};
  globalThis.TGGV243Core=api;if(typeof window!=='undefined')window.TGGV243Core=api;
})();