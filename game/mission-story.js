(() => {
  const KEY='tgg-story-mission-v1';
  const mission={
    id:'make-noise',
    name:'MISSION 01 — MAKE NOISE',
    summary:'Manager M wants proof you can move through the whole city grind.',
    reward:{cash:750,xp:150,rep:75},
    steps:[
      {id:'meet-m',label:'Meet Manager M',detail:'Accept the run and get your first objective.'},
      {id:'flyer-run',label:'Flood Downtown',detail:'Complete Flyer Run in Downtown.',contentId:'flyer-run'},
      {id:'studio-session',label:'Lock In',detail:'Complete Studio Session on Studio Row.',contentId:'studio-session'},
      {id:'mixtape-promo',label:'Make Noise',detail:'Complete Mixtape Promo on Mixtape Ave.',contentId:'mixtape-promo'},
      {id:'return-m',label:'Return To M',detail:'Collect the story bonus and unlock the next chapter.'}
    ]
  };
  let state={accepted:false,step:0,completed:false,rewardClaimed:false,updatedAt:0};

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...state,...saved};
    }catch{}
    sync(false);
    return state;
  }
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function completedContent(){
    return Array.isArray(window.TGGContent?.state?.completed)?window.TGGContent.state.completed:[];
  }
  function computeStep(){
    if(!state.accepted)return 0;
    const done=completedContent();
    if(!done.includes('flyer-run'))return 1;
    if(!done.includes('studio-session'))return 2;
    if(!done.includes('mixtape-promo'))return 3;
    return 4;
  }
  function notify(text){window.__tggToast?.(text);}
  function accept(){
    if(state.completed)return false;
    if(!state.accepted){
      state.accepted=true;
      state.step=1;
      save();
      notify('MISSION ACCEPTED — MAKE NOISE');
    }
    render();
    return true;
  }
  function currentStep(){
    state.step=state.completed?mission.steps.length:computeStep();
    return mission.steps[Math.min(state.step,mission.steps.length-1)]||null;
  }
  function act(){
    if(state.completed){notify('MISSION 01 COMPLETE');return false;}
    if(!state.accepted)return accept();
    sync(false);
    const step=currentStep();
    if(step?.contentId){
      const ok=window.TGGContent?.start?.(step.contentId);
      if(ok){
        window.TGGGame?.show?.('contentBoard');
        notify(step.label.toUpperCase()+' — STARTED');
      }
      render();
      return !!ok;
    }
    if(state.step===4)return claim();
    return false;
  }
  function claim(){
    sync(false);
    if(state.step!==4||state.rewardClaimed)return false;
    const applied=window.TGGEconomy?.apply?.(mission.reward)||mission.reward;
    state.rewardClaimed=true;
    state.completed=true;
    state.step=mission.steps.length;
    save();
    notify('MISSION COMPLETE — +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
    render();
    return true;
  }
  function sync(shouldRender=true){
    if(state.completed){if(shouldRender)render();return state;}
    const next=computeStep();
    if(next!==state.step){state.step=next;save();}
    if(shouldRender)render();
    return state;
  }
  function render(){
    const status=document.getElementById('missionStoryStatus');
    const button=document.getElementById('missionStoryBtn');
    if(!status||!button)return;
    if(state.completed){
      status.textContent='COMPLETE • Manager M is ready with the next chapter.';
      button.textContent='MISSION COMPLETE';
      button.disabled=true;
      return;
    }
    const step=currentStep();
    const stepNumber=Math.min(state.step+1,mission.steps.length);
    status.textContent=state.accepted
      ? 'STEP '+stepNumber+'/'+mission.steps.length+' • '+step.label+' — '+step.detail
      : mission.summary;
    button.disabled=false;
    button.textContent=!state.accepted?'ACCEPT MISSION':state.step===4?'RETURN TO M / CLAIM':'START '+step.label.toUpperCase();
  }

  document.getElementById('missionStoryBtn')?.addEventListener('click',act);
  document.getElementById('contentBtn')?.addEventListener('click',()=>setTimeout(()=>sync(true),0));
  document.getElementById('advanceContentBtn')?.addEventListener('click',()=>setTimeout(()=>sync(true),0));
  document.querySelectorAll('[data-mission]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();
  window.TGGStoryMission={mission,state,load,save,accept,act,claim,sync,currentStep,render};
  render();
})();