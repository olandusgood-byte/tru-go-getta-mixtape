(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const ROLES={
    fan:{id:'fan',energy:.82,speed:.82,talkChance:.38,danceChance:.62},
    artist:{id:'artist',energy:.72,speed:.74,talkChance:.56,danceChance:.42},
    vendor:{id:'vendor',energy:.36,speed:.38,talkChance:.68,danceChance:.08},
    local:{id:'local',energy:.5,speed:.64,talkChance:.42,danceChance:.18},
    promoter:{id:'promoter',energy:.58,speed:.6,talkChance:.72,danceChance:.22}
  };
  const ROUTES={
    'studio-row':[[[-34,-20],[-28,-20],[-28,-10],[-34,-10]],[[-38,-16],[-31,-16],[-31,-7],[-38,-7]]],
    shops:[[[-18,30],[-10,30],[-10,38],[-18,38]],[[-20,34],[-13,34],[-13,41],[-20,41]]],
    park:[[[10,-38],[20,-38],[20,-30],[10,-30]],[[15,-42],[23,-42],[23,-35],[15,-35]]],
    media:[[[3,38],[13,38],[13,46],[3,46]],[[-2,41],[8,41],[8,48],[-2,48]]],
    business:[[[-46,3],[-38,3],[-38,13],[-46,13]],[[-42,-1],[-34,-1],[-34,8],[-42,8]]],
    downtown:[[[29,29],[39,29],[39,39],[29,39]],[[32,25],[42,25],[42,35],[32,35]]]
  };
  function normalize(input={}){
    return {
      id:String(input.id||'local'),
      energy:clamp(Number.isFinite(Number(input.energy))?Number(input.energy):.5,0,1),
      speed:clamp(Number.isFinite(Number(input.speed))?Number(input.speed):.6,0,1.4),
      talkChance:clamp(Number.isFinite(Number(input.talkChance))?Number(input.talkChance):.35,0,1),
      danceChance:clamp(Number.isFinite(Number(input.danceChance))?Number(input.danceChance):.15,0,1)
    };
  }
  function role(id='local'){return normalize(ROLES[id]||ROLES.local)}
  function densityBudget(q='high'){return q==='performance'?10:q==='balanced'?18:28}
  function routeFor(id='downtown',index=0){
    const routes=ROUTES[id]||ROUTES.downtown;
    const r=routes[Math.abs(Number(index)||0)%routes.length]||routes[0];
    return r.map(p=>[Number(p[0]),Number(p[1])]);
  }
  const api={role,normalize,densityBudget,routeFor,roles:Object.keys(ROLES),districts:Object.keys(ROUTES)};
  globalThis.TGGV235Core=api;
  if(typeof window!=='undefined')window.TGGV235Core=api;
})();