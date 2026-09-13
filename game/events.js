(() => {
  const KEY='tgg-events-v1';
  const events=[
    {id:'street-cypher',name:'Street Cypher',district:'Downtown',cash:180,xp:35,rep:10,detail:'Jump into a city cypher and build your name.'},
    {id:'studio-pop-in',name:'Studio Pop-In',district:'Studio Row',cash:275,xp:55,rep:20,detail:'Help finish a late-night studio session.'},
    {id:'release-rush',name:'Release Rush',district:'Mixtape Ave',cash:450,xp:90,rep:35,detail:'Push a release through the city before the window closes.'}
  ];
  let state={completed:[],runs:{},updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.completed))state.completed=[];if(!state.runs||typeof state.runs!=='object')state.runs={}}catch(e){state={completed:[],runs:{},updatedAt:0}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return events.find(x=>x.id===id)||null}
  function run(id){
    const event=get(id);if(!event)return false;
    if(window.TGGDistricts?.canEnter&&!window.TGGDistricts.canEnter(event.district)){const level=window.TGGDistricts.get?.(event.district)?.level||1;window.__tggToast?.('LEVEL '+level+' REQUIRED FOR '+event.district.toUpperCase());return false}
    const cashBonus=window.TGGCrew?.bonus?.('cash')||0;
    const xpBonus=window.TGGCrew?.bonus?.('xp')||0;
    const repBonus=window.TGGCrew?.bonus?.('rep')||0;
    window.TGGGame?.reward?.(event.cash+cashBonus,event.xp+xpBonus);
    window.TGGCareer?.addRep?.(event.rep+repBonus);
    state.runs[id]=(Number(state.runs[id])||0)+1;
    if(!state.completed.includes(id))state.completed.push(id);
    save();
    window.__tggToast?.(event.name+' COMPLETE — +$'+(event.cash+cashBonus)+' / +'+(event.xp+xpBonus)+' XP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span>${open?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render};
})();
