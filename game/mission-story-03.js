(() => {
  const KEY='tgg-story-mission-v3';
  const mission={
    id:'the-offer',
    name:'MISSION 03 — THE OFFER',
    summary:'Manager M has a real career decision: take the deal or stay independent.',
    routes:{
      deal:{
        id:'deal',
        label:'TAKE THE DEAL',
        contentId:'label-meeting',
        consequence:'SIGNED',
        reward:{cash:2000,xp:200,rep:100},
        detail:'Take the upfront push, meet the label team and move fast.'
      },
      indie:{
        id:'indie',
        label:'STAY INDEPENDENT',
        contentId:'indie-rollout',
        consequence:'INDEPENDENT',
        reward:{cash:900,xp:350,rep:220},
        detail:'Keep control, build the rollout yourself and earn deeper reputation.'
      }
    },
    finale:{id:'release-night',label:'RELEASE NIGHT',contentId:'release-night'}
  };

  let state={
    accepted:false,
    choice:null,
    step:'locked',
    completed:false,
    rewardClaimed:false,
    consequence:null,
    priorConsequence:null,
    updatedAt:0
  };

  const notify=text=>window.__tggToast?.(text);
  const completedContent=()=>Array.isArray(window.TGGContent?.state?.completed)?window.TGGContent.state.completed:[];
  function mission02State(){
    try{return JSON.parse(localStorage.getItem('tgg-story-mission-v2')||'{}')}catch{return {}}
  }
  function mission02Complete(){return mission02State()?.completed===true}
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
    if(!state.priorConsequence)state.priorConsequence=mission02State()?.consequence||null;
    sync(false);
    return state;
  }
  function route(){return state.choice?mission.routes[state.choice]||null:null}
  function computeStep(){
    if(state.completed)return 'complete';
    if(!mission02Complete())return 'locked';
    if(!state.accepted)return 'offer';
    if(!state.choice)return 'choice';
    const done=completedContent();
    if(!done.includes(route().contentId))return 'route';
    if(!done.includes(mission.finale.contentId))return 'finale';
    return 'return';
  }
  function sync(shouldRender=true){
    const next=computeStep();
    if(!state.priorConsequence)state.priorConsequence=mission02State()?.consequence||null;
    if(state.step!==next){state.step=next;save();}
    if(shouldRender)render();
    return state;
  }
  function accept(){
    if(!mission02Complete()||state.completed)return false;
    if(!state.accepted){
      state.accepted=true;
      state.priorConsequence=mission02State()?.consequence||state.priorConsequence;
      state.step='choice';
      save();
      notify('MISSION 03 ACCEPTED — THE OFFER');
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
    notify(id==='deal'?'YOU TOOK THE DEAL — MEETING SET':'YOU STAYED INDEPENDENT — BUILD IT YOUR WAY');
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
    if(state.step==='locked'){notify('FINISH MISSION 02 FIRST');render();return false;}
    if(state.step==='offer')return accept();
    if(state.step==='choice'){notify('CHOOSE YOUR CAREER PATH');render();return false;}
    if(state.step==='route')return startContent(route().contentId,route().label);
    if(state.step==='finale')return startContent(mission.finale.contentId,mission.finale.label);
    if(state.step==='return')return claim();
    notify('MISSION 03 COMPLETE');
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
    notify('MISSION 03 COMPLETE — '+state.consequence+' • +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
    render();
    return true;
  }
  function render(){
    const status=document.getElementById('mission03Status');
    const main=document.getElementById('mission03Btn');
    const deal=document.getElementById('mission03Deal');
    const indie=document.getElementById('mission03Indie');
    if(!status||!main||!deal||!indie)return;

    const step=computeStep();
    state.step=step;
    deal.hidden=step!=='choice';
    indie.hidden=step!=='choice';
    deal.disabled=step!=='choice';
    indie.disabled=step!=='choice';
    main.disabled=false;

    const prior=state.priorConsequence?' • Previous path: '+state.priorConsequence:'';
    if(step==='locked'){
      status.textContent='LOCKED • Complete Mission 02 — Pick A Side.';
      main.textContent='LOCKED';
      main.disabled=true;
    }else if(step==='offer'){
      status.textContent=mission.summary+prior;
      main.textContent='HEAR THE OFFER';
    }else if(step==='choice'){
      status.textContent='CAREER CHOICE'+prior+' • Take the deal for upfront cash or stay independent for more XP/REP.';
      main.textContent='CHOOSE YOUR PATH';
      main.disabled=true;
    }else if(step==='route'){
      const r=route();
      status.textContent=r.label+' • '+r.detail+prior;
      main.textContent='START '+r.label;
    }else if(step==='finale'){
      status.textContent=state.consequence+' PATH • Your setup is complete. Finish at Release Night.';
      main.textContent='START RELEASE NIGHT';
    }else if(step==='return'){
      status.textContent='RETURN TO M • Release Night complete. Lock in the '+state.consequence+' career path.';
      main.textContent='CLAIM MISSION 03';
    }else{
      status.textContent='COMPLETE • Career path locked: '+state.consequence+'.';
      main.textContent='MISSION 03 COMPLETE';
      main.disabled=true;
    }
    save();
  }

  document.getElementById('mission03Btn')?.addEventListener('click',act);
  document.getElementById('mission03Deal')?.addEventListener('click',()=>choose('deal'));
  document.getElementById('mission03Indie')?.addEventListener('click',()=>choose('indie'));
  document.getElementById('advanceContentBtn')?.addEventListener('click',()=>setTimeout(()=>sync(true),0));
  document.querySelectorAll('[data-mission]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();
  window.TGGStoryMission03={mission,state,load,save,accept,choose,act,claim,sync,route,mission02State,mission02Complete,render};
  render();
})();