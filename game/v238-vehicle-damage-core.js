(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const INTERIORS={
    street:{id:'street',seat:0x1c222b,dash:0x11161d,accent:0xc7ff00,trim:0x5e6876},
    sport:{id:'sport',seat:0x17131a,dash:0x0d1118,accent:0xff466d,trim:0xd8dde7},
    luxury:{id:'luxury',seat:0x201c18,dash:0x141414,accent:0xf1d27a,trim:0xe7e9ed}
  };
  function normalizeDamage(v){return clamp(Number(v)||0,0,100)}
  function damageTier(v){const x=normalizeDamage(v);return x>80?'clean':x>55?'scuffed':x>25?'damaged':'critical'}
  function panelState(condition=100,panel='body'){
    const c=normalizeDamage(condition),d=1-c/100;
    const mult=panel==='hood'?1.2:panel==='bumper'?1.35:panel==='door'?.75:1;
    return {
      rotation:clamp(d*.12*mult,0,.18),
      sag:clamp(d*.16*mult,0,.22),
      scratch:clamp(d*1.1,0,1),
      light:clamp(1-d*.75,.15,1)
    };
  }
  function interior(id='street'){return {...(INTERIORS[id]||INTERIORS.street)}}
  const api={normalizeDamage,damageTier,panelState,interior,interiors:Object.keys(INTERIORS)};
  globalThis.TGGV238Core=api;if(typeof window!=='undefined')window.TGGV238Core=api;
})();