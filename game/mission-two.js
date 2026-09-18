(() => {
  const KEY='tgg-story-mission-02-v1';
  const mission={
    id:'earn-the-slot',
    name:'MISSION 02 — EARN THE SLOT',
    summary:'M says the city heard you. Now prove you can perform under pressure.',
    reward:{cash:1200,xp:250,rep:125},
    steps:[
      {id:'meet-m',label:'Check In With M',detail:'Unlock the performance circuit.'},
      {id:'open-mic',label:'Own The Open Mic',detail:'Win the Downtown Open Mic.',activityId:'open-mic'},
      {id:'beat-meet',label:'Impress The Room',detail:'Complete the Beat Meet on Studio Row.',activityId:'beat-meet'},
      {id:'street-show',label:'Rock Mixtape Ave',detail:'Complete the Street Show.',activityId:'street-show'},
      {id:'choose-backup',label:'Choose Your Backing',detail:'Pick DJ V or Kane for the next chapter.'},
      {id:'return-m',label:'Return To M',detail:'Lock the chapter and collect the performance bonus.'}
    ]
  };
  let state={accepted:false,step:0,choice:null,completed:false,rewardClaimed:false,updatedAt:0};

  function missionOneDone(){
    try{
      const s=JSON.parse(localStorage.getItem('tgg-story-mission-v1')||'{}');
      return s.completed===true;
    }catch{return false}
  }
  function load(){try{state={...state,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{} sync(false);return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function done(){return Array.isArray(window.TGGExpansion?.state?.completed)?window.TGGExpansion.state.completed:[]}
  function computeStep(){
    if(!state.accepted)return 0;
    const completed=done();
    if(!completed.includes('open-mic'))return 1;
    if(!completed.includes('beat-meet'))return 2;
    if(!completed.includes('street-show'))return 3;
    if(!state.choice)return 4;
    return 5;
  }
  function notify(t){window.__tggToast?.(t)}
  function accept(){
    if(!missionOneDone()){notify('FINISH MISSION 01 FIRST');return false}
    if(state.completed)return false;
    if(!state.accepted){state.accepted=true;state.step=1;save();notify('MISSION 02 ACCEPTED — EARN THE SLOT')}
    render();return true
  }
  function currentStep(){state.step=state.completed?mission.steps.length:computeStep();return mission.steps[Math.min(state.step,mission.steps.length-1)]||null}
  function act(){
    if(state.completed){notify('MISSION 02 COMPLETE');return false}
    if(!state.accepted)return accept();
    sync(false);
    const step=currentStep();
    if(step?.activityId){
      const ok=window.TGGExpansion?.run?.(step.activityId);
      sync(true);
      return !!ok
    }
    if(state.step===4){window.TGGGame?.show?.('contentBoard');render();return true}
    if(state.step===5)return claim();
    return false
  }
  function choose(id){
    if(state.step!==4||!['djv','kane'].includes(id))return false;
    state.choice=id;save();
    notify(id==='djv'?'DJ V BACKS THE NEXT MOVE':'KANE BACKS THE NEXT MOVE');
    sync(true);return true
  }
  function claim(){
    sync(false);
    if(state.step!==5||state.rewardClaimed)return false;
    const bonus=state.choice==='kane'?{cash:150,xp:0,rep:10}:{cash:0,xp:50,rep:10};
    const total={cash:mission.reward.cash+bonus.cash,xp:mission.reward.xp+bonus.xp,rep:mission.reward.rep+bonus.rep};
    const applied=window.TGGEconomy?.apply?.(total)||total;
    state.rewardClaimed=true;state.completed=true;state.step=mission.steps.length;save();
    notify('MISSION 02 COMPLETE — +$'+applied.cash+' / +'+applied.xp+' XP / +'+applied.rep+' REP');
    render();return true
  }
  function sync(shouldRender=true){if(state.completed){if(shouldRender)render();return state}const next=computeStep();if(next!==state.step){state.step=next;save()}if(shouldRender)render();return state}
  function render(){
    const card=document.getElementById('missionTwoCard');
    const status=document.getElementById('missionTwoStatus');
    const button=document.getElementById('missionTwoBtn');
    const choices=document.getElementById('missionTwoChoices');
    if(!card||!status||!button)return;
    card.hidden=!missionOneDone()&&!state.accepted;
    if(card.hidden)return;
    if(state.completed){status.textContent='COMPLETE • '+(state.choice==='djv'?'DJ V':'Kane')+' is locked in for the next chapter.';button.textContent='MISSION COMPLETE';button.disabled=true;if(choices)choices.hidden=true;return}
    const step=currentStep();
    status.textContent=state.accepted?'STEP '+(Math.min(state.step+1,mission.steps.length))+'/'+mission.steps.length+' • '+step.label+' — '+step.detail:mission.summary;
    button.disabled=false;
    button.textContent=!state.accepted?'ACCEPT MISSION 02':state.step===5?'RETURN TO M / CLAIM':state.step===4?'CHOOSE YOUR BACKING':'RUN '+step.label.toUpperCase();
    if(choices)choices.hidden=state.step!==4;
  }

  document.getElementById('missionTwoBtn')?.addEventListener('click',act);
  document.querySelectorAll('[data-mission-two-choice]').forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.missionTwoChoice)));
  load();
  window.TGGStoryMission02={mission,state,load,save,accept,act,choose,claim,sync,currentStep,render};
  render();
})();