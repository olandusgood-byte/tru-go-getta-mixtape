(() => {
  const KEY='tgg-story-mission-v5';
  const mission={
    id:'rival-callout',name:'MISSION 05 — RIVAL CALL-OUT',
    summary:'Rico Blaze called your rise fake. Answer him in front of the city.',
    styles:{
      bars:{id:'bars',label:'PURE BARS',consequence:'BAR_FOR_BAR',reward:{cash:1600,xp:260,rep:220}},
      crowd:{id:'crowd',label:'CROWD CONTROL',consequence:'FAN_FAVORITE',reward:{cash:1200,xp:330,rep:300}}
    }
  };
  let state={accepted:false,style:null,step:'locked',completed:false,rewardClaimed:false,consequence:null,battleScore:0,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function mission04Complete(){try{return JSON.parse(localStorage.getItem('tgg-story-mission-v4')||'{}')?.completed===true}catch{return false}}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s)}catch{}sync(false);return state}
  function route(){return state.style?mission.styles[state.style]||null:null}
  function computeStep(){
    if(state.completed)return 'complete';
    if(!mission04Complete())return 'locked';
    if(!state.accepted)return 'offer';
    if(!state.style)return 'choice';
    if(!window.TGGBattle?.state?.completed)return 'battle';
    if(!window.TGGBattle?.state?.won)return 'rematch';
    return 'return';
  }
  function sync(renderNow=true){state.battleScore=Number(window.TGGBattle?.state?.score||0);const n=computeStep();if(state.step!==n){state.step=n;save()}if(renderNow)render();return state}
  function accept(){if(!mission04Complete()||state.completed)return false;if(!state.accepted){state.accepted=true;state.step='choice';window.TGGBattle?.reset?.();save();notify('MISSION 05 ACCEPTED — RIVAL CALL-OUT')}render();return true}
  function choose(id){if(computeStep()!=='choice'||!mission.styles[id])return false;state.style=id;state.consequence=mission.styles[id].consequence;state.step='battle';save();notify(id==='bars'?'PURE BARS — NO GIMMICKS':'CROWD CONTROL — WIN THE ROOM');render();return true}
  function act(){
    sync(false);
    if(state.step==='locked'){notify('FINISH MISSION 04 FIRST');render();return false}
    if(state.step==='offer')return accept();
    if(state.step==='choice'){notify('CHOOSE YOUR BATTLE STYLE');render();return false}
    if(state.step==='battle'||state.step==='rematch'){if(state.step==='rematch')window.TGGBattle?.reset?.();const ok=window.TGGBattle?.start?.(state.style);render();return !!ok}
    if(state.step==='return')return claim();
    return false;
  }
  function claim(){
    sync(false);const r=route();
    if(state.step!=='return'||state.rewardClaimed||!r)return false;
    const applied=window.TGGEconomy?.apply?.(r.reward)||r.reward;
    state.battleScore=Number(window.TGGBattle?.state?.score||0);state.rewardClaimed=true;state.completed=true;state.step='complete';save();
    notify('MISSION 05 COMPLETE — '+state.consequence+' • SCORE '+state.battleScore+' • +$'+applied.cash);render();return true;
  }
  function render(){
    const status=document.getElementById('mission05Status'),main=document.getElementById('mission05Btn'),bars=document.getElementById('mission05Bars'),crowd=document.getElementById('mission05Crowd');
    if(!status||!main||!bars||!crowd)return;
    const step=computeStep();state.step=step;bars.hidden=step!=='choice';crowd.hidden=step!=='choice';bars.disabled=step!=='choice';crowd.disabled=step!=='choice';main.disabled=false;
    if(step==='locked'){status.textContent='LOCKED • Complete Mission 04 — The Headliner.';main.textContent='LOCKED';main.disabled=true}
    else if(step==='offer'){status.textContent=mission.summary;main.textContent='ACCEPT THE CALL-OUT'}
    else if(step==='choice'){status.textContent='Choose your battle style. Pure Bars boosts punchlines; Crowd Control boosts rebuttals.';main.textContent='CHOOSE YOUR STYLE';main.disabled=true}
    else if(step==='battle'){status.textContent=route().label+' • Rico Blaze is waiting at the battle stage.';main.textContent='START RAP BATTLE'}
    else if(step==='rematch'){status.textContent='Rico got that round. Run it back with the same style.';main.textContent='RUN IT BACK'}
    else if(step==='return'){status.textContent='RICO DEFEATED • Battle score '+Number(window.TGGBattle?.state?.score||0)+'. Return to M.';main.textContent='CLAIM MISSION 05'}
    else{status.textContent='COMPLETE • '+state.consequence+' • Battle '+state.battleScore+'.';main.textContent='MISSION 05 COMPLETE';main.disabled=true}
    save();
  }
  document.getElementById('mission05Btn')?.addEventListener('click',act);
  document.getElementById('mission05Bars')?.addEventListener('click',()=>choose('bars'));
  document.getElementById('mission05Crowd')?.addEventListener('click',()=>choose('crowd'));
  document.querySelectorAll('[data-battle-move]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();window.TGGStoryMission05={mission,state,load,save,accept,choose,act,claim,sync,route,mission04Complete,render};render();
})();