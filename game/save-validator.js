(() => {
  const keys={game:'tgg-game-v1',career:'tgg-career-v1',content:'tgg-content-v1',expansion:'tgg-expansion-v1',progression:'tgg-progression-v1',chains:'tgg-chains-v1',districts:'tgg-districts-v1',inventory:'tgg-inventory-v1',crew:'tgg-crew-v1',events:'tgg-events-v1',streetEvents:'tgg-street-events-v1',circuits:'tgg-circuits-v1',districtStory:'tgg-district-story-v1',routeMemory:'tgg-route-memory-v1',avatar:'tgg-avatar-v1'};
  const num=(v,f,min=0)=>{v=Number(v);return Number.isFinite(v)&&v>=min?v:f};
  function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback}catch(e){return fallback}}
  function repair(){
    const g=read(keys.game,{}); if(Object.keys(g).length){g.level=Math.max(1,Math.floor(num(g.level,1,1)));g.cash=num(g.cash,0);g.xp=num(g.xp,0);g.x=num(g.x,50);g.y=num(g.y,50);if(typeof g.name!=='string')g.name='PLAYER';if(typeof g.style!=='string')g.style='Independent';localStorage.setItem(keys.game,JSON.stringify(g))}
    const c=read(keys.career,{});if(Object.keys(c).length){c.studioLevel=Math.max(1,Math.floor(num(c.studioLevel,1,1)));c.reputation=num(c.reputation,0);c.recordings=Math.floor(num(c.recordings,0));c.mixtapes=Math.floor(num(c.mixtapes,0));c.upgrades=Math.floor(num(c.upgrades,0));if(!Array.isArray(c.unlocks))c.unlocks=['Bedroom Studio'];localStorage.setItem(keys.career,JSON.stringify(c))}
    const inv=read(keys.inventory,null);if(inv&&typeof inv.items!=='object')localStorage.setItem(keys.inventory,JSON.stringify({items:{},updatedAt:Date.now()}));
    const crew=read(keys.crew,null);if(crew&&(!Array.isArray(crew.members)))localStorage.setItem(keys.crew,JSON.stringify({members:[],updatedAt:Date.now()}));
    const events=read(keys.events,null);if(events&&(!Array.isArray(events.completed)))localStorage.setItem(keys.events,JSON.stringify({completed:[],runs:{},updatedAt:Date.now(),streak:0,bestStreak:0,lastEventId:null}));
    const streetEvents=read(keys.streetEvents,null);if(streetEvents){
      if(!Array.isArray(streetEvents.completed))streetEvents.completed=[];
      if(!streetEvents.runs||typeof streetEvents.runs!=='object'||Array.isArray(streetEvents.runs))streetEvents.runs={};
      streetEvents.crowdHype=Math.max(0,Math.min(100,num(streetEvents.crowdHype,0)));
      streetEvents.bestHype=Math.max(streetEvents.crowdHype,Math.max(0,Math.min(100,num(streetEvents.bestHype,0))));
      const totalRuns=Object.values(streetEvents.runs).reduce((sum,v)=>sum+Math.max(0,num(v,0)),0);
      streetEvents.streetRep=Math.max(0,Math.min(100,totalRuns*6+Math.floor(streetEvents.crowdHype/2)));
      if(!streetEvents.sets||typeof streetEvents.sets!=='object'||Array.isArray(streetEvents.sets))streetEvents.sets={active:null,step:0,completed:[],history:[],momentum:0,bestMomentum:0,lastEvent:null,lastResult:null};
      if(typeof streetEvents.sets.active!=='string')streetEvents.sets.active=null;
      streetEvents.sets.step=Math.max(0,Math.floor(num(streetEvents.sets.step,0)));
      if(!Array.isArray(streetEvents.sets.completed))streetEvents.sets.completed=[];
      if(!Array.isArray(streetEvents.sets.history))streetEvents.sets.history=[];
      streetEvents.sets.momentum=Math.max(0,Math.min(100,num(streetEvents.sets.momentum,0)));
      streetEvents.sets.bestMomentum=Math.max(streetEvents.sets.momentum,Math.max(0,Math.min(100,num(streetEvents.sets.bestMomentum,0))));
      streetEvents.sets.lastEvent=typeof streetEvents.sets.lastEvent==='string'?streetEvents.sets.lastEvent:null;
      if(!streetEvents.audience||typeof streetEvents.audience!=='object'||Array.isArray(streetEvents.audience))streetEvents.audience={people:{},crews:{},history:[],updatedAt:0,lastEvent:null};
      if(!streetEvents.audience.people||typeof streetEvents.audience.people!=='object'||Array.isArray(streetEvents.audience.people))streetEvents.audience.people={};
      if(!streetEvents.audience.crews||typeof streetEvents.audience.crews!=='object'||Array.isArray(streetEvents.audience.crews))streetEvents.audience.crews={};
      if(!Array.isArray(streetEvents.audience.history))streetEvents.audience.history=[];
      streetEvents.audience.updatedAt=num(streetEvents.audience.updatedAt,Date.now());
      streetEvents.audience.lastEvent=typeof streetEvents.audience.lastEvent==='string'?streetEvents.audience.lastEvent:null;
      streetEvents.updatedAt=num(streetEvents.updatedAt,Date.now());
      localStorage.setItem(keys.streetEvents,JSON.stringify(streetEvents));
    }
    const circuits=read(keys.circuits,null);if(circuits){
      if(!Array.isArray(circuits.completed))circuits.completed=[];
      if(!Array.isArray(circuits.history))circuits.history=[];
      circuits.active=typeof circuits.active==='string'?circuits.active:null;
      circuits.step=Math.max(0,Math.floor(num(circuits.step,0)));
      circuits.updatedAt=num(circuits.updatedAt,Date.now());
      localStorage.setItem(keys.circuits,JSON.stringify(circuits));
    }
    const districtStory=read(keys.districtStory,null);if(districtStory){
      districtStory.activeRoute=typeof districtStory.activeRoute==='string'?districtStory.activeRoute:null;
      if(!Array.isArray(districtStory.completed))districtStory.completed=[];
      districtStory.updatedAt=num(districtStory.updatedAt,Date.now());
      if(typeof districtStory.remoteStoryStatus!=='string')districtStory.remoteStoryStatus='offline_ready';
      localStorage.setItem(keys.districtStory,JSON.stringify(districtStory));
    }
    const routeMemory=read(keys.routeMemory,null);if(routeMemory){
      if(!routeMemory.districts||typeof routeMemory.districts!=='object'||Array.isArray(routeMemory.districts))routeMemory.districts={};
      if(!Array.isArray(routeMemory.encounters))routeMemory.encounters=[];
      if(!routeMemory.relationships||typeof routeMemory.relationships!=='object'||Array.isArray(routeMemory.relationships))routeMemory.relationships={};
      if(!routeMemory.opportunities||typeof routeMemory.opportunities!=='object'||Array.isArray(routeMemory.opportunities))routeMemory.opportunities={active:null,completed:[],history:[]};
      if(!Array.isArray(routeMemory.opportunities.completed))routeMemory.opportunities.completed=[];
      if(!Array.isArray(routeMemory.opportunities.history))routeMemory.opportunities.history=[];
      if(routeMemory.opportunities.active&&typeof routeMemory.opportunities.active!=='object')routeMemory.opportunities.active=null;
      routeMemory.lastFingerprint=typeof routeMemory.lastFingerprint==='string'?routeMemory.lastFingerprint:null;
      routeMemory.updatedAt=num(routeMemory.updatedAt,Date.now());
      if(typeof routeMemory.remoteStatus!=='string')routeMemory.remoteStatus='offline_ready';
      localStorage.setItem(keys.routeMemory,JSON.stringify(routeMemory));
    }
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
