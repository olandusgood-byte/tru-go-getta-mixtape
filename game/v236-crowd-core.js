(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const PROFILES={
    chill:{id:'chill',density:.48,walkSpeed:.72,reactionDistance:7.5,talkChance:.18,groupChance:.2},
    busy:{id:'busy',density:.78,walkSpeed:1.0,reactionDistance:9.5,talkChance:.26,groupChance:.32},
    event:{id:'event',density:1,walkSpeed:.86,reactionDistance:12,talkChance:.42,groupChance:.58},
    night:{id:'night',density:.62,walkSpeed:.82,reactionDistance:10.5,talkChance:.24,groupChance:.36}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'chill'),
      density:clamp(Number.isFinite(Number(input.density))?Number(input.density):.48,0,1),
      walkSpeed:clamp(Number.isFinite(Number(input.walkSpeed))?Number(input.walkSpeed):.72,.2,1.8),
      reactionDistance:clamp(Number.isFinite(Number(input.reactionDistance))?Number(input.reactionDistance):7.5,2,16),
      talkChance:clamp(Number.isFinite(Number(input.talkChance))?Number(input.talkChance):.18,0,1),
      groupChance:clamp(Number.isFinite(Number(input.groupChance))?Number(input.groupChance):.2,0,1)
    };
  }
  function profile(id='chill'){return normalize(PROFILES[id]||PROFILES.chill)}
  function budget(quality='high',density=1){
    const base=quality==='performance'?8:quality==='balanced'?16:28;
    return Math.max(3,Math.round(base*clamp(Number(density)||0,0,1)));
  }
  const api={profile,normalize,budget,profiles:Object.keys(PROFILES)};
  globalThis.TGGV236Core=api;
  if(typeof window!=='undefined')window.TGGV236Core=api;
})();