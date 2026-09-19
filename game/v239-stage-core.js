(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const SHOWS={
    concert:{id:'concert',crowd:.95,lights:1,energy:1,cypher:false,accent:0xff466d},
    battle:{id:'battle',crowd:.82,lights:.72,energy:.92,cypher:true,accent:0xc7ff00},
    club:{id:'club',crowd:.7,lights:.88,energy:.78,cypher:false,accent:0xc56cff},
    showcase:{id:'showcase',crowd:.62,lights:.64,energy:.7,cypher:false,accent:0x61d9ff}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'showcase'),
      crowd:clamp(Number.isFinite(Number(input.crowd))?Number(input.crowd):.6,0,1),
      lights:clamp(Number.isFinite(Number(input.lights))?Number(input.lights):.6,0,1),
      energy:clamp(Number.isFinite(Number(input.energy))?Number(input.energy):.6,0,1),
      cypher:!!input.cypher,
      accent:Number.isFinite(Number(input.accent))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.accent)))):0x61d9ff
    };
  }
  function show(id='showcase'){return normalize(SHOWS[id]||SHOWS.showcase)}
  function lightBudget(q='high'){return q==='performance'?4:q==='balanced'?7:11}
  const api={show,normalize,lightBudget,shows:Object.keys(SHOWS)};
  globalThis.TGGV239Core=api;if(typeof window!=='undefined')window.TGGV239Core=api;
})();