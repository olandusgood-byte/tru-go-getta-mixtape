(() => {
  const KEY='tgg-story-mission-v7';
  const mission={
    id:'first-tour',
    name:'MISSION 07 — FIRST TOUR',
    summary:'The team is built. Now prove the crew can move as one unit across the city.',
    routes:{
      city:{label:'CITY CIRCUIT',consequence:'CITY FAVORITE',reward:{cash:2500,xp:420,rep:360}},
      regional:{label:'REGIONAL RUN',consequence:'ROAD TESTED',reward:{cash:2200,xp:520,rep:420}}
    }
  };
  let state={accepted:false,choice:null,step:'locked',completed:false,rewardClaimed:false,tourScore:0,consequence:null,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function mission06Complete(){try{return JSON.parse(localStorage.getItem('tgg-story-mission-v6')||'{}')?.completed===true}catch{return false}}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s)}catch{}sync(false);return state}
  function computeStep(){if(state.completed)return'complete';if(!mission06Complete())return'locked';if(!state.accepted)return'offer';if(!state.choice)return'choice';if(!window.TGGTour?.state?.completed)return'tour';return'return'}
  function sync(renderNow=true){state.tourScore=Number(window.TGGTour?.state?.score||0);state.step=computeStep();save();if(renderNow)render();return state}
  function accept(){if(!mission06Complete()||state.completed)return false;state.accepted=true;state.step='choice';window.TGGTour?.reset?.();save();notify('MISSION 07 ACCEPTED — FIRST TOUR');render();return true}
  function choose(id){if(computeStep()!=='choice'||!mission.routes[id])return false;state.choice=id;state.consequence=mission.routes[id].consequence;save();notify('TOUR ROUTE — '+mission.routes[id].label);render();return true}
  function act(){sync(false);if(state.step==='locked'){notify('FINISH MISSION 06 FIRST');return false}if(state.step==='offer')return accept();if(state.step==='choice'){notify('CHOOSE A TOUR ROUTE');return false}if(state.step==='tour')return !!window.TGGTour?.start?.(state.choice);if(state.step==='return')return claim();return false}
  function claim(){sync(false);if(state.step!=='return'||state.rewardClaimed||!mission.routes[state.choice])return false;const base=mission.routes[state.choice].reward;const scoreBonus=Math.max(0,state.tourScore-150)*5;const total={cash:base.cash+scoreBonus,xp:base.xp,rep:base.rep};const applied=window.TGGEconomy?.apply?.(total)||total;state.rewardClaimed=true;state.completed=true;state.step='complete';save();notify('MISSION 07 COMPLETE — '+state.consequence+' • SCORE '+state.tourScore+' • +$'+applied.cash);render();return true}
  function render(){
    const status=document.getElementById('mission07Status'),main=document.getElementById('mission07Btn'),city=document.getElementById('mission07City'),regional=document.getElementById('mission07Regional');
    if(!status||!main||!city||!regional)return;
    const step=computeStep();state.step=step;city.hidden=step!=='choice';regional.hidden=step!=='choice';city.disabled=step!=='choice';regional.disabled=step!=='choice';main.disabled=false;
    if(step==='locked'){status.textContent='LOCKED • Complete Mission 06 — Build the Team.';main.textContent='LOCKED';main.disabled=true}
    else if(step==='offer'){status.textContent=mission.summary;main.textContent='ACCEPT MISSION 07'}
    else if(step==='choice'){status.textContent='CHOICE • City Circuit pays more cash. Regional Run pays more XP + REP.';main.textContent='CHOOSE TOUR ROUTE';main.disabled=true}
    else if(step==='tour'){status.textContent=mission.routes[state.choice].label+' • Run all 3 tour stops with the crew.';main.textContent='START / RETURN TO TOUR'}
    else if(step==='return'){status.textContent='TOUR COMPLETE • SCORE '+state.tourScore+' • Return to M.';main.textContent='CLAIM MISSION 07'}
    else{status.textContent='COMPLETE • '+state.consequence+' • TOUR SCORE '+state.tourScore;main.textContent='MISSION 07 COMPLETE';main.disabled=true}
    save();
  }
  document.getElementById('mission07Btn')?.addEventListener('click',act);
  document.getElementById('mission07City')?.addEventListener('click',()=>choose('city'));
  document.getElementById('mission07Regional')?.addEventListener('click',()=>choose('regional'));
  document.querySelectorAll('[data-tour-stop]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();window.TGGStoryMission07={mission,state,load,save,accept,choose,act,claim,sync,mission06Complete,render};render();
})();