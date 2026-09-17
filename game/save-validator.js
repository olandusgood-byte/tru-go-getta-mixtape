(() => {
  const keys={game:'tgg-game-v1',career:'tgg-career-v1',content:'tgg-content-v1',expansion:'tgg-expansion-v1',progression:'tgg-progression-v1',chains:'tgg-chains-v1',districts:'tgg-districts-v1',inventory:'tgg-inventory-v1',crew:'tgg-crew-v1',events:'tgg-events-v1',avatar:'tgg-avatar-v1'};
  const num=(v,f,min=0)=>{v=Number(v);return Number.isFinite(v)&&v>=min?v:f};
  function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback}catch(e){return fallback}}
  function repair(){
    const g=read(keys.game,{}); if(Object.keys(g).length){g.level=Math.max(1,Math.floor(num(g.level,1,1)));g.cash=num(g.cash,0);g.xp=num(g.xp,0);g.x=num(g.x,50);g.y=num(g.y,50);if(typeof g.name!=='string')g.name='PLAYER';if(typeof g.style!=='string')g.style='Independent';localStorage.setItem(keys.game,JSON.stringify(g))}
    const c=read(keys.career,{});if(Object.keys(c).length){c.studioLevel=Math.max(1,Math.floor(num(c.studioLevel,1,1)));c.reputation=num(c.reputation,0);c.recordings=Math.floor(num(c.recordings,0));c.mixtapes=Math.floor(num(c.mixtapes,0));c.upgrades=Math.floor(num(c.upgrades,0));if(!Array.isArray(c.unlocks))c.unlocks=['Bedroom Studio'];localStorage.setItem(keys.career,JSON.stringify(c))}
    const inv=read(keys.inventory,null);if(inv&&typeof inv.items!=='object')localStorage.setItem(keys.inventory,JSON.stringify({items:{},updatedAt:Date.now()}));
    const crew=read(keys.crew,null);if(crew&&(!Array.isArray(crew.members)))localStorage.setItem(keys.crew,JSON.stringify({members:[],updatedAt:Date.now()}));
    const events=read(keys.events,null);if(events&&(!Array.isArray(events.completed)))localStorage.setItem(keys.events,JSON.stringify({completed:[],runs:{},updatedAt:Date.now()}));
    const av=read(keys.avatar,null);if(av){
      const validHex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
      const pick=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
      const repaired={
        skin:validHex(av.skin)?av.skin:'#8b5a3c',
        hair:pick(av.hair,['fade','buzz','curls','locs'],'fade'),
        top:pick(av.top,['hoodie','tee','jacket'],'hoodie'),
        bottom:pick(av.bottom,['joggers','jeans','shorts'],'joggers'),
        shoes:pick(av.shoes,['high-tops','sneakers','boots'],'high-tops'),
        hat:pick(av.hat,['none','cap','beanie'],'none'),
        chain:pick(av.chain,['none','gold','ice'],'gold'),
        accent:validHex(av.accent)?av.accent:'#c7ff00',
        gender:typeof av.gender==='string'?av.gender:'street'
      };
      localStorage.setItem(keys.avatar,JSON.stringify(repaired));
    }
    return report();
  }
  function report(){
    const out={};
    Object.entries(keys).forEach(([name,key])=>{const v=read(key,null);out[name]=v===null?null:typeof v==='object'});
    out.valid=Object.values(out).every(v=>v===null||v===true);
    return out;
  }
  window.TGGSave={keys,report,repair};
})();
