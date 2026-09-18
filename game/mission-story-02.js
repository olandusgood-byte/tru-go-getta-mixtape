(() => {
  const KEY='tgg-story-mission-v2';
  const mission={
    id:'pick-a-side',
    name:'MISSION 02 — PICK A SIDE',
    summary:'The first run made noise. Now DJ V and Kane both want the next move.',
    routes:{
      dj:{
        id:'dj',
        npc:'DJ V',
        label:'RADIO / EXPOSURE',
        contentId:'radio-run',
        consequence:'AIRWAVES',
        reward:{cash:1000,xp:200,rep:150},
        detail:'Push the record through DJ V and build public heat fast.'
      },
      kane:{
        id:'kane',
        npc:'Kane',
        label:'STUDIO / CRAFT',
        contentId:'producer-lockin',
        consequence:'MASTERED',
        reward:{cash:850,xp:275,rep:125},
        detail:'Lock in with Kane and build a stronger record before the spotlight.'
      }
    },
    finale:{id:'city-showdown',label:'CITY SHOWDOWN',contentId:'city-showdown'}
  };

  let state={
    accepted:false,
    choice:null,
    step:'locked',
    completed:false,
    rewardClaimed:false,
    consequence:null,
    updatedAt:0
  };

  const notify=text=>window.__tggToast?.(text);
  const completedContent=()=>Array.isArray(window.TGGContent?.state?.completed)?window.TGGContent.state.completed:[];
  function mission1Complete(){
    try{return JSON.parse(localStorage.getItem('tgg-story-mission-v1')||'{}')?.completed===true}catch{return false}
  }
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...state,...saved};
    }catch{}
    sync(false);
    return state;
  }
  function route(){return state.choice?mission.routes[state.choice]||null:null}
  function computeStep(){
    if(state.completed)return 'complete';
    if(!mission1Complete())return 'locked';
    if(!state.accepted)return 'offer';
    if(!state.choice)return 'choice';
    const done=completedContent();
    if(!done.includes(route().contentId))return 'route';
    if(!done.includes(mission.finale.contentId))return 'finale';
    return 'return';
  }
  function sync(shouldRender=true){
    const next=computeStep();
    if(state.step!==next){state.step=next;save();}
    if(shouldRender)render();
    return state;
  }
  function accept(){
    if(!mission1Complete()||state.completed)return false;
    if(!state.accepted){
      state.accepted=true;
      state.step='choice';
      save();
      notify('MISSION 02 ACCEPTED — PICK A SIDE');
    }
    render();
    return true;
  }
  function choose(id){
    if(computeStep()!=='choice'||!mission.routes[id])return false;
    state.choice=id;
    state.consequence=mission.routes[id].consequence;
    state.step='route';
    save();
    notify(id==='dj'?'YOU CHOSE DJ V — HIT THE AIRWAVES':'YOU CHOSE KANE — LOCK IN');
    render();
    return true;
  }
  function startContent(id,label){
    const ok=window.TGGContent?.start?.(id);
    if(ok){
      window.TGGGame?.show?.('contentBoard');
      notify(label+' — STARTED');
    }
    render();
    return !!ok;
  }
  function act(){
    sync(false);
    if(state.step==='locked'){notify('FINISH MISSION 01 FIRST');render();return false;}
    if(state.step==='offer')return accept();
    if(state.step==='choice'){notify('CHOOSE DJ V OR KANE');render();return false;}
    if(state.step==='route')return startContent(route().contentId,route().label);
    if(state.step==='finale')return startContent(mission.finale.contentId,mission.finale.label);
    if(state.step==='return')return claim();
    notify('MISSION 02 COMPLETE');
    return false;
  }
  function claim(){
    sync(false);
    if(state.step!=='return'||state.rewardClaimed||!route())return false;
    const applied=window.TGGEconomy?.apply?.(route().reward)||route().reward;
    state.rewardClaimed=true;
    state.completed=true;
    state.step='complete';
    save();
    notify('MISSION 02 COMPLETE — '+state.consequence+' • +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
    render();
    return true;
  }
  function render(){
    const status=document.getElementById('mission02Status');
    const main=document.getElementById('mission02Btn');
    const dj=document.getElementById('mission02Dj');
    const kane=document.getElementById('mission02Kane');
    if(!status||!main||!dj||!kane)return;

    const step=computeStep();
    state.step=step;

    dj.hidden=step!=='choice';
    kane.hidden=step!=='choice';
    dj.disabled=step!=='choice';
    kane.disabled=step!=='choice';
    main.disabled=false;

    if(step==='locked'){
      status.textContent='LOCKED • Complete Mission 01 — Make Noise.';
      main.textContent='LOCKED';
      main.disabled=true;
    }else if(step==='offer'){
      status.textContent=mission.summary;
      main.textContent='ACCEPT MISSION 02';
    }else if(step==='choice'){
      status.textContent='CHOICE • DJ V offers exposure. Kane offers craft. Your route and final bonus change.';
      main.textContent='CHOOSE A SIDE';
      main.disabled=true;
    }else if(step==='route'){
      const r=route();
      status.textContent=r.npc+' • '+r.label+' — '+r.detail;
      main.textContent='START '+r.label;
    }else if(step==='finale'){
      status.textContent=state.consequence+' PATH • Your route is complete. Take it to the City Showdown.';
      main.textContent='START CITY SHOWDOWN';
    }else if(step==='return'){
      status.textContent='RETURN TO M • City Showdown complete. Lock in the '+state.consequence+' consequence.';
      main.textContent='CLAIM MISSION 02';
    }else{
      status.textContent='COMPLETE • '+state.consequence+' path is now part of your story.';
      main.textContent='MISSION 02 COMPLETE';
      main.disabled=true;
    }
    save();
  }

  document.getElementById('mission02Btn')?.addEventListener('click',act);
  document.getElementById('mission02Dj')?.addEventListener('click',()=>choose('dj'));
  document.getElementById('mission02Kane')?.addEventListener('click',()=>choose('kane'));
  document.getElementById('advanceContentBtn')?.addEventListener('click',()=>setTimeout(()=>sync(true),0));
  document.querySelectorAll('[data-mission]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();
  window.TGGStoryMission02={mission,state,load,save,accept,choose,act,claim,sync,route,mission1Complete,render};
  render();
})();