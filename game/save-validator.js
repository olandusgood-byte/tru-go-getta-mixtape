(() => {
  const keys={game:'tgg-game-v1',career:'tgg-career-v1',content:'tgg-content-v1',expansion:'tgg-expansion-v1',progression:'tgg-progression-v1',chains:'tgg-chains-v1',districts:'tgg-districts-v1',inventory:'tgg-inventory-v1',crew:'tgg-crew-v1',events:'tgg-events-v1'};
  const num=(v,f,min=0)=>{v=Number(v);return Number.isFinite(v)&&v>=min?v:f};
  const int=(v,f,min=0)=>Math.floor(num(v,f,min));
  function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:fallback}catch(e){return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function repair(){
    const g=read(keys.game,{}); if(Object.keys(g).length){g.level=Math.max(1,int(g.level,1,1));g.cash=num(g.cash,0);g.xp=num(g.xp,0);g.x=num(g.x,50);g.y=num(g.y,50);if(typeof g.name!=='string'||!g.name.trim())g.name='PLAYER';if(typeof g.style!=='string'||!g.style.trim())g.style='Independent';if(typeof g.mission!=='string')g.mission='';if(typeof g.accepted!=='boolean')g.accepted=false;write(keys.game,g)}
    const c=read(keys.career,{});if(Object.keys(c).length){c.studioLevel=Math.max(1,int(c.studioLevel,1,1));c.reputation=num(c.reputation,0);c.recordings=int(c.recordings,0);c.mixtapes=int(c.mixtapes,0);c.upgrades=int(c.upgrades,0);if(!Array.isArray(c.unlocks)||!c.unlocks.length)c.unlocks=['Bedroom Studio'];write(keys.career,c)}
    const content=read(keys.content,null);if(content){if(!Array.isArray(content.completed))content.completed=[];if(!content.active||typeof content.active!=='string')content.active=null;write(keys.content,content)}
    const expansion=read(keys.expansion,null);if(expansion){if(!Array.isArray(expansion.completed))expansion.completed=[];write(keys.expansion,expansion)}
    const progression=read(keys.progression,null);if(progression){if(!Array.isArray(progression.unlocked))progression.unlocked=[];progression.unlocked=[...new Set(progression.unlocked.filter(v=>typeof v==='string'))];write(keys.progression,progression)}
    const chains=read(keys.chains,null);if(chains){if(!Array.isArray(chains.completed))chains.completed=[];chains.completed=[...new Set(chains.completed.filter(v=>typeof v==='string'))];if(chains.active!==null&&typeof chains.active!=='string')chains.active=null;write(keys.chains,chains)}
    const districts=read(keys.districts,null);if(districts){if(!Array.isArray(districts.unlocked))districts.unlocked=[];districts.unlocked=[...new Set(districts.unlocked.filter(v=>typeof v==='string'))];write(keys.districts,districts)}
    const inv=read(keys.inventory,null);if(inv){if(!inv.items||typeof inv.items!=='object'||Array.isArray(inv.items))inv.items={};Object.keys(inv.items).forEach(k=>{inv.items[k]=int(inv.items[k],0)});write(keys.inventory,inv)}
    const crew=read(keys.crew,null);if(crew){if(!Array.isArray(crew.members))crew.members=[];crew.members=[...new Set(crew.members.filter(v=>typeof v==='string'))];write(keys.crew,crew)}
    const events=read(keys.events,null);if(events){if(!Array.isArray(events.completed))events.completed=[];events.completed=[...new Set(events.completed.filter(v=>typeof v==='string'))];if(!events.runs||typeof events.runs!=='object'||Array.isArray(events.runs))events.runs={};Object.keys(events.runs).forEach(k=>{events.runs[k]=int(events.runs[k],0)});if(events.lastReward!==null&&typeof events.lastReward!=='object')events.lastReward=null;write(keys.events,events)}
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
