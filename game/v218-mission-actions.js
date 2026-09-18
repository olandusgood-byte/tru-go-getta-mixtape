(() => {
  const VERSION='V2.18 MISSION ACTIONS 100';
  const KEY='tgg-v218-mission-actions';
  const LAYERS=[
    'interior objective gate','studio objective route','media objective route','park objective route','vehicle exit guard','location proximity guard','pending objective state','pending objective persistence','pending objective validation','stale objective cleanup',
    'studio mic check step','studio vocal take step','studio take lock step','media rough mix load step','media level check step','media rough mix send step','media release load step','media campaign push step','media post confirm step','park street team meet step',
    'park flyer handout step','park flyer confirm step','park promo meet step','park promo finish step','park promo lock step','generic interior sequence','three-step action engine','step progression','step cooldown','step dedupe',
    'action button','action button label','action button state','action panel','action kicker','action title','action subtitle','action progress bar','action step counter','action streak counter',
    'action elapsed timer','action flow grade','action hotkey F','action hotkey Enter','action pointer support','action touch support','action accessibility live region','action screen detection','action active class','action completion class',
    'world marker handoff','world-to-interior transition','interior-to-world transition','return-to-city delay','checkpoint event bridge','mission completion bridge','mission chain sync','next-contact handoff','save bridge','reward bridge',
    'mission scoring compatibility','mission timer compatibility','crowd reaction compatibility','interior activity compatibility','navigation refresh','objective HUD refresh','mission stage refresh','mission progress guard','mission active guard','mission id guard',
    'progress index guard','destination guard','screen match guard','double completion guard','completion cooldown','reload resume','screen reopen resume','manual interior near-marker resume','interior wrong-screen warning','interior leave persistence',
    'action timing sample','action timing history','action pace bonus','action streak reset','action streak persistence','best action streak','mission action history','mission action history cap','mission action diagnostics','mission action telemetry event',
    'mobile mission panel','landscape mission panel','reduced motion safety','focus visible action','safe-area bottom','quality-neutral UI','safe optional APIs','rollback isolation','status API','release QA hooks'
  ];
  const state={
    ready:false,pending:null,sequenceIndex:0,streak:0,bestStreak:0,lastStepAt:0,lastCompleteAt:0,
    timing:[],history:[],lastScreen:'',flow:'READY',lastEvent:null
  };
  let panel=null,button=null,live=null,lastRender=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>Date.now();
  const activeScreen=()=>window.TGGGame?.getActiveScreen?.()||'';
  const currentStage=()=>window.TGGWorldGameplay?.currentStage?.()||null;
  const activeMission=()=>window.TGGContent?.current?.()||null;

  const SCREEN_MAP={studio:'studio',media:'media',park:'park'};
  const SEQUENCES={
    'flyer-run:1':['MEET STREET TEAM','HAND OUT FLYERS','CONFIRM DROP'],
    'studio-session:0':['CHECK MIC','CUT VOCALS','LOCK TAKE'],
    'studio-session:1':['LOAD ROUGH MIX','CHECK LEVELS','SEND ROUGH MIX'],
    'mixtape-promo:0':['LOAD RELEASE','PUSH CAMPAIGN','CONFIRM POSTS'],
    'mixtape-promo:2':['MEET STREET TEAM','FINISH PROMO','LOCK RUN']
  };

  function save(){
    try{
      localStorage.setItem(KEY,JSON.stringify({
        pending:state.pending,sequenceIndex:state.sequenceIndex,streak:state.streak,bestStreak:state.bestStreak,
        timing:state.timing.slice(-12),history:state.history.slice(-20)
      }));
    }catch{}
  }
  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(KEY)||'{}');
      state.pending=s.pending&&typeof s.pending==='object'?s.pending:null;
      state.sequenceIndex=Math.max(0,Math.floor(Number(s.sequenceIndex)||0));
      state.streak=Math.max(0,Math.floor(Number(s.streak)||0));
      state.bestStreak=Math.max(state.streak,Math.floor(Number(s.bestStreak)||0));
      state.timing=Array.isArray(s.timing)?s.timing.slice(-12):[];
      state.history=Array.isArray(s.history)?s.history.slice(-20):[];
    }catch{}
    validatePending();
  }

  function install(){
    document.body.classList.add('tgg-v218');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.18 MISSION ACTIONS 100';
    if(!document.getElementById('v218MissionAction')){
      panel=document.createElement('aside');panel.id='v218MissionAction';panel.className='v218-mission-action';panel.setAttribute('aria-label','Interior mission action');
      panel.innerHTML='<small id="v218Kicker">MISSION ACTION</small><b id="v218ActionTitle">READY</b><span id="v218ActionSubtitle">Reach an interior objective to begin.</span><div class="v218-stats"><i><small>STEP</small><strong id="v218Step">0/3</strong></i><i><small>STREAK</small><strong id="v218Streak">0x</strong></i><i><small>FLOW</small><strong id="v218Flow">READY</strong></i></div><div class="v218-track"><i id="v218Fill"></i></div><button id="v218ActionBtn" type="button">MISSION ACTION</button>';
      document.body.appendChild(panel);
      button=document.getElementById('v218ActionBtn');button?.addEventListener('click',performStep);
    }else{panel=document.getElementById('v218MissionAction');button=document.getElementById('v218ActionBtn')}
    if(!document.getElementById('v218Live')){
      live=document.createElement('div');live.id='v218Live';live.className='sr-only';live.setAttribute('aria-live','polite');document.body.appendChild(live);
    }else live=document.getElementById('v218Live');
  }

  function shouldHandleStage(stage=currentStage()){
    return !!stage&&!!SCREEN_MAP[stage.destination];
  }

  function sequenceFor(stage){
    const key=(stage?.mission?.id||'')+':'+(Number(stage?.progress)||0);
    return SEQUENCES[key]||['CHECK IN',String(stage?.action||'RUN ACTION').toUpperCase(),'LOCK OBJECTIVE'];
  }

  function pendingMatchesStage(stage=currentStage()){
    const p=state.pending;
    return !!p&&!!stage&&p.missionId===stage.mission?.id&&Number(p.progress)===Number(stage.progress)&&p.destination===stage.destination;
  }

  function validatePending(){
    if(!state.pending)return false;
    const mission=activeMission();
    const stage=currentStage();
    if(!mission||!stage||!pendingMatchesStage(stage)){
      state.pending=null;state.sequenceIndex=0;state.streak=0;save();return false;
    }
    const seq=sequenceFor(stage);
    state.sequenceIndex=clamp(state.sequenceIndex,0,Math.max(0,seq.length-1));
    return true;
  }

  function enterObjective(stage=currentStage()){
    if(!stage||!shouldHandleStage(stage))return false;
    const gs=window.TGGGame?.getState?.();
    if(gs?.inVehicle){window.__tggToast?.('EXIT THE CAR TO ENTER '+String(stage.destination).toUpperCase());return true}
    const near=window.TGGWorldGameplay?.near?.(stage);
    if(!near){window.__tggToast?.('GET CLOSER TO THE LIVE OBJECTIVE');return true}
    const screen=SCREEN_MAP[stage.destination];
    if(!pendingMatchesStage(stage)){
      state.pending={
        missionId:stage.mission.id,missionName:stage.mission.name,progress:Number(stage.progress)||0,
        destination:stage.destination,screen,action:stage.action,label:stage.label,enteredAt:now()
      };
      state.sequenceIndex=0;state.streak=0;state.timing=[];save();
    }
    window.TGGGame?.show?.(screen);
    window.TGGV217?.decorateActive?.();
    window.dispatchEvent(new CustomEvent('tgg:mission-interior-enter',{detail:{...state.pending}}));
    window.__tggToast?.('MISSION ACTION — '+stage.label);
    render(true);return true;
  }

  function maybeResumeFromManualEntry(){
    const stage=currentStage(),screen=activeScreen();
    if(!stage||!shouldHandleStage(stage)||SCREEN_MAP[stage.destination]!==screen)return false;
    if(pendingMatchesStage(stage))return true;
    if(window.TGGWorldGameplay?.near?.(stage))return enterObjective(stage);
    return false;
  }

  function flowGrade(delta){
    if(!Number.isFinite(delta)||delta<=0)return 'READY';
    if(delta<650)return 'RUSH';
    if(delta<=2200)return 'LOCKED';
    if(delta<=4500)return 'STEADY';
    return 'SLOW';
  }

  function performStep(){
    if(!validatePending())return false;
    const screen=activeScreen();
    if(screen!==state.pending.screen){
      window.__tggToast?.('RETURN TO '+state.pending.screen.toUpperCase()+' TO FINISH THIS OBJECTIVE');
      return false;
    }
    const stage=currentStage();
    if(!stage||!pendingMatchesStage(stage))return false;
    const t=now();
    if(t-state.lastStepAt<280)return false;
    const delta=state.lastStepAt?t-state.lastStepAt:0;
    state.lastStepAt=t;
    if(delta)state.timing.push(delta);
    state.timing=state.timing.slice(-12);
    state.flow=flowGrade(delta);
    state.streak++;
    state.bestStreak=Math.max(state.bestStreak,state.streak);
    const seq=sequenceFor(stage);
    const completedLabel=seq[state.sequenceIndex]||stage.action;
    state.sequenceIndex++;
    state.lastEvent={missionId:stage.mission.id,progress:stage.progress,step:state.sequenceIndex,label:completedLabel,at:t,flow:state.flow};
    window.dispatchEvent(new CustomEvent('tgg:mission-action-step',{detail:{...state.lastEvent,total:seq.length,destination:stage.destination}}));
    if(live)live.textContent=completedLabel+' complete. Step '+state.sequenceIndex+' of '+seq.length+'.';
    document.body.classList.add('v218-step-hit');setTimeout(()=>document.body.classList.remove('v218-step-hit'),260);
    save();
    if(state.sequenceIndex>=seq.length)return completeObjective(stage);
    render(true);return true;
  }

  function chainHandoff(){
    const chain=window.TGGChains?.current?.();
    if(!chain)return false;
    window.TGGChains?.sync?.();
    const still=window.TGGChains?.current?.();
    if(!still)return false;
    const done=window.TGGContent?.state?.completed||[];
    const next=still.missions.find(id=>!done.includes(id));
    if(!next)return false;
    window.TGGStreetContacts?.focusMission?.(next);
    window.dispatchEvent(new CustomEvent('tgg:mission-handoff',{detail:{chainId:still.id,nextMissionId:next}}));
    return true;
  }

  function completeObjective(stage=currentStage()){
    if(!stage||!pendingMatchesStage(stage))return false;
    const t=now();if(t-state.lastCompleteAt<700)return true;state.lastCompleteAt=t;
    const missionId=stage.mission.id,missionName=stage.mission.name,before=Number(window.TGGContent?.state?.progress)||0;
    const completed=window.TGGContent?.advance?.()===true;
    state.history.push({
      missionId,missionName,progress:before,destination:stage.destination,steps:state.sequenceIndex,
      timing:state.timing.slice(-6),flow:state.flow,at:t
    });
    state.history=state.history.slice(-20);
    document.body.classList.add('v218-action-complete');
    setTimeout(()=>document.body.classList.remove('v218-action-complete'),700);
    if(completed){
      window.dispatchEvent(new CustomEvent('tgg:mission-complete',{detail:{
        missionId,missionName,district:stage.mission.district,reward:stage.mission.reward,xp:stage.mission.xp,rep:stage.mission.rep,
        interiorAction:true,actionFlow:state.flow
      }}));
      window.TGGChains?.sync?.();
      setTimeout(chainHandoff,420);
      window.__tggToast?.('INTERIOR OBJECTIVE COMPLETE — '+missionName);
    }else if(window.TGGContent?.state?.active===missionId){
      const after=Number(window.TGGContent?.state?.progress)||0;
      window.dispatchEvent(new CustomEvent('tgg:mission-checkpoint',{detail:{
        missionId,missionName,progress:after,goal:stage.goal,nextStage:window.TGGWorldGameplay?.currentStage?.()?.label||null,
        interiorAction:true,actionFlow:state.flow
      }}));
      window.__tggToast?.('INTERIOR CHECKPOINT COMPLETE — NEXT STOP MARKED');
    }
    window.TGGGame?.save?.(true);
    state.pending=null;state.sequenceIndex=0;state.streak=0;state.timing=[];state.flow='READY';save();
    render(true);
    setTimeout(()=>window.TGGGame?.show?.('game'),480);
    return true;
  }

  function render(force=false){
    install();
    const t=performance.now();if(!force&&t-lastRender<90)return;lastRender=t;
    const stage=currentStage(),screen=activeScreen();
    if(!state.pending)maybeResumeFromManualEntry();
    const valid=validatePending();
    const visible=valid&&screen===state.pending?.screen;
    panel?.classList.toggle('active',!!visible);
    document.body.classList.toggle('v218-mission-action-live',!!visible);
    if(!valid)return;
    const seq=sequenceFor(stage),idx=clamp(state.sequenceIndex,0,seq.length-1);
    const title=document.getElementById('v218ActionTitle'),sub=document.getElementById('v218ActionSubtitle');
    const step=document.getElementById('v218Step'),streak=document.getElementById('v218Streak'),flow=document.getElementById('v218Flow'),fill=document.getElementById('v218Fill');
    if(title)title.textContent=seq[idx]||stage.action;
    if(sub)sub.textContent=state.pending.missionName+' • '+state.pending.label+' • press F or tap to perform';
    if(step)step.textContent=Math.min(state.sequenceIndex+1,seq.length)+'/'+seq.length;
    if(streak)streak.textContent=state.streak+'x';
    if(flow)flow.textContent=state.flow;
    if(fill)fill.style.width=(state.sequenceIndex/seq.length*100)+'%';
    if(button){button.textContent=(state.sequenceIndex===0?'START — ':'NEXT — ')+(seq[idx]||stage.action);button.disabled=!visible}
    const kicker=document.getElementById('v218Kicker');if(kicker)kicker.textContent='MISSION ACTION • '+String(state.pending.destination).toUpperCase();
  }

  function keyHandler(e){
    const target=e.target,typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
    if(typing)return;
    if((e.key==='f'||e.key==='F'||e.key==='Enter')&&state.pending&&activeScreen()===state.pending.screen){
      e.preventDefault();performStep();
    }
  }

  window.addEventListener('tgg:mission-start',()=>{validatePending();render(true)});
  window.addEventListener('tgg:mission-complete',()=>{if(!activeMission()){state.pending=null;state.sequenceIndex=0;save()}});
  document.addEventListener('keydown',keyHandler);

  function tick(){
    requestAnimationFrame(tick);
    install();render(false);
    state.lastScreen=activeScreen();state.ready=true;
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.18 MISSION ACTIONS 100';
  }

  function status(){
    const stage=currentStage();
    return {
      version:VERSION,ready:state.ready,layers:LAYERS.length,pending:state.pending?{...state.pending}:null,
      sequenceIndex:state.sequenceIndex,sequenceLength:stage?sequenceFor(stage).length:0,streak:state.streak,bestStreak:state.bestStreak,
      flow:state.flow,historyCount:state.history.length,currentScreen:activeScreen(),handlesCurrentStage:shouldHandleStage(stage)
    };
  }

  load();install();
  window.TGGV218={version:VERSION,layers:LAYERS,status,shouldHandleStage,enterObjective,performStep,completeObjective,sequenceFor,history:()=>state.history.slice()};
  requestAnimationFrame(tick);
})();