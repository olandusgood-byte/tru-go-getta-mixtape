(() => {
  const KEY='tgg-events-v1';
  const events=[
    {id:'street-cypher',name:'Street Cypher',district:'Downtown',cash:180,xp:35,rep:10,detail:'Jump into a city cypher and build your name.',requires:[{id:'notebook',qty:1}]},
    {id:'studio-pop-in',name:'Studio Pop-In',district:'Studio Row',cash:275,xp:55,rep:20,detail:'Help finish a late-night studio session.',requires:[{id:'mic',qty:1}]},
    {id:'release-rush',name:'Release Rush',district:'Mixtape Ave',cash:450,xp:90,rep:35,detail:'Push a release through the city before the window closes.',requires:[{id:'beat-pack',qty:1},{id:'promo-flyers',qty:1}]}
  ];
  let state={completed:[],runs:{},updatedAt:0,lastReward:null,streak:0,bestStreak:0,lastEventId:null};
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...state,...saved};
      if(!Array.isArray(state.completed))state.completed=[];
      if(!state.runs||typeof state.runs!=='object')state.runs={};
      if(!state.lastReward||typeof state.lastReward!=='object')state.lastReward=null;
      state.streak=Math.max(0,Math.floor(Number(state.streak)||0));
      state.bestStreak=Math.max(state.streak,Math.floor(Number(state.bestStreak)||0));
      state.lastEventId=typeof state.lastEventId==='string'?state.lastEventId:null;
    }catch(e){
      state={completed:[],runs:{},updatedAt:0,lastReward:null,streak:0,bestStreak:0,lastEventId:null};
    }
    return state;
  }
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return events.find(x=>x.id===id)||null}
  function requirementsMet(event){return (event.requires||[]).every(r=>window.TGGInventory?.has?.(r.id,r.qty))}
  function requirementText(event){return (event.requires||[]).map(r=>{const item=window.TGGInventory?.catalog?.find(x=>x.id===r.id);return (item?.name||r.id)+' x'+r.qty}).join(' + ')}
  function totalRuns(){return Object.values(state.runs||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0)}
  function mastery(id){
    const runs=Math.max(0,Number(state.runs?.[id])||0);
    const tiers=[
      {id:'rookie',name:'ROOKIE',min:0,next:2},
      {id:'regular',name:'REGULAR',min:2,next:5},
      {id:'known',name:'CITY KNOWN',min:5,next:10},
      {id:'headliner',name:'HEADLINER',min:10,next:null}
    ];
    const tier=[...tiers].reverse().find(x=>runs>=x.min)||tiers[0];
    return {id,tier:tier.id,name:tier.name,runs,nextAt:tier.next,remaining:tier.next===null?0:Math.max(0,tier.next-runs)};
  }
  function cityProfile(){
    const runs=totalRuns();
    const rank=runs>=15?'HEADLINER':runs>=8?'CITY KNOWN':runs>=3?'LOCAL NAME':'STREET ROOKIE';
    return {rank,totalRuns:runs,uniqueCompleted:state.completed.length,streak:state.streak,bestStreak:state.bestStreak,lastEventId:state.lastEventId};
  }
  function recordMomentum(id){
    state.streak=state.lastEventId&&state.lastEventId!==id?state.streak+1:1;
    state.bestStreak=Math.max(state.bestStreak,state.streak);
    state.lastEventId=id;
    return state.streak;
  }
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
    recordMomentum(id);
    if(!state.completed.includes(id))state.completed.push(id);
    state.lastReward={id,cash,xp,rep,run:state.runs[id]};
    save();
    window.TGGProgression?.sync?.();
    window.__tggToast?.(event.name+' COMPLETE — '+String.fromCharCode(36)+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){
    const el=document.getElementById('eventsList');if(!el)return;
    const profile=cityProfile();
    const header='<div class="mission-card city-mastery"><b>CITY MOMENTUM • '+profile.rank+'</b><span>'+profile.totalRuns+' total runs • '+profile.uniqueCompleted+'/'+events.length+' activities cleared • streak '+profile.streak+' • best '+profile.bestStreak+'</span><span>Master different activities to build your city name. Existing cash, XP and REP values stay unchanged.</span></div>';
    const cards=events.map(e=>{
      const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);
      const m=mastery(e.id);
      const next=m.nextAt===null?'MAX MASTERY':m.remaining+' runs to '+(m.nextAt===5?'CITY KNOWN':m.nextAt===10?'HEADLINER':'REGULAR');
      return '<div class="mission-card"><b>'+e.name+' • '+m.name+'</b><span>'+e.detail+'</span><span>'+e.district+' • 
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText,totalRuns,mastery,cityProfile,recordMomentum};
})();
+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span><span>NEEDS: ${requirementText(e)}</span>${open&&requirementsMet(e)?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
+e.cash+' • '+e.xp+' XP • '+e.rep+' REP • '+m.runs+' runs</span><span>MASTERY: '+next+'</span><span>NEEDS: '+requirementText(e)+'</span>'+(open&&requirementsMet(e)?'<button class="primary" data-event-run="'+e.id+'">RUN EVENT</button>':open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>')+'</div>';
    }).join('');
    el.innerHTML=header+cards;
    el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun));
  }
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span><span>NEEDS: ${requirementText(e)}</span>${open&&requirementsMet(e)?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){
    const el=document.getElementById('eventsList');if(!el)return;
    const profile=cityProfile();
    const header='<div class="mission-card city-mastery"><b>CITY MOMENTUM • '+profile.rank+'</b><span>'+profile.totalRuns+' total runs • '+profile.uniqueCompleted+'/'+events.length+' activities cleared • streak '+profile.streak+' • best '+profile.bestStreak+'</span><span>Master different activities to build your city name. Existing cash, XP and REP values stay unchanged.</span></div>';
    const cards=events.map(e=>{
      const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);
      const m=mastery(e.id);
      const next=m.nextAt===null?'MAX MASTERY':m.remaining+' runs to '+(m.nextAt===5?'CITY KNOWN':m.nextAt===10?'HEADLINER':'REGULAR');
      return '<div class="mission-card"><b>'+e.name+' • '+m.name+'</b><span>'+e.detail+'</span><span>'+e.district+' • 
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText,totalRuns,mastery,cityProfile,recordMomentum};
})();
+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span><span>NEEDS: ${requirementText(e)}</span>${open&&requirementsMet(e)?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
+e.cash+' • '+e.xp+' XP • '+e.rep+' REP • '+m.runs+' runs</span><span>MASTERY: '+next+'</span><span>NEEDS: '+requirementText(e)+'</span>'+(open&&requirementsMet(e)?'<button class="primary" data-event-run="'+e.id+'">RUN EVENT</button>':open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>')+'</div>';
    }).join('');
    el.innerHTML=header+cards;
    el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun));
  }
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
+cash+' / +'+xp+' XP / +'+rep+' REP');
    render();return true;
  }
  function render(){const el=document.getElementById('eventsList');if(!el)return;el.innerHTML=events.map(e=>{const open=!window.TGGDistricts?.canEnter||window.TGGDistricts.canEnter(e.district);const runs=Number(state.runs[e.id])||0;return `<div class="mission-card"><b>${e.name}</b><span>${e.detail}</span><span>${e.district} • $${e.cash} • ${e.xp} XP • ${e.rep} REP • ${runs} runs</span><span>NEEDS: ${requirementText(e)}</span>${open&&requirementsMet(e)?`<button class="primary" data-event-run="${e.id}">RUN EVENT</button>`:open?'<span>NEEDS INVENTORY</span>':'<span>LOCKED — LEVEL '+(window.TGGDistricts?.get?.(e.district)?.level||1)+'</span>'}</div>`}).join('');el.querySelectorAll('[data-event-run]').forEach(b=>b.onclick=()=>run(b.dataset.eventRun))}
  load();
  window.TGGEvents={events,state,load,save,get,run,render,requirementsMet,requirementText};
})();
