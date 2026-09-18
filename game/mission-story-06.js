(() => {
  const KEY='tgg-story-mission-v6';
  const mission={
    id:'build-the-team',name:'MISSION 06 — BUILD THE TEAM',
    summary:'The city knows your name. Now build the team that can turn one win into a career.',
    reward:{cash:2000,xp:320,rep:260},
    members:[
      {id:'kane',label:'KANE • PRODUCER'},
      {id:'nova',label:'NOVA • PROMOTER'},
      {id:'lens',label:'LENS • DIRECTOR'}
    ]
  };
  let state={accepted:false,step:'locked',recruited:[],completed:false,rewardClaimed:false,campaignScore:0,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function mission05Complete(){try{return JSON.parse(localStorage.getItem('tgg-story-mission-v5')||'{}')?.completed===true}catch{return false}}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s);if(!Array.isArray(state.recruited))state.recruited=[]}catch{}sync(false);return state}
  function refreshRecruited(){state.recruited=mission.members.filter(m=>window.TGGCrew?.has?.(m.id)).map(m=>m.id);return state.recruited}
  function computeStep(){
    if(state.completed)return 'complete';
    if(!mission05Complete())return 'locked';
    if(!state.accepted)return 'offer';
    refreshRecruited();
    if(state.recruited.length<mission.members.length)return 'recruit';
    if(!window.TGGCrewCampaign?.state?.completed)return 'campaign';
    return 'return';
  }
  function sync(renderNow=true){state.campaignScore=Number(window.TGGCrewCampaign?.state?.score||0);state.step=computeStep();save();if(renderNow)render();return state}
  function accept(){if(!mission05Complete()||state.completed)return false;state.accepted=true;state.step='recruit';window.TGGCrewCampaign?.reset?.();save();notify('MISSION 06 ACCEPTED — BUILD THE TEAM');render();return true}
  function recruit(id){
    if(computeStep()!=='recruit'||!mission.members.some(m=>m.id===id))return false;
    const ok=window.TGGCrew?.storyRecruit?.(id);
    refreshRecruited();save();render();return !!ok;
  }
  function act(){
    sync(false);
    if(state.step==='locked'){notify('FINISH MISSION 05 FIRST');render();return false}
    if(state.step==='offer')return accept();
    if(state.step==='recruit'){notify('RECRUIT PRODUCER • PROMOTER • DIRECTOR');render();return false}
    if(state.step==='campaign'){const ok=window.TGGCrewCampaign?.start?.();render();return !!ok}
    if(state.step==='return')return claim();
    return false;
  }
  function claim(){
    sync(false);if(state.step!=='return'||state.rewardClaimed)return false;
    const applied=window.TGGEconomy?.apply?.(mission.reward)||mission.reward;
    state.campaignScore=Number(window.TGGCrewCampaign?.state?.score||0);state.rewardClaimed=true;state.completed=true;state.step='complete';save();
    notify('MISSION 06 COMPLETE — TEAM SCORE '+state.campaignScore+' • +$'+applied.cash);render();return true;
  }
  function render(){
    const status=document.getElementById('mission06Status'),main=document.getElementById('mission06Btn');
    if(!status||!main)return;
    const step=computeStep();state.step=step;refreshRecruited();
    document.querySelectorAll('[data-mission06-recruit]').forEach(b=>{const id=b.dataset.mission06Recruit;b.hidden=step!=='recruit';b.disabled=step!=='recruit'||window.TGGCrew?.has?.(id);b.textContent=window.TGGCrew?.has?.(id)?'RECRUITED • '+(window.TGGCrew?.get?.(id)?.name||id):'RECRUIT '+(window.TGGCrew?.get?.(id)?.name||id)});
    main.disabled=false;
    if(step==='locked'){status.textContent='LOCKED • Complete Mission 05 — Rival Call-Out.';main.textContent='LOCKED';main.disabled=true}
    else if(step==='offer'){status.textContent=mission.summary;main.textContent='START BUILDING THE TEAM'}
    else if(step==='recruit'){status.textContent='CREW '+state.recruited.length+'/3 • Add Kane, Nova and Lens.';main.textContent='RECRUIT THE FULL CREW';main.disabled=true}
    else if(step==='campaign'){status.textContent='CREW READY • Run the single + visual + rollout campaign.';main.textContent='RUN CREW CAMPAIGN'}
    else if(step==='return'){status.textContent='CAMPAIGN COMPLETE • TEAM SCORE '+Number(window.TGGCrewCampaign?.state?.score||0)+'. Return to M.';main.textContent='CLAIM MISSION 06'}
    else{status.textContent='COMPLETE • CREW LOCKED • TEAM SCORE '+state.campaignScore;main.textContent='MISSION 06 COMPLETE';main.disabled=true}
    save();
  }
  document.getElementById('mission06Btn')?.addEventListener('click',act);
  document.querySelectorAll('[data-mission06-recruit]').forEach(b=>b.addEventListener('click',()=>recruit(b.dataset.mission06Recruit)));
  document.querySelectorAll('[data-crew-campaign]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>sync(true),0)));
  load();window.TGGStoryMission06={mission,state,load,save,accept,recruit,act,claim,sync,mission05Complete,refreshRecruited,render};render();
})();