(() => {
  const KEY='tgg-events-v1';
  const events=[
    {id:'street-cypher',name:'Street Cypher',district:'Downtown',cash:180,xp:35,rep:10,detail:'Jump into a city cypher and build your name.',requires:[{id:'notebook',qty:1}]},
    {id:'night-market',name:'Night Market Promo',district:'Downtown',cash:220,xp:45,rep:12,detail:'Work the night market and turn foot traffic into listeners.',requires:[{id:'promo-flyers',qty:1}]},
    {id:'studio-pop-in',name:'Studio Pop-In',district:'Studio Row',cash:275,xp:55,rep:20,detail:'Help finish a late-night studio session.',requires:[{id:'mic',qty:1}]},
    {id:'beat-battle',name:'Beat Battle',district:'Studio Row',cash:325,xp:65,rep:24,detail:'Step into a producer battle and prove the crew has range.',requires:[{id:'beat-pack',qty:1}]},
    {id:'release-rush',name:'Release Rush',district:'Mixtape Ave',cash:450,xp:90,rep:35,detail:'Push a release through the city before the window closes.',requires:[{id:'beat-pack',qty:1},{id:'promo-flyers',qty:1}]}
  ];
  let state={completed:[],runs:{},updatedAt:0,lastReward:null};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.completed))state.completed=[];if(!state.runs||typeof state.runs!=='object')state.runs={};if(!state.lastReward||typeof state.lastReward!=='object')state.lastReward=null}catch(e){state={completed:[],runs:{},updatedAt:0,lastReward:null}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return events.find(x=>x.id===id)||null}
  function requirementsMet(event){return (event.requires||[]).every(r=>window.TGGInventory?.has?.(r.id,r.qty))}
  function requirementText(event){return (event.requires||[]).map(r=>{const item=window.TGGInventory?.catalog?.find(x=>x.id===r.id);return (item?.name||r.id)+' x'+r.qty}).join(' + ')}
  function isOpen(event){return !window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(event.district)}
  function status(id){const event=get(id);if(!event)return {id,exists:false,open:false,ready:false,runs:0};return {id,exists:true,open:isOpen(event),ready:isOpen(event)&&requirementsMet(event),runs:Number(state.runs[id])||0,needs:requirementText(event),district:event.district}}
  function summary(){const available=events.filter(isOpen).length;const ready=events.filter(e=>isOpen(e)&&requirementsMet(e)).length;return {total:events.length,available,ready,completed:state.completed.length,lastReward:state.lastReward}}
  function run(id){
    const event=get(id);if(!event)return false;
    if(!isOpen(event)){const level=window.TGGDistricts?.get?.(event.district)?.level||1;window.__tggToast?.('LEVEL '+level+' REQUIRED FOR '+event.district.toUpperCase());render();return false}
    if(!requirementsMet(event)){window.__tggToast?.('NEED INVENTORY — '+requirementText(event));render();return false}
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
    state.lastReward={id,name:event.name,cash,xp,rep,run:state.runs[id],district:event.district};
    save();
    window.TGGProgression?.sync?.();
    window.__tggToast?.(event.name+' COMPLETE — +$'+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){
    const el=document.getElementById('eventsList');if(!el)return;
    const s=summary();
    const last=s.lastReward?`<div class="mission-card"><b>LAST MOVE</b><span>${s.lastReward.name||s.lastReward.id} • Run #${s.lastReward.run}</span><span>+$${s.lastReward.cash} • +${s.lastReward.xp} XP • +${s.lastReward.rep} REP</span></div>`:'';
    el.innerHTML=`<div class="mission-card"><b>CITY PULSE</b><span>${s.ready} event${s.ready===1?'':'s'} ready now • ${s.available}/${s.total} districts accessible</span><span>${s.completed}/${s.total} event types completed</span></div>${last}`+events.map(e=>{const st=status(e.id);return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${st.runs} runs</span><span>NEEDS: ${st.needs}</span>${!st.open?'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>':st.ready?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:'<span>NOT READY — GET THE GEAR</span>'}</div>`}).join('');
    el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun));
  }
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText,isOpen,status,summary};
})();
