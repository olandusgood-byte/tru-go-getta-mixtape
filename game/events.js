(() => {
  const KEY='tgg-events-v1';
  const events=[
    {id:'street-cypher',name:'Street Cypher',district:'Downtown',cash:180,xp:35,rep:10,detail:'Jump into a city cypher and build your name.',requires:[{id:'notebook',qty:1}]},
    {id:'studio-pop-in',name:'Studio Pop-In',district:'Studio Row',cash:275,xp:55,rep:20,detail:'Help finish a late-night studio session.',requires:[{id:'mic',qty:1}]},
    {id:'release-rush',name:'Release Rush',district:'Mixtape Ave',cash:450,xp:90,rep:35,detail:'Push a release through the city before the window closes.',requires:[{id:'beat-pack',qty:1},{id:'promo-flyers',qty:1}]}
  ];
  let state={completed:[],runs:{},updatedAt:0,lastReward:null};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.completed))state.completed=[];if(!state.runs||typeof state.runs!=='object')state.runs={};if(!state.lastReward||typeof state.lastReward!=='object')state.lastReward=null}catch(e){state={completed:[],runs:{},updatedAt:0,lastReward:null}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return events.find(x=>x.id===id)||null}
  function requirementsMet(event){return (event.requires||[]).every(r=>window.TGGInventory?.has?.(r.id,r.qty))}
  function requirementText(event){return (event.requires||[]).map(r=>{const item=window.TGGInventory?.catalog?.find(x=>x.id===r.id);return (item?.name||r.id)+' x'+r.qty}).join(' + ')}
  function run(id){
    const event=get(id);if(!event)return false;
    if(window.TGGDistricts?.canEnter&&!window.TGGDistricts.canEnter(event.district)){const level=window.TGGDistricts.get?.(event.district)?.level||1;window.__tggToast?.('LEVEL '+level+' REQUIRED FOR '+event.district.toUpperCase());return false}
    if(!requirementsMet(event)){window.__tggToast?.('NEED INVENTORY — '+requirementText(event));return false}
    (event.requires||[]).forEach(r=>window.TGGInventory?.remove?.(r.id,r.qty));
    const cashBonus=Math.max(0,Number(window.TGGCrew?.bonus?.('cash'))||0);
    const xpBonus=Math.max(0,Number(window.TGGCrew?.bonus?.('xp'))||0);
    const repBonus=Math.max(0,Number(window.TGGCrew?.bonus?.('rep'))||0);
    const cash=event.cash+cashBonus;
    const xp=event.xp+xpBonus;
    const rep=event.rep+repBonus;
    window.TGGGame?.reward?.(cash,xp);
    window.TGGCareer?.addRep?.(rep);
    state.runs[id]=(Number(state.runs[id])||0)+1;
    if(!state.completed.includes(id))state.completed.push(id);
    state.lastReward={id,cash,xp,rep,run:state.runs[id]};
    save();
    window.__tggToast?.(event.name+' COMPLETE — +$'+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span><span>NEEDS: ${requirementText(e)}</span>${open&&requirementsMet(e)?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
