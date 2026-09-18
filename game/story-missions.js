(() => {
  const KEY='tgg-story-missions-v1';
  const $=id=>document.getElementById(id);
  const defaults=()=>({
    active:false,
    completed:false,
    step:0,
    startedAt:0,
    completedAt:0,
    baselines:null,
    lastSync:0
  });
  let state=defaults();

  const steps=[
    {id:'manager',title:'MEET M',detail:'Open the manager opportunity and lock in your first contract.',go:'phone'},
    {id:'job',title:'WORK THE CITY',detail:'Complete one city job for M.',go:'jobs'},
    {id:'studio',title:'LOCK IN',detail:'Record a new track in the studio.',go:'studio'},
    {id:'battle',title:'WIN THE ROOM',detail:'Win one rap battle.',go:'battle'},
    {id:'show',title:'TOUCH THE STAGE',detail:'Complete one live show.',go:'show'},
    {id:'mixtape',title:'DROP THE TAPE',detail:'Release your first mixtape.',go:'career'}
  ];

  function snapshot(){
    const career=window.TGGCareer?.career||{};
    const life=window.TGGWorldLife?.getState?.()||{};
    const content=window.TGGContent?.state||{};
    const director=window.TGGCareerDirector?.getState?.()||{};
    return {
      jobs:Array.isArray(content.completed)?content.completed.length:0,
      recordings:Number(career.recordings)||0,
      battleWins:Number(life.battleWins)||0,
      shows:Number(life.shows)||0,
      mixtapes:Number(career.mixtapes)||0,
      managerContract:director?.activeContract?.contactId==='manager',
      managerHistory:Array.isArray(director.history)&&director.history.some(x=>x?.title==='MANAGER MOVE')
    };
  }

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
    }catch(e){state=defaults();}
    if(!Number.isInteger(state.step))state.step=0;
    if(state.step<0)state.step=0;
    if(state.step>steps.length)state.step=steps.length;
    return state;
  }

  function save(){
    state.lastSync=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function notify(text){window.__tggToast?window.__tggToast(text):console.log(text)}

  function start(){
    if(state.completed)return state;
    if(!state.active){
      const s=snapshot();
      state.active=true;
      state.step=0;
      state.startedAt=Date.now();
      state.baselines={
        jobs:s.jobs,
        recordings:s.recordings,
        battleWins:s.battleWins,
        shows:s.shows,
        mixtapes:s.mixtapes
      };
      save();
      notify('STORY MISSION STARTED — FIRST CONTRACT');
    }
    render();
    return state;
  }

  function isStepComplete(index,s=snapshot()){
    const b=state.baselines||{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0};
    if(index===0)return s.managerContract||s.managerHistory;
    if(index===1)return s.jobs>b.jobs;
    if(index===2)return s.recordings>b.recordings;
    if(index===3)return s.battleWins>b.battleWins;
    if(index===4)return s.shows>b.shows;
    if(index===5)return s.mixtapes>b.mixtapes;
    return false;
  }

  function finish(){
    if(state.completed)return;
    state.active=false;
    state.completed=true;
    state.step=steps.length;
    state.completedAt=Date.now();
    save();
    window.TGGGame?.reward?.(1000,250);
    window.TGGCareer?.addRep?.(100);
    window.TGGProgression?.sync?.();
    notify('FIRST CONTRACT COMPLETE — +$1000 • +250 XP • +100 REP');
    render();
  }

  function sync(){
    if(!state.active||state.completed)return state;
    let advanced=false;
    while(state.step<steps.length&&isStepComplete(state.step)){
      state.step++;
      advanced=true;
      if(state.step<steps.length)notify('STORY ADVANCED — '+steps[state.step].title);
    }
    if(state.step>=steps.length)finish();
    else if(advanced)save();
    render();
    return state;
  }

  function go(target){
    if(target==='phone'){
      window.TGGWorldLife?.setTab?.('phone');
      window.TGGGame?.show?.('worldLifeBoard');
      return true;
    }
    if(target==='jobs'){window.TGGGame?.show?.('contentBoard');return true}
    if(target==='studio'){window.TGGGame?.show?.('studio');return true}
    if(target==='battle'||target==='show'){
      window.TGGWorldLife?.setTab?.(target);
      window.TGGGame?.show?.('worldLifeBoard');
      return true;
    }
    if(target==='career'){window.TGGGame?.show?.('career');return true}
    return false;
  }

  function doCurrent(){
    if(!state.active&&!state.completed)start();
    if(state.completed)return false;
    const step=steps[state.step];
    if(!step)return false;
    if(step.id==='manager'){
      const life=window.TGGWorldLife?.getState?.()||{};
      if(!life.activeOpportunity||life.activeOpportunity.contactId!=='manager'){
        window.TGGWorldLife?.callContact?.('manager');
      }
      window.TGGCareerDirector?.captureOpportunity?.();
      sync();
      if(!isStepComplete(0))go('phone');
      return true;
    }
    return go(step.go);
  }

  function reset(){
    state=defaults();
    save();
    render();
    notify('FIRST CONTRACT RESET');
    return state;
  }

  function status(){
    const current=steps[state.step]||null;
    return {
      ...state,
      current,
      progress:Math.min(100,Math.round((state.step/steps.length)*100)),
      steps:steps.map((x,i)=>({...x,done:i<state.step,active:state.active&&i===state.step}))
    };
  }

  function render(){
    const root=$('storyMissionsBoard');
    if(!root)return;
    const st=status();
    const title=$('storyMissionTitle');
    const detail=$('storyMissionDetail');
    const progress=$('storyMissionProgress');
    const label=$('storyMissionProgressLabel');
    const list=$('storyMissionSteps');
    const action=$('storyMissionAction');

    if(title)title.textContent=st.completed?'FIRST CONTRACT COMPLETE':(st.current?.title||'FIRST CONTRACT');
    if(detail)detail.textContent=st.completed
      ?'You built your first complete artist run through the city.'
      :st.active?(st.current?.detail||'Keep moving.'):'Start the first connected career storyline.';
    if(progress)progress.style.width=st.progress+'%';
    if(label)label.textContent=st.completed?'100% COMPLETE':st.progress+'% COMPLETE';

    if(list)list.innerHTML=st.steps.map((x,i)=>
      '<article class="story-step '+(x.done?'done ':'')+(x.active?'active':'')+'">'+
      '<span>'+(x.done?'✓':String(i+1).padStart(2,'0'))+'</span>'+
      '<div><b>'+x.title+'</b><small>'+x.detail+'</small></div>'+
      '</article>'
    ).join('');

    if(action){
      action.textContent=st.completed?'MISSION COMPLETE':st.active?'GO TO '+(st.current?.title||'NEXT STEP'):'START FIRST CONTRACT';
      action.disabled=st.completed;
    }

    $('storyMissionReset')?.classList.toggle('hidden',!st.active&&!st.completed);
  }

  function bind(){
    $('storyMissionsBtn')?.addEventListener('click',()=>{
      window.TGGGame?.show?.('storyMissionsBoard');
      sync();
    });
    $('storyMissionBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    $('storyMissionAction')?.addEventListener('click',doCurrent);
    $('storyMissionReset')?.addEventListener('click',reset);
    setInterval(sync,900);
    render();
  }

  window.TGGStoryMissions={start,sync,go,doCurrent,reset,status,render,snapshot};
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();