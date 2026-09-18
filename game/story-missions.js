(() => {
  const KEY='tgg-story-missions-v1';
  const $=id=>document.getElementById(id);
  const defaultsChapter2=()=>({
    active:false,
    completed:false,
    step:0,
    startedAt:0,
    completedAt:0,
    baselines:null,
    flags:{manager:false,kane:false,director:false,visual:false},
    lastSync:0
  });
  const defaults=()=>({
    active:false,
    completed:false,
    step:0,
    startedAt:0,
    completedAt:0,
    baselines:null,
    lastSync:0,
    chapter2:defaultsChapter2()
  });
  let state=defaults();

  const firstSteps=[
    {id:'manager',title:'MEET M',detail:'Open the manager opportunity and lock in your first contract.',go:'phone'},
    {id:'job',title:'WORK THE CITY',detail:'Complete one city job for M.',go:'jobs'},
    {id:'studio',title:'LOCK IN',detail:'Record a new track in the studio.',go:'studio'},
    {id:'battle',title:'WIN THE ROOM',detail:'Win one rap battle.',go:'battle'},
    {id:'show',title:'TOUCH THE STAGE',detail:'Complete one live show.',go:'show'},
    {id:'mixtape',title:'DROP THE TAPE',detail:'Release your first mixtape.',go:'career'}
  ];

  const cityBuzzSteps=[
    {id:'manager-return',title:'BACK TO M',detail:'Meet M in the city and get the next move.',kind:'talk',talk:'manager',target:{label:'M — MANAGER',x:72,y:36,radius:6,color:'#ff466d'}},
    {id:'studio-arrival',title:'DRIVE TO STUDIO ROW',detail:'Take the car or walk to Studio Row.',kind:'arrive',target:{label:'STUDIO ROW',x:24,y:37,radius:7,color:'#ff466d'}},
    {id:'kane',title:'TALK TO KANE',detail:'Meet producer Kane outside the studio.',kind:'talk',talk:'kane',target:{label:'KANE — PRODUCER',x:24,y:37,radius:7,color:'#7b86ff'}},
    {id:'record',title:'CUT THE SINGLE',detail:'Enter the studio and record a new track.',kind:'metric',metric:'recordings',go:'studio',target:{label:'RECORDING STUDIO',x:24,y:37,radius:8,color:'#ff466d'}},
    {id:'cypher-arrival',title:'HIT DOWNTOWN',detail:'Get to the Downtown cypher block.',kind:'arrive',target:{label:'DOWNTOWN CYPHER',x:50,y:50,radius:7,color:'#c7ff00'}},
    {id:'battle',title:'TAKE THE CYPHER',detail:'Win a rap battle in Downtown.',kind:'metric',metric:'battleWins',go:'battle',target:{label:'DOWNTOWN CYPHER',x:50,y:50,radius:8,color:'#c7ff00'}},
    {id:'stage-arrival',title:'GET TO MIXTAPE AVE',detail:'Move across the city to the live-stage block.',kind:'arrive',target:{label:'MIXTAPE AVE STAGE',x:76,y:63,radius:7,color:'#48d7ff'}},
    {id:'show',title:'ROCK THE STAGE',detail:'Finish a live show and move the crowd.',kind:'metric',metric:'shows',go:'show',target:{label:'MIXTAPE AVE STAGE',x:76,y:63,radius:8,color:'#48d7ff'}},
    {id:'director',title:'LINK DIRECTOR K',detail:'Meet Director K at Media District.',kind:'talk',talk:'director',target:{label:'DIRECTOR K — MEDIA DISTRICT',x:50,y:89,radius:7,color:'#c56cff'}},
    {id:'visual',title:'SHOOT THE VISUAL',detail:'Enter Media District and shoot your first visual.',kind:'flag',flag:'visual',go:'media',target:{label:'MEDIA DISTRICT',x:50,y:89,radius:8,color:'#c56cff'}}
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
      state.chapter2={...defaultsChapter2(),...(saved.chapter2||{})};
      state.chapter2.flags={...defaultsChapter2().flags,...(saved.chapter2?.flags||{})};
    }catch(e){state=defaults();}
    if(!Number.isInteger(state.step))state.step=0;
    state.step=Math.max(0,Math.min(firstSteps.length,state.step));
    if(!Number.isInteger(state.chapter2.step))state.chapter2.step=0;
    state.chapter2.step=Math.max(0,Math.min(cityBuzzSteps.length,state.chapter2.step));
    return state;
  }

  function save(){
    state.lastSync=Date.now();
    state.chapter2.lastSync=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function notify(text){window.__tggToast?window.__tggToast(text):console.log(text)}
  function gameState(){return window.TGGGame?.getState?.()||{x:50,y:55}}
  function distanceTo(target){
    const g=gameState();
    return Math.hypot((Number(g.x)||50)-target.x,(Number(g.y)||55)-target.y);
  }
  function isNear(target){return !!target&&distanceTo(target)<=Number(target.radius||7)}

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

  function isFirstStepComplete(index,s=snapshot()){
    const b=state.baselines||{jobs:0,recordings:0,battleWins:0,shows:0,mixtapes:0};
    if(index===0)return s.managerContract||s.managerHistory;
    if(index===1)return s.jobs>b.jobs;
    if(index===2)return s.recordings>b.recordings;
    if(index===3)return s.battleWins>b.battleWins;
    if(index===4)return s.shows>b.shows;
    if(index===5)return s.mixtapes>b.mixtapes;
    return false;
  }

  function finishFirst(){
    if(state.completed)return;
    state.active=false;
    state.completed=true;
    state.step=firstSteps.length;
    state.completedAt=Date.now();
    save();
    window.TGGGame?.reward?.(1000,250);
    window.TGGCareer?.addRep?.(100);
    window.TGGProgression?.sync?.();
    notify('FIRST CONTRACT COMPLETE — +$1000 • +250 XP • +100 REP');
    render();
  }

  function syncFirst(){
    if(!state.active||state.completed)return state;
    let advanced=false;
    while(state.step<firstSteps.length&&isFirstStepComplete(state.step)){
      state.step++;
      advanced=true;
      if(state.step<firstSteps.length)notify('STORY ADVANCED — '+firstSteps[state.step].title);
    }
    if(state.step>=firstSteps.length)finishFirst();
    else if(advanced)save();
    return state;
  }

  function startChapter2(){
    if(!state.completed)return false;
    const c=state.chapter2;
    if(c.completed)return c;
    if(!c.active){
      const s=snapshot();
      c.active=true;
      c.step=0;
      c.startedAt=Date.now();
      c.baselines={recordings:s.recordings,battleWins:s.battleWins,shows:s.shows};
      c.flags={manager:false,kane:false,director:false,visual:false};
      save();
      notify('CHAPTER 2 STARTED — CITY BUZZ');
      window.TGGGame?.show?.('game');
    }
    render();
    return c;
  }

  function chapter2Complete(index,s=snapshot()){
    const c=state.chapter2;
    const step=cityBuzzSteps[index];
    if(!step)return false;
    if(step.kind==='arrive')return isNear(step.target);
    if(step.kind==='talk'){
      if(step.talk==='manager')return !!c.flags.manager;
      if(step.talk==='kane')return !!c.flags.kane;
      if(step.talk==='director')return !!c.flags.director;
    }
    if(step.kind==='flag')return !!c.flags[step.flag];
    if(step.kind==='metric'){
      const base=Number(c.baselines?.[step.metric])||0;
      return Number(s[step.metric])>base;
    }
    return false;
  }

  function finishChapter2(){
    const c=state.chapter2;
    if(c.completed)return;
    c.active=false;
    c.completed=true;
    c.step=cityBuzzSteps.length;
    c.completedAt=Date.now();
    save();
    window.TGGGame?.reward?.(1800,450);
    window.TGGCareer?.addRep?.(175);
    window.TGGProgression?.sync?.();
    notify('CITY BUZZ COMPLETE — +$1800 • +450 XP • +175 REP');
    render();
  }

  function syncChapter2(){
    const c=state.chapter2;
    if(!c.active||c.completed)return c;
    let advanced=false;
    let guard=0;
    while(c.step<cityBuzzSteps.length&&chapter2Complete(c.step)&&guard++<cityBuzzSteps.length){
      c.step++;
      advanced=true;
      if(c.step<cityBuzzSteps.length)notify('CITY BUZZ — '+cityBuzzSteps[c.step].title);
    }
    if(c.step>=cityBuzzSteps.length)finishChapter2();
    else if(advanced)save();
    return c;
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
    if(target==='media'){window.TGGGame?.show?.('media');return true}
    return false;
  }

  function doFirstCurrent(){
    if(!state.active&&!state.completed)start();
    if(state.completed)return false;
    const step=firstSteps[state.step];
    if(!step)return false;
    if(step.id==='manager'){
      const life=window.TGGWorldLife?.getState?.()||{};
      if(!life.activeOpportunity||life.activeOpportunity.contactId!=='manager'){
        window.TGGWorldLife?.callContact?.('manager');
      }
      window.TGGCareerDirector?.captureOpportunity?.();
      syncFirst();
      if(!isFirstStepComplete(0))go('phone');
      return true;
    }
    return go(step.go);
  }

  function talkChapter2(step){
    if(!isNear(step.target)){
      notify('FOLLOW THE STORY MARKER — '+step.target.label);
      window.TGGGame?.show?.('game');
      return false;
    }
    if(step.talk==='manager'){
      state.chapter2.flags.manager=true;
      notify('M: THE CITY IS WATCHING. GO LOCK IN WITH KANE.');
    }else if(step.talk==='kane'){
      state.chapter2.flags.kane=true;
      window.TGGWorldLife?.callContact?.('producer');
      notify('KANE: CUT SOMETHING THEY CANNOT IGNORE.');
    }else if(step.talk==='director'){
      state.chapter2.flags.director=true;
      window.TGGWorldLife?.callContact?.('director');
      notify('DIRECTOR K: BRING THE RECORD TO LIFE.');
    }
    save();
    syncChapter2();
    render();
    return true;
  }

  function doChapter2Current(){
    const c=state.chapter2;
    if(!c.active&&!c.completed)return startChapter2();
    if(c.completed)return false;
    const step=cityBuzzSteps[c.step];
    if(!step)return false;

    if(step.kind==='arrive'){
      if(isNear(step.target)){syncChapter2();return true;}
      window.TGGGame?.show?.('game');
      notify('FOLLOW THE MARKER — '+step.target.label);
      return true;
    }
    if(step.kind==='talk')return talkChapter2(step);
    if(step.kind==='metric'||step.kind==='flag'){
      if(step.target&&!isNear(step.target)){
        window.TGGGame?.show?.('game');
        notify('GET TO '+step.target.label+' FIRST');
        return true;
      }
      if(step.go)return go(step.go);
    }
    return false;
  }

  function doCurrent(){
    if(state.chapter2.active)return doChapter2Current();
    if(state.completed&&!state.chapter2.completed)return startChapter2();
    if(state.chapter2.completed)return false;
    return doFirstCurrent();
  }

  function reset(){
    if(state.chapter2.active||state.chapter2.completed){
      state.chapter2=defaultsChapter2();
      save();
      render();
      notify('CITY BUZZ RESET');
      return state.chapter2;
    }
    state=defaults();
    save();
    render();
    notify('FIRST CONTRACT RESET');
    return state;
  }

  function firstStatus(){
    const current=firstSteps[state.step]||null;
    return {
      chapter:1,
      chapterName:'FIRST CONTRACT',
      ...state,
      current,
      progress:Math.min(100,Math.round((state.step/firstSteps.length)*100)),
      steps:firstSteps.map((x,i)=>({...x,done:i<state.step,active:state.active&&i===state.step}))
    };
  }

  function chapter2Status(){
    const c=state.chapter2;
    const current=cityBuzzSteps[c.step]||null;
    return {
      chapter:2,
      chapterName:'CITY BUZZ',
      ...c,
      current,
      progress:Math.min(100,Math.round((c.step/cityBuzzSteps.length)*100)),
      steps:cityBuzzSteps.map((x,i)=>({...x,done:i<c.step,active:c.active&&i===c.step}))
    };
  }

  function status(){
    return state.chapter2.active||state.chapter2.completed?chapter2Status():firstStatus();
  }

  function navigationTarget(){
    const c=state.chapter2;
    if(!c.active||c.completed)return null;
    const step=cityBuzzSteps[c.step];
    if(!step?.target)return null;
    return {
      label:'CITY BUZZ • '+step.target.label,
      x:step.target.x,
      y:step.target.y,
      radius:step.target.radius,
      color:step.target.color||'#c7ff00',
      arrived:isNear(step.target),
      step:c.step,
      id:step.id
    };
  }

  function ensureWorldHud(){
    const city=document.querySelector('#game .city');
    if(!city)return null;
    let root=$('storyWorldHud');
    if(!root){
      root=document.createElement('div');
      root.id='storyWorldHud';
      root.className='story-world-hud';
      root.innerHTML='<small id="storyWorldChapter">CHAPTER 2</small><b id="storyWorldTitle">CITY BUZZ</b><span id="storyWorldDetail">FOLLOW THE MARKER</span><em id="storyWorldDistance"></em><button id="storyWorldAction" type="button">INTERACT</button>';
      city.appendChild(root);
      $('storyWorldAction')?.addEventListener('click',doChapter2Current);
    }
    if(!document.getElementById('storyWorldStyles')){
      const style=document.createElement('style');
      style.id='storyWorldStyles';
      style.textContent=`
        .story-world-hud{position:absolute;left:18px;bottom:18px;z-index:18;width:min(360px,calc(100% - 36px));padding:14px 15px;border:1px solid #c7ff0045;border-radius:16px;background:linear-gradient(145deg,#090d14f2,#05070bf2);box-shadow:0 18px 44px #0009,inset 0 1px #ffffff10;display:none;gap:4px;backdrop-filter:blur(12px)}
        .story-world-hud.active{display:grid}.story-world-hud small{font-size:8px;letter-spacing:.17em;color:#c7ff00}.story-world-hud b{font-size:16px}.story-world-hud span{font-size:10px;line-height:1.35;color:#aeb6c5}.story-world-hud em{font-style:normal;font-weight:900;font-size:9px;color:#fff}.story-world-hud button{margin-top:7px;min-height:42px;border-color:#c7ff0060;background:#c7ff00;color:#050607;font-weight:950}
        @media(max-width:760px){.story-world-hud{left:10px;bottom:10px;width:min(310px,calc(100% - 20px));padding:11px 12px}.story-world-hud b{font-size:14px}.story-world-hud button{min-height:46px}}
      `;
      document.head.appendChild(style);
    }
    return root;
  }

  function renderWorldHud(){
    const root=ensureWorldHud();
    if(!root)return;
    const c=state.chapter2;
    const step=cityBuzzSteps[c.step];
    const visible=!!c.active&&!c.completed&&!!step&&window.TGGGame?.getActiveScreen?.()==='game';
    root.classList.toggle('active',visible);
    if(!visible)return;
    const near=step.target?isNear(step.target):false;
    $('storyWorldChapter') && ($('storyWorldChapter').textContent='CHAPTER 2 • '+(c.step+1)+'/'+cityBuzzSteps.length);
    $('storyWorldTitle') && ($('storyWorldTitle').textContent=step.title);
    $('storyWorldDetail') && ($('storyWorldDetail').textContent=step.detail);
    $('storyWorldDistance') && ($('storyWorldDistance').textContent=step.target?(near?'AT OBJECTIVE':Math.round(distanceTo(step.target)*3.2)+' m TO '+step.target.label):'OBJECTIVE ACTIVE');
    const button=$('storyWorldAction');
    if(button){
      const action=step.kind==='talk'?'TALK':step.go==='studio'?'ENTER STUDIO':step.go==='battle'?'START CYPHER':step.go==='show'?'START SHOW':step.go==='media'?'ENTER MEDIA':'INTERACT';
      button.textContent=near?action:'FOLLOW MARKER';
    }
  }

  function render(){
    const root=$('storyMissionsBoard');
    if(!root){renderWorldHud();return;}
    const st=status();
    const title=$('storyMissionTitle');
    const detail=$('storyMissionDetail');
    const progress=$('storyMissionProgress');
    const label=$('storyMissionProgressLabel');
    const list=$('storyMissionSteps');
    const action=$('storyMissionAction');

    const firstComplete=state.completed&&!state.chapter2.active&&!state.chapter2.completed;
    if(title)title.textContent=st.completed?(st.chapter===2?'CITY BUZZ COMPLETE':'FIRST CONTRACT COMPLETE'):(st.current?.title||st.chapterName);
    if(detail)detail.textContent=st.completed
      ?(st.chapter===2?'Your name is moving through every side of the city.':'You built your first complete artist run through the city.')
      :st.active?(st.current?.detail||'Keep moving.'):'Start the connected career storyline.';
    if(progress)progress.style.width=st.progress+'%';
    if(label)label.textContent=st.completed?'100% COMPLETE':st.progress+'% COMPLETE';

    if(list)list.innerHTML=st.steps.map((x,i)=>
      '<article class="story-step '+(x.done?'done ':'')+(x.active?'active':'')+'">'+
      '<span>'+(x.done?'✓':String(i+1).padStart(2,'0'))+'</span>'+
      '<div><b>'+x.title+'</b><small>'+x.detail+'</small></div>'+
      '</article>'
    ).join('');

    if(action){
      if(firstComplete){
        action.textContent='START CHAPTER 2 — CITY BUZZ';
        action.disabled=false;
      }else if(state.chapter2.completed){
        action.textContent='STORY COMPLETE';
        action.disabled=true;
      }else{
        action.textContent=st.active?'GO TO '+(st.current?.title||'NEXT STEP'):'START '+st.chapterName;
        action.disabled=false;
      }
    }

    const resetBtn=$('storyMissionReset');
    if(resetBtn){
      resetBtn.classList.toggle('hidden',!st.active&&!st.completed);
      resetBtn.textContent=state.chapter2.active||state.chapter2.completed?'RESET CITY BUZZ':'RESET STORY';
    }
    renderWorldHud();
  }

  function sync(){
    syncFirst();
    syncChapter2();
    render();
    return state;
  }

  function bind(){
    ensureWorldHud();
    $('storyMissionsBtn')?.addEventListener('click',()=>{
      window.TGGGame?.show?.('storyMissionsBoard');
      sync();
    });
    $('storyMissionBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    $('storyMissionAction')?.addEventListener('click',doCurrent);
    $('storyMissionReset')?.addEventListener('click',reset);

    document.querySelector('[data-media="video"]')?.addEventListener('click',()=>{
      const c=state.chapter2;
      const step=cityBuzzSteps[c.step];
      if(c.active&&step?.id==='visual'&&isNear(step.target)){
        c.flags.visual=true;
        save();
        syncChapter2();
        render();
      }
    });

    setInterval(sync,700);
    render();
  }

  window.TGGStoryMissions={
    start,startChapter2,sync,go,doCurrent,reset,status,render,snapshot,
    navigationTarget,
    chapters:{
      firstContract:firstSteps.map(x=>({...x})),
      cityBuzz:cityBuzzSteps.map(x=>({...x}))
    }
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();