(() => {
  const KEY='tgg-story-mission-v4';
  const mission={
    id:'the-headliner',
    name:'MISSION 04 — THE HEADLINER',
    summary:'The city knows your name. Now prove you can control a live crowd.',
    routes:{
      club:{
        id:'club',
        label:'PACK THE CLUB',
        contentId:'club-push',
        consequence:'CLUB_HEADLINER',
        reward:{cash:1800,xp:220,rep:120},
        detail:'Go intimate, sell the room out and make the club feel like your block.'
      },
      festival:{
        id:'festival',
        label:'OWN THE FESTIVAL',
        contentId:'festival-push',
        consequence:'FESTIVAL_BREAKOUT',
        reward:{cash:1100,xp:350,rep:240},
        detail:'Take the bigger stage, win over strangers and turn the festival into your crowd.'
      }
    }
  };

  let state={
    accepted:false,choice:null,step:'locked',completed:false,rewardClaimed:false,
    consequence:null,priorCareer:null,performanceScore:0,kitGranted:false,updatedAt:0
  };

  const notify=text=>window.__tggToast?.(text);
  const completedContent=()=>Array.isArray(window.TGGContent?.state?.completed)?window.TGGContent.state.completed:[];
  function mission03State(){
    try{return JSON.parse(localStorage.getItem('tgg-story-mission-v3')||'{}')}catch{return {}}
  }
  function mission03Complete(){return mission03State()?.completed===true}
  function save(){
    state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }
  function load(){
    try{state={...state,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
    if(!state.priorCareer)state.priorCareer=mission03State()?.consequence||null;
    sync(false);
    return state;
  }
  function route(){return state.choice?mission.routes[state.choice]||null:null}
  function computeStep(){
    if(state.completed)return 'complete';
    if(!mission03Complete())return 'locked';
    if(!state.accepted)return 'offer';
    if(!state.choice)return 'choice';
    if(!completedContent().includes(route().contentId))return 'route';
    if(!window.TGGPerformance?.state?.completed)return 'performance';
    return 'return';
  }
  function sync(shouldRender=true){
    const next=computeStep();
    if(!state.priorCareer)state.priorCareer=mission03State()?.consequence||null;
    state.performanceScore=Number(window.TGGPerformance?.state?.score||0);
    if(state.step!==next){state.step=next;save();}
    if(shouldRender)render();
    return state;
  }
  function accept(){
    if(!mission03Complete()||state.completed)return false;
    if(!state.accepted){
      state.accepted=true;
      state.priorCareer=mission03State()?.consequence||state.priorCareer;
      state.step='choice';
      window.TGGInventory?.mission04Pack?.();
      if(!state.kitGranted){
        ['club-booking','festival-kit','headline-pass'].forEach(id=>{
          if(!window.TGGInventory?.has?.(id,1))window.TGGInventory?.add?.(id,1);
        });
        state.kitGranted=true;
      }
      window.TGGPerformance?.reset?.();
      save();
      notify('MISSION 04 ACCEPTED — THE HEADLINER');
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
    notify(id==='club'?'CLUB ROUTE LOCKED — PACK THE ROOM':'FESTIVAL ROUTE LOCKED — TAKE THE BIG STAGE');
    render();
    return true;
  }
  function startContent(){
    const r=route();
    const ok=window.TGGContent?.start?.(r?.contentId);
    if(ok){
      window.TGGGame?.show?.('contentBoard');
      notify(r.label+' — PROMO RUN STARTED');
    }
    render();
    return !!ok;
  }
  function act(){
    sync(false);
    if(state.step==='locked'){notify('FINISH MISSION 03 FIRST');render();return false;}
    if(state.step==='offer')return accept();
    if(state.step==='choice'){notify('CHOOSE CLUB OR FESTIVAL');render();return false;}
    if(state.step==='route')return startContent();
    if(state.step==='performance'){
      const ok=window.TGGPerformance?.start?.(state.choice);
      render();
      return !!ok;
    }
    if(state.step==='return')return claim();
    notify('MISSION 04 COMPLETE');
    return false;
  }
  function claim(){
    sync(false);
    if(state.step!=='return'||state.rewardClaimed||!route())return false;
    const applied=window.TGGEconomy?.apply?.(route().reward)||route().reward;
    state.performanceScore=Number(window.TGGPerformance?.state?.score||0);
    state.rewardClaimed=true;
    state.completed=true;
    state.step='complete';
    save();
    notify('MISSION 04 COMPLETE — '+state.consequence+' • CROWD '+state.performanceScore+' • +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
    render();
    return true;
  }
  function render(){
    const status=document.getElementById('mission04Status');
    const main=document.getElementById('mission04Btn');
    const club=document.getElementById('mission04Club');
    const festival=document.getElementById('mission04Festival');
    if(!status||!main||!club||!festival)return;

    const step=computeStep();
    state.step=step;
    club.hidden=step!=='choice';
    festival.hidden=step!=='choice';
    club.disabled=step!=='choice';
    festival.disabled=step!=='choice';
    main.disabled=false;

    const prior=state.priorCareer?' • Career: '+state.priorCareer:'';
    if(step==='locked'){
      status.textContent='LOCKED • Complete Mission 03 — The Offer.';
      main.textContent='LOCKED';
      main.disabled=true;
    }else if(step==='offer'){
      status.textContent=mission.summary+prior;
      main.textContent='BOOK THE HEADLINE';
    }else if(step==='choice'){
      status.textContent='VENUE CHOICE'+prior+' • Pack the club for cash or own the festival for XP/REP.';
      main.textContent='CHOOSE THE STAGE';
      main.disabled=true;
    }else if(step==='route'){
      const r=route();
      status.textContent=r.label+' • '+r.detail;
      main.textContent='START '+r.label;
    }else if(step==='performance'){
      status.textContent='SHOWTIME • Route ready. Take the stage and get the crowd score to 90+.';
      main.textContent='TAKE THE STAGE';
    }else if(step==='return'){
      status.textContent='SHOW COMPLETE • Crowd score '+Number(window.TGGPerformance?.state?.score||0)+'. Return to M.';
      main.textContent='CLAIM MISSION 04';
    }else{
      status.textContent='COMPLETE • '+state.consequence+' • Crowd '+state.performanceScore+'.';
      main.textContent='MISSION 04 COMPLETE';
      main.disabled=true;
    }
    save();
  }

  document.getElementById('mission04Btn')?.addEventListener('click',act);
  document.getElementById('mission04Club')?.addEventListener('click',()=>choose('club'));
  document.getElementById('mission04Festival')?.addEventListener('click',()=>choose('festival'));
  document.getElementById('advanceContentBtn')?.addEventListener('click',()=>setTimeout(()=>sync(true),0));
  document.querySelectorAll('[data-mission]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  document.querySelectorAll('[data-show-move]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>sync(true),0)));

  load();
  window.TGGStoryMission04={mission,state,load,save,accept,choose,act,claim,sync,route,mission03State,mission03Complete,render};
  render();
})();