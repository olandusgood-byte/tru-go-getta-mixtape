(() => {
  const KEY='tgg-progression-v1';
  const achievements=[
    {id:'first-cash',name:'First Bag',detail:'Earn your first dollar.',test:p=>p.cash>0},
    {id:'level-two',name:'On The Rise',detail:'Reach level 2.',test:p=>p.level>=2},
    {id:'first-track',name:'First Track',detail:'Record your first track.',test:(p,c)=>c.recordings>=1},
    {id:'first-mixtape',name:'Tape Season',detail:'Release your first mixtape.',test:(p,c)=>c.mixtapes>=1},
    {id:'first-upgrade',name:'Studio Upgrade',detail:'Upgrade your studio for the first time.',test:(p,c)=>c.upgrades>=1},
    {id:'studio-level-two',name:'Professional',detail:'Reach studio level 2.',test:(p,c)=>c.studioLevel>=2},
    {id:'studio-row-unlocked',name:'Studio Row',detail:'Unlock Studio Row.',test:(p,c,content,exp,crew,events,districts)=>districts.unlocked.includes('studio-row')},
    {id:'mixtape-ave-unlocked',name:'Mixtape Avenue',detail:'Unlock Mixtape Ave.',test:(p,c,content,exp,crew,events,districts)=>districts.unlocked.includes('mixtape-ave')},
    {id:'first-job',name:'City Worker',detail:'Complete your first city job.',test:(p,c,content)=>content.completed.length>=1},
    {id:'first-expansion',name:'Outside The Block',detail:'Complete your first expansion activity.',test:(p,c,content,exp)=>exp.completed.length>=1},
    {id:'big-bag',name:'Five Hundred',detail:'Hold $500 cash.',test:p=>p.cash>=500},
    {id:'first-crew',name:'Build The Team',detail:'Recruit your first crew member.',test:(p,c,content,exp,crew)=>crew.members.length>=1},
    {id:'full-crew',name:'Full Squad',detail:'Recruit all three crew members.',test:(p,c,content,exp,crew)=>crew.members.length>=3},
    {id:'first-event',name:'City After Dark',detail:'Complete your first City Event.',test:(p,c,content,exp,crew,events)=>events.completed.length>=1},
    {id:'city-veteran',name:'City Veteran',detail:'Complete all five City Event types.',test:(p,c,content,exp,crew,events)=>events.completed.length>=5}
  ];
  let state={unlocked:[],updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.unlocked))state.unlocked=[]}catch(e){state={unlocked:[],updatedAt:0}}}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state))}
  function sync(){
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGCCareer?.career||{};
    const content=window.TGGContent?.state||{completed:[]};
    const expansion=window.TGGExpansion?.state||{completed:[]};
    const crew=window.TGGCrew?.state||{members:[]};
    const events=window.TGGEvents?.state||{completed:[]};
    const districts=window.TGGDistricts?.state||{unlocked:[]};
    let changed=false;
    achievements.forEach(a=>{if(!state.unlocked.includes(a.id)&&a.test(p,c,content,expansion,crew,events,districts)){state.unlocked.push(a.id);changed=true;window.__tggToast?.('ACHIEVEMENT UNLOCKED — '+a.name)}});
    if(changed)save();
    render();
    return state;
  }
  function render(){
    const el=document.getElementById('progressionStats'); if(!el)return;
    const p=window.TGGGame?.getState?.()||{};
    const c=window.TGCCareer?.career||{};
    const content=window.TGGContent?.state||{completed:[]};
    const expansion=window.TGGExpansion?.state||{completed:[]};
    const crew=window.TGGCrew?.state||{members:[]};
    const events=window.TGGEvents?.state||{completed:[]};
    el.innerHTML=`<div><b>LEVEL</b><span>${p.level||1}</span></div><div><b>CASH</b><span>$${p.cash||0}</span></div><div><b>REP</b><span>${c.reputation||0}</span></div><div><b>TRACKS</b><span>${c.recordings||0}</span></div><div><b>MIXTAPES</b><span>${c.mixtapes||0}</span></div><div><b>UPGRADES</b><span>${c.upgrades||0}</span></div><div><b>STUDIO</b><span>${c.studioLevel||1}</span></div><div><b>CITY JOBS</b><span>${content.completed?.length||0}</span></div><div><b>EXPANSION</b><span>${expansion.completed?.length||0}</span></div><div><b>CREW</b><span>${crew.members?.length||0}/3</span></div><div><b>CITY EVENTS</b><span>${events.completed?.length||0}/5</span></div>`;
    const list=document.getElementById('achievementList');
    if(list)list.innerHTML=achievements.map(a=>`<div class="mission-card"><b>${state.unlocked.includes(a.id)?'✓':'○'} ${a.name}</b><span>${a.detail}</span></div>`).join('');
  }
  load();
  window.TGGProgression={achievements,state,load,save,sync,render};
})();
