(() => {
  const KEY='tgg-progression-v1';
  const achievements=[
    {id:'first-cash',name:'First Bag',detail:'Earn your first dollar.',test:p=>p.cash>0},
    {id:'level-two',name:'On The Rise',detail:'Reach level 2.',test:p=>p.level>=2},
    {id:'first-track',name:'First Track',detail:'Record your first track.',test:(p,c)=>c.recordings>=1},
    {id:'first-mixtape',name:'Tape Season',detail:'Release your first mixtape.',test:(p,c)=>c.mixtapes>=1},
    {id:'first-upgrade',name:'Studio Upgrade',detail:'Upgrade your studio for the first time.',test:(p,c)=>c.upgrades>=1},
    {id:'studio-level-two',name:'Professional',detail:'Reach studio level 2.',test:(p,c)=>c.studioLevel>=2},
    {id:'first-job',name:'City Worker',detail:'Complete your first city job.',test:(p,c,content)=>content.completed.length>=1},
    {id:'first-expansion',name:'Outside The Block',detail:'Complete your first expansion activity.',test:(p,c,content,exp)=>exp.completed.length>=1},
    {id:'big-bag',name:'Five Hundred',detail:'Hold $500 cash.',test:p=>p.cash>=500},
    {id:'city-regular',name:'Outside Every Day',detail:'Complete 3 city-event runs.',test:(p,c,content,exp,events)=>Object.values(events.runs||{}).reduce((n,v)=>n+(Number(v)||0),0)>=3},
    {id:'city-known',name:'City Knows The Name',detail:'Complete 8 city-event runs.',test:(p,c,content,exp,events)=>Object.values(events.runs||{}).reduce((n,v)=>n+(Number(v)||0),0)>=8},
    {id:'city-headliner',name:'City Headliner',detail:'Complete 15 city-event runs.',test:(p,c,content,exp,events)=>Object.values(events.runs||{}).reduce((n,v)=>n+(Number(v)||0),0)>=15},
    {id:'first-circuit',name:'First Circuit',detail:'Complete your first ordered city circuit.',test:(p,c,content,exp,events,circuits)=>Array.isArray(circuits.completed)&&circuits.completed.length>=1},
    {id:'city-circuit',name:'City Circuit',detail:'Complete the full City Run circuit.',test:(p,c,content,exp,events,circuits)=>Array.isArray(circuits.completed)&&circuits.completed.includes('city-run')},
    {id:'district-story',name:'Across The City',detail:'Complete the district story route.',test:(p,c,content,exp,events,circuits,districtStory)=>Array.isArray(districtStory.completed)&&districtStory.completed.includes('city-story-lap')},
    {id:'know-the-city',name:'Know The City',detail:'Meet M, Kane and DJ V through the district route.',test:(p,c,content,exp,events,circuits,districtStory,routeMemory)=>['m','producer','dj'].every(id=>(routeMemory.encounters||[]).some(x=>x.npcId===id))},
    {id:'trusted-contact',name:'Trusted Contact',detail:'Build any city contact relationship to Trusted.',test:(p,c,content,exp,events,circuits,districtStory,routeMemory)=>Object.values(routeMemory.relationships||{}).some(x=>x&&['TRUSTED','INNER CIRCLE'].includes(x.tier))},
    {id:'first-opportunity',name:'Opportunity Knocks',detail:'Complete your first relationship-gated contact opportunity.',test:(p,c,content,exp,events,circuits,districtStory,routeMemory)=>Array.isArray(routeMemory.opportunities?.completed)&&routeMemory.opportunities.completed.length>=1},
    {id:'contact-chain',name:'Connected Run',detail:'Complete a full contact opportunity chain.',test:(p,c,content,exp,events,circuits,districtStory,routeMemory)=>Array.isArray(routeMemory.opportunities?.chain?.completed)&&routeMemory.opportunities.chain.completed.length>=1}
  ];
  let state={unlocked:[],updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.unlocked))state.unlocked=[]}catch(e){state={unlocked:[],updatedAt:0}}}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state))}
  function sync(){
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGGCareer?.career||{};
    const content=window.TGGContent?.state||{completed:[]};
    const expansion=window.TGGExpansion?.state||{completed:[]};
    const events=window.TGGEvents?.state||{completed:[],runs:{}};
    const circuits=window.TGGCircuits?.state||{completed:[]};
    const districtStory=window.TGGDistrictStory?.state||{completed:[]};
    const routeMemory=window.TGGRouteMemory?.state||{encounters:[]};
    let changed=false;
    achievements.forEach(a=>{if(!state.unlocked.includes(a.id)&&a.test(p,c,content,expansion,events,circuits,districtStory,routeMemory)){state.unlocked.push(a.id);changed=true;window.__tggToast?.('ACHIEVEMENT UNLOCKED — '+a.name)}});
    if(changed)save();
    render();
    return state;
  }
  function render(){
    const el=document.getElementById('progressionStats'); if(!el)return;
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGGCareer?.career||{};
    const content=window.TGGContent?.state||{completed:[]};
    const expansion=window.TGGExpansion?.state||{completed:[]};
    const city=window.TGGEvents?.cityProfile?.()||{rank:'STREET ROOKIE',totalRuns:0};
    const circuits=window.TGGCircuits?.state||{completed:[]};
    const districtStory=window.TGGDistrictStory?.state||{completed:[]};
    const routeMemory=window.TGGRouteMemory?.memorySnapshot?.()||{uniqueNpcIds:[],relationships:{}};
    const trustedContacts=Object.values(routeMemory.relationships||{}).filter(x=>x&&['TRUSTED','INNER CIRCLE'].includes(x.tier)).length;
    const completedOpportunities=routeMemory.opportunities?.completed?.length||0;
    const completedContactChains=routeMemory.opportunities?.chain?.completed?.length||0;
    el.innerHTML=`<div><b>LEVEL</b><span>${p.level||1}</span></div><div><b>CASH</b><span>${p.cash||0}</span></div><div><b>REP</b><span>${c.reputation||0}</span></div><div><b>TRACKS</b><span>${c.recordings||0}</span></div><div><b>MIXTAPES</b><span>${c.mixtapes||0}</span></div><div><b>UPGRADES</b><span>${c.upgrades||0}</span></div><div><b>STUDIO</b><span>${c.studioLevel||1}</span></div><div><b>CITY JOBS</b><span>${content.completed?.length||0}</span></div><div><b>EXPANSION</b><span>${expansion.completed?.length||0}</span></div><div><b>CITY RUNS</b><span>${city.totalRuns||0}</span></div><div><b>CITY RANK</b><span>${city.rank||'STREET ROOKIE'}</span></div><div><b>CIRCUITS</b><span>${circuits.completed?.length||0}</span></div><div><b>STORY ROUTES</b><span>${districtStory.completed?.length||0}</span></div><div><b>CONTACTS MET</b><span>${routeMemory.uniqueNpcIds?.length||0}</span></div><div><b>TRUSTED CONTACTS</b><span>${trustedContacts}</span></div><div><b>OPPORTUNITIES</b><span>${completedOpportunities}</span></div><div><b>CONTACT CHAINS</b><span>${completedContactChains}</span></div>`;
    const list=document.getElementById('achievementList');
    if(list)list.innerHTML=achievements.map(a=>`<div class="mission-card"><b>${state.unlocked.includes(a.id)?'✓':'○'} ${a.name}</b><span>${a.detail}</span></div>`).join('');
  }
  load();
  window.TGGProgression={achievements,state,load,save,sync,render};
})();
